import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { supabase } from './supabase.client';
import { StatementImportService, EmailAttachment } from './statement-import.service';

/**
 * Discover statement PDFs in the user's Outlook / Microsoft 365 mailbox and
 * stage them on matching accounts. Uses Supabase Azure (Microsoft) sign-in for
 * a Mail.Read token, then the `outlook-statements` + `parse-statement` funcs.
 *
 * Beta: encrypted PDFs are staged unparsed — open them and enter the password.
 */
@Injectable({ providedIn: 'root' })
export class OutlookService {
  private auth = inject(AuthService);
  private importer = inject(StatementImportService);

  get available(): boolean {
    return this.auth.configured && !!this.auth.user();
  }

  private async msToken(): Promise<string | null> {
    const cached = this.auth.providerToken();
    if (cached) return cached;
    const { data } = await supabase().auth.getSession();
    return (data.session as { provider_token?: string } | null)?.provider_token ?? null;
  }

  async connectMicrosoft(): Promise<void> {
    await supabase().auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid email offline_access https://graph.microsoft.com/Mail.Read',
        redirectTo: location.origin + location.pathname,
      },
    });
  }

  async importStatements(fromISO?: string, toISO?: string): Promise<string> {
    if (!this.available) return 'Enable cloud sync and sign in first.';
    const token = await this.msToken();
    if (!token) { await this.connectMicrosoft(); return 'Redirecting to Microsoft to authorize Outlook…'; }

    const { data, error } = await supabase().functions.invoke('outlook-statements', {
      body: { accessToken: token, fromISO, toISO },
    });
    if (error) return 'Outlook fetch failed: ' + error.message;
    const res = data as { attachments?: EmailAttachment[]; error?: string; scanned?: number };
    if (res.error) return res.error;
    const attachments = res.attachments ?? [];
    if (!attachments.length) return `Scanned ${res.scanned ?? 0} emails in range — no PDF attachments found.`;
    return this.importer.stage(attachments);
  }
}
