import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { supabase } from './supabase.client';
import { uid } from './sample-data';

interface EmailAttachment { fileName: string; contentBase64: string; from: string; date: string; }

/**
 * Discover statement PDFs in the user's Gmail and stage them on matching
 * accounts. Uses Supabase Google sign-in for a gmail.readonly token, then the
 * `gmail-statements` + `parse-statement` Edge Functions.
 *
 * Beta: most bank PDFs are password-protected, so attachments that need a
 * password are staged unparsed — open them from the account and enter the
 * password to parse. Unencrypted statements parse automatically.
 */
@Injectable({ providedIn: 'root' })
export class GmailService {
  private auth = inject(AuthService);
  private store = inject(DataService);

  get available(): boolean {
    return this.auth.configured && !!this.auth.user();
  }

  /** Ensure we have a Google token; if not, start Google OAuth (redirects away). */
  private async googleToken(): Promise<string | null> {
    const { data } = await supabase().auth.getSession();
    const t = (data.session as { provider_token?: string } | null)?.provider_token;
    return t ?? null;
  }

  async connectGoogle(): Promise<void> {
    await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        redirectTo: location.origin + location.pathname,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  }

  /** Fetch statement attachments and stage/parse them onto matching accounts. */
  async importStatements(): Promise<string> {
    if (!this.available) return 'Enable cloud sync and sign in first.';
    const token = await this.googleToken();
    if (!token) { await this.connectGoogle(); return 'Redirecting to Google to authorize Gmail…'; }

    const { data, error } = await supabase().functions.invoke('gmail-statements', { body: { accessToken: token } });
    if (error) return 'Gmail fetch failed: ' + error.message;
    const res = data as { attachments?: EmailAttachment[]; error?: string; scanned?: number };
    if (res.error) return res.error;
    const attachments = res.attachments ?? [];
    if (!attachments.length) return `Scanned ${res.scanned ?? 0} emails — no statement PDFs found.`;

    let staged = 0, parsed = 0, unmatched = 0;
    for (const att of attachments) {
      const acc = this.matchAccount(att);
      if (!acc) { unmatched++; continue; }
      // try to parse without a password (works for unencrypted PDFs)
      let txns: any[] = []; let total = 0; let didParse = false;
      try {
        const p = await supabase().functions.invoke('parse-statement', {
          body: { fileName: att.fileName, contentBase64: att.contentBase64 },
        });
        const pr = p.data as { parsed?: boolean; txns?: any[]; total?: number };
        if (pr?.parsed) { txns = pr.txns ?? []; total = pr.total ?? 0; didParse = true; }
      } catch { /* leave unparsed */ }

      this.store.addStatement({
        id: uid(), accountId: acc.id, scope: acc.kind === 'creditcard' ? 'card' : 'bank',
        pwFormat: acc.pwFormat, period: att.fileName.replace(/\.[^.]+$/, ''),
        total, fileName: att.fileName, txns, parsed: didParse, uploadedAt: Date.now(),
      });
      staged++; if (didParse) parsed++;
    }
    return `From ${attachments.length} attachment(s): staged ${staged} (${parsed} auto-parsed), ${unmatched} unmatched. Encrypted PDFs staged unparsed — open them and enter the password.`;
  }

  /** Match an attachment to an account by institution keyword in filename/sender. */
  private matchAccount(att: EmailAttachment) {
    const hay = (att.fileName + ' ' + att.from).toLowerCase();
    return this.store.data().accounts.find((a) => {
      const first = a.institution.toLowerCase().split(' ')[0];
      return first.length > 2 && hay.includes(first);
    });
  }
}
