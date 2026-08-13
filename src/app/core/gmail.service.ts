import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { supabase } from './supabase.client';
import { StatementImportService, EmailAttachment } from './statement-import.service';

/**
 * Discover statement PDFs in the user's Gmail and stage them on matching
 * accounts. Uses Supabase Google sign-in for a gmail.readonly token, then the
 * `gmail-statements` + `parse-statement` Edge Functions. Staging (matching +
 * password prompt + parse) is shared with Outlook via StatementImportService.
 */
@Injectable({ providedIn: 'root' })
export class GmailService {
  private auth = inject(AuthService);
  private importer = inject(StatementImportService);

  get available(): boolean {
    return this.auth.configured && !!this.auth.user();
  }

  private async googleToken(): Promise<string | null> {
    const cached = this.auth.providerToken();
    if (cached) return cached;
    const { data } = await supabase().auth.getSession();
    return (data.session as { provider_token?: string } | null)?.provider_token ?? null;
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
  async importStatements(fromISO?: string, toISO?: string): Promise<string> {
    if (!this.available) return 'Enable cloud sync and sign in first.';
    const token = await this.googleToken();
    if (!token) { await this.connectGoogle(); return 'Redirecting to Google to authorize Gmail…'; }

    const { data, error } = await supabase().functions.invoke('gmail-statements', {
      body: { accessToken: token, fromISO, toISO },
    });
    if (error) return 'Gmail fetch failed: ' + error.message;
    const res = data as { attachments?: EmailAttachment[]; error?: string; scanned?: number };
    if (res.error) return res.error;
    const attachments = res.attachments ?? [];
    if (!attachments.length) return `Scanned ${res.scanned ?? 0} emails in range — no PDF attachments found.`;
    return this.importer.stage(attachments);
  }
}
