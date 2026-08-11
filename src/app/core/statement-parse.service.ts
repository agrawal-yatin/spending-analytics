import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { supabase } from './supabase.client';
import { parseCsvStatement } from './finance';
import { Transaction } from './models';

export interface ParseResult {
  txns: Transaction[];
  total: number;
  parsed: boolean;
  note?: string;
}

/**
 * Parses an uploaded statement into categorized transactions.
 * - Cloud mode (signed in): calls the `parse-statement` Edge Function, which
 *   can unlock password-protected PDFs and parse them server-side.
 * - Local mode: parses CSV in the browser; PDFs can't be unlocked client-side.
 */
@Injectable({ providedIn: 'root' })
export class StatementParseService {
  private auth = inject(AuthService);

  /** True when the Edge Function is reachable (Supabase configured + signed in). */
  cloudActive(): boolean {
    return this.auth.configured && !!this.auth.user();
  }

  async parse(file: File, password?: string): Promise<ParseResult> {
    const isCsv = /\.(csv|txt)$/i.test(file.name);

    if (this.cloudActive()) {
      try {
        const contentBase64 = await fileToBase64(file);
        const { data, error } = await supabase().functions.invoke('parse-statement', {
          body: { fileName: file.name, contentBase64, password },
        });
        if (error) return { txns: [], total: 0, parsed: false, note: 'Server parse failed: ' + error.message };
        const r = data as ParseResult & { error?: string };
        if (r.error) return { txns: [], total: 0, parsed: false, note: r.error };
        return { txns: r.txns ?? [], total: r.total ?? 0, parsed: !!r.parsed, note: r.note };
      } catch (e) {
        return { txns: [], total: 0, parsed: false, note: 'Server parse error: ' + String(e) };
      }
    }

    // Local fallback
    if (isCsv) {
      const text = await file.text();
      const r = parseCsvStatement(text);
      return { txns: r.txns, total: r.total, parsed: r.txns.length > 0 };
    }
    return { txns: [], total: 0, parsed: false, note: 'PDF unlocking runs server-side — enable cloud sync to parse PDFs.' };
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}
