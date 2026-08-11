import { Component, inject } from '@angular/core';
import { DataService } from '../core/data.service';
import { fmtINR } from '../core/finance';
import { Account } from '../core/models';
import { uid } from '../core/sample-data';
import { StatementParseService } from '../core/statement-parse.service';

@Component({
  selector: 'app-cards',
  standalone: true,
  template: `
    <div class="card">
      <div class="tbl-head">
        <div><h2>Credit Cards</h2><p class="sub" style="margin:0">Upload statements — CSV parses live; encrypted PDFs unlock server-side in production</p></div>
      </div>

      @for (c of cards(); track c.id) {
        <div class="card" style="background:#fcfcfd">
          <div class="tbl-head">
            <div><b style="font-size:16px">💳 {{ c.institution }}</b>
              <div style="font-size:12px;color:var(--muted)">{{ store.personName(c.personId) }} @if (c.panId) { <span class="pan-tag">{{ store.panLabel(c.panId) }}</span> }</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Outstanding</div>
              <div style="font-size:20px;font-weight:800;color:var(--red)">{{ f(c.balance) }}</div>
            </div>
          </div>

          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
            <label class="btn primary sm" style="cursor:pointer">
              ⬆ Upload statement
              <input type="file" accept=".csv,.txt,.pdf" hidden (change)="upload($event, c)">
            </label>
            <span style="font-size:12px;color:var(--muted)">Password: {{ c.pwFormat || pwHint(c.institution) || 'set in Accounts' }}</span>
          </div>

          @for (s of store.statementsFor(c.id); track s.id) {
            <div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
                <div><b>{{ s.period || s.fileName }}</b>
                  <span class="chip" [class.green]="s.parsed" [class.muted]="!s.parsed" style="margin-left:6px">{{ s.parsed ? 'parsed' : 'stored' }}</span>
                  <div style="font-size:12px;color:var(--muted)">{{ s.fileName }} @if (s.txns.length) { · {{ s.txns.length }} txns }</div>
                </div>
                <div style="text-align:right">
                  @if (s.total) { <div style="font-weight:800">{{ f(s.total) }}</div><div style="font-size:11px;color:var(--muted)">total spend</div> }
                  <button class="btn ghost sm" (click)="store.removeStatement(s.id)">Remove</button>
                </div>
              </div>
            </div>
          } @empty { <div class="empty" style="padding:12px">No statements uploaded yet.</div> }
        </div>
      } @empty { <div class="empty">No credit cards yet. Add one in the Accounts tab (type: Credit Card).</div> }
    </div>
  `,
})
export class CardsComponent {
  store = inject(DataService);
  private parseSvc = inject(StatementParseService);
  f = fmtINR;

  cards() { return this.store.accountsInScope().filter((a) => a.kind === 'creditcard'); }
  pwHint(inst: string) {
    const first = inst.toLowerCase().split(' ')[0];
    return this.store.settings().pwFormats.find((p) => p.bank.toLowerCase().split(' ')[0] === first)?.fmt ?? '';
  }

  async upload(e: Event, card: Account) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = ''; // allow re-uploading the same file

    // For encrypted PDFs in cloud mode, collect the actual password (hint = format).
    let password: string | undefined;
    if (/\.pdf$/i.test(file.name) && this.parseSvc.cloudActive()) {
      const hint = card.pwFormat || this.pwHint(card.institution) || 'see your bank';
      password = window.prompt(`Password to unlock ${card.institution} statement\n(format: ${hint})`) || undefined;
    }

    const res = await this.parseSvc.parse(file, password);
    this.store.addStatement({
      id: uid(), accountId: card.id, scope: 'card', pwFormat: card.pwFormat,
      period: file.name.replace(/\.[^.]+$/, ''), total: res.total,
      fileName: file.name, txns: res.txns, parsed: res.parsed, uploadedAt: Date.now(),
    });
    if (res.note) alert(res.note);
  }
}
