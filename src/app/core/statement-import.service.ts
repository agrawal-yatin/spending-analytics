import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import { supabase } from './supabase.client';
import { uid } from './sample-data';

export interface EmailAttachment { fileName: string; contentBase64: string; from: string; date: string; }

/**
 * Shared staging step for email-imported statements (Gmail + Outlook).
 * Matches each attachment to an account, parses it via the parse-statement
 * Edge Function, and — for encrypted PDFs that don't parse on the first try —
 * prompts for the password and retries. Bytes are never persisted.
 */
@Injectable({ providedIn: 'root' })
export class StatementImportService {
  private store = inject(DataService);

  async stage(attachments: EmailAttachment[]): Promise<string> {
    if (!attachments.length) return 'No statement PDFs found.';
    let staged = 0, parsed = 0;
    const unmatched: string[] = [];

    for (const att of attachments) {
      const acc = this.match(att);
      if (!acc) { unmatched.push(att.fileName); continue; }

      // First attempt without a password.
      let res = await this.parse(att.fileName, att.contentBase64);

      // Encrypted PDF? Prompt for the password (hint = bank format) and retry.
      if (!res.parsed && /\.pdf$/i.test(att.fileName)) {
        const hint = acc.pwFormat || this.pwHint(acc.institution) || 'see your bank';
        const pw = window.prompt(`Password to unlock "${att.fileName}" from ${acc.institution}\n(format: ${hint})\n\nLeave blank to skip.`);
        if (pw) res = await this.parse(att.fileName, att.contentBase64, pw);
      }

      this.store.addStatement({
        id: uid(), accountId: acc.id, scope: acc.kind === 'creditcard' ? 'card' : 'bank',
        pwFormat: acc.pwFormat, period: att.fileName.replace(/\.[^.]+$/, ''),
        total: res.total, fileName: att.fileName, txns: res.txns, parsed: res.parsed, uploadedAt: Date.now(),
      });
      staged++; if (res.parsed) parsed++;
    }

    let msg = `Staged ${staged} statement(s) — ${parsed} parsed into transactions.`;
    if (unmatched.length) {
      msg += ` ${unmatched.length} didn't match any account (${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}). ` +
        `Rename an account to match how the bank appears in the file/sender, then re-run.`;
    }
    return msg;
  }

  private async parse(fileName: string, contentBase64: string, password?: string):
    Promise<{ parsed: boolean; txns: any[]; total: number }> {
    try {
      const { data, error } = await supabase().functions.invoke('parse-statement', {
        body: { fileName, contentBase64, password },
      });
      if (error) return { parsed: false, txns: [], total: 0 };
      const r = data as { parsed?: boolean; txns?: any[]; total?: number };
      return { parsed: !!r.parsed, txns: r.txns ?? [], total: r.total ?? 0 };
    } catch {
      return { parsed: false, txns: [], total: 0 };
    }
  }

  private match(att: EmailAttachment) {
    const hay = (att.fileName + ' ' + att.from).toLowerCase();
    return this.store.data().accounts.find((a) => {
      const first = a.institution.toLowerCase().split(' ')[0];
      return first.length > 2 && hay.includes(first);
    });
  }

  private pwHint(inst: string): string {
    const first = inst.toLowerCase().split(' ')[0];
    return this.store.settings().pwFormats.find((p) => p.bank.toLowerCase().split(' ')[0] === first)?.fmt ?? '';
  }
}
