import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../core/data.service';
import { fmtINR } from '../core/finance';
import { Account, AccountKind, ACCOUNT_KIND_LABEL, Currency } from '../core/models';

type Draft = Partial<Account>;

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="card">
      <div class="tbl-head">
        <div><h2>Accounts</h2><p class="sub" style="margin:0">Bank, Demat, trading, wallets</p></div>
        <button class="btn primary" (click)="add()">+ Add account</button>
      </div>

      @if (rows().length) {
        <table>
          <thead><tr><th>Institution</th><th>Type</th><th>Owner / PAN</th><th class="num">Balance</th><th class="num">In ₹</th><th></th></tr></thead>
          <tbody>
            @for (a of rows(); track a.id) {
              <tr>
                <td><b>{{ a.institution }}</b></td>
                <td><span class="chip">{{ label(a.kind) }}</span></td>
                <td>{{ store.personName(a.personId) }} @if (a.panId) { <span class="pan-tag">{{ store.panLabel(a.panId) }}</span> }</td>
                <td class="num">{{ a.currency }} {{ a.balance | number }}</td>
                <td class="num" [style.color]="store.accountINR(a) < 0 ? 'var(--red)' : 'var(--ink)'"><b>{{ f(store.accountINR(a)) }}</b></td>
                <td class="num">
                  <button class="btn ghost sm" (click)="edit(a)">Edit</button>
                  <button class="btn danger sm" (click)="store.removeAccount(a.id)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else { <div class="empty">No accounts yet.</div> }
    </div>

    @if (draft(); as d) {
      <div class="card">
        <h2>{{ d.id ? 'Edit account' : 'Add account' }}</h2>
        <div class="field"><label>Institution / name</label><input [(ngModel)]="d.institution" placeholder="HDFC Bank, Zerodha…"></div>
        <div class="field"><label>Type</label>
          <select [(ngModel)]="d.kind">
            @for (k of kinds; track k) { <option [value]="k">{{ label(k) }}</option> }
          </select>
        </div>
        <div class="frow">
          <div class="field"><label>Owner</label>
            <select [(ngModel)]="d.personId">
              @for (p of store.people(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
          </div>
          <div class="field"><label>PAN</label>
            <select [(ngModel)]="d.panId">
              <option [ngValue]="undefined">— no PAN —</option>
              @for (t of pansFor(d.personId); track t.id) { <option [ngValue]="t.id">{{ t.pan }}</option> }
            </select>
          </div>
        </div>
        <div class="frow">
          <div class="field"><label>Balance / outstanding</label><input type="number" [(ngModel)]="d.balance"></div>
          <div class="field"><label>Currency</label>
            <select [(ngModel)]="d.currency">
              @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </div>
        </div>
        <div class="field"><label>Statement password format (optional)</label><input [(ngModel)]="d.pwFormat" placeholder="e.g. First 4 letters of name (CAPS) + DDMM DOB"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost" (click)="draft.set(null)">Cancel</button>
          <button class="btn primary" (click)="save()">Save</button>
        </div>
      </div>
    }
  `,
})
export class AccountsComponent {
  store = inject(DataService);
  f = fmtINR;
  kinds = Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[];
  currencies: Currency[] = ['INR', 'USD', 'GBP', 'EUR', 'AED'];
  draft = signal<Draft | null>(null);

  rows() { return this.store.accountsInScope().filter((a) => a.kind !== 'creditcard'); }
  label(k: AccountKind) { return ACCOUNT_KIND_LABEL[k]; }
  pansFor(personId?: string) { return this.store.people().find((p) => p.id === personId)?.pans ?? []; }

  add() {
    const first = this.store.people()[0];
    if (!first) { alert('Add a person first (People & PANs tab).'); return; }
    this.draft.set({ kind: 'savings', currency: 'INR', personId: first.id, balance: 0 });
  }
  edit(a: Account) { this.draft.set({ ...a }); }
  save() {
    const d = this.draft();
    if (!d || !d.institution) { alert('Enter an institution name'); return; }
    this.store.upsertAccount({
      id: d.id ?? '', institution: d.institution!, kind: d.kind ?? 'savings',
      personId: d.personId!, panId: d.panId, balance: Number(d.balance) || 0,
      currency: (d.currency as Currency) ?? 'INR', pwFormat: d.pwFormat,
    });
    this.draft.set(null);
  }
}
