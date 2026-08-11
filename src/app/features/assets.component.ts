import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataService } from '../core/data.service';
import { fmtINR, isInvestment, isMetal } from '../core/finance';
import { Asset, AssetKind, ASSET_KIND_LABEL, Currency } from '../core/models';
import { KiteService } from '../core/kite.service';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <div class="tbl-head">
        <div><h2>Investments &amp; Assets</h2><p class="sub" style="margin:0">Shares, mutual funds, overseas stocks, gold, silver, real estate</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          @if (kite.configured) {
            <button class="btn ghost" (click)="connectZerodha()">🔗 Connect Zerodha</button>
          }
          <button class="btn primary" (click)="add()">+ Add holding</button>
        </div>
      </div>

      @if (rows().length) {
        <table>
          <thead><tr><th>Holding</th><th>Owner</th><th>Platform</th><th class="num">Invested</th><th class="num">Current</th><th class="num">Gain</th><th></th></tr></thead>
          <tbody>
            @for (a of rows(); track a.id) {
              <tr>
                <td><span class="chip">{{ label(a.kind) }}</span> <b>{{ a.symbol || a.note || label(a.kind) }}</b></td>
                <td>{{ store.personName(a.personId) }}</td>
                <td>@if (a.platform) { <span class="chip muted">{{ a.platform }}</span> } @else { — }</td>
                <td class="num">{{ store.assetBuyINR(a) ? f(store.assetBuyINR(a)) : '—' }}</td>
                <td class="num"><b>{{ f(store.assetCurrentINR(a)) }}</b></td>
                <td class="num">
                  @if (store.assetBuyINR(a)) {
                    <span [class.gain]="true" [class.pos]="gain(a) >= 0" [class.neg]="gain(a) < 0">{{ gain(a) >= 0 ? '+' : '' }}{{ f(gain(a)) }}</span>
                  } @else { — }
                </td>
                <td class="num">
                  <button class="btn ghost sm" (click)="edit(a)">Edit</button>
                  <button class="btn danger sm" (click)="store.removeAsset(a.id)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else { <div class="empty">No holdings yet.</div> }
    </div>

    @if (draft(); as d) {
      <div class="card">
        <h2>{{ d.id ? 'Edit holding' : 'Add holding' }}</h2>
        <div class="field"><label>Owner</label>
          <select [(ngModel)]="d.personId">@for (p of store.people(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select>
        </div>
        <div class="field"><label>Type</label>
          <select [(ngModel)]="d.kind">@for (k of kinds; track k) { <option [value]="k">{{ label(k) }}</option> }</select>
        </div>

        @if (isInv(d.kind)) {
          <div class="field"><label>Name / symbol</label><input [(ngModel)]="d.symbol" placeholder="INFY, Parag Parikh Flexi Cap, AAPL…"></div>
          <div class="field"><label>Platform</label><input [(ngModel)]="d.platform" placeholder="Zerodha (Kite), Kite Coin, IND Money"></div>
          <div class="frow">
            <div class="field"><label>Quantity</label><input type="number" [(ngModel)]="d.qty"></div>
            <div class="field"><label>Currency</label><select [(ngModel)]="d.currency">@for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }</select></div>
          </div>
          <div class="frow">
            <div class="field"><label>Avg buy price</label><input type="number" [(ngModel)]="d.buyPrice"></div>
            <div class="field"><label>Current price</label><input type="number" [(ngModel)]="d.currentPrice"></div>
          </div>
        } @else if (isMet(d.kind)) {
          <div class="frow">
            <div class="field"><label>Quantity (grams)</label><input type="number" [(ngModel)]="d.qty"></div>
            <div class="field"><label>Buy value (₹)</label><input type="number" [(ngModel)]="d.buyValue"></div>
          </div>
        } @else {
          <div class="field"><label>Description</label><input [(ngModel)]="d.note" placeholder="Flat in Pune…"></div>
          <div class="frow">
            <div class="field"><label>Buy value</label><input type="number" [(ngModel)]="d.buyValue"></div>
            <div class="field"><label>Current value</label><input type="number" [(ngModel)]="d.currentValue"></div>
          </div>
          <div class="field"><label>Currency</label><select [(ngModel)]="d.currency">@for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }</select></div>
        }

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost" (click)="draft.set(null)">Cancel</button>
          <button class="btn primary" (click)="save()">Save</button>
        </div>
      </div>
    }
  `,
})
export class AssetsComponent {
  store = inject(DataService);
  kite = inject(KiteService);
  f = fmtINR;

  connectZerodha() { window.location.href = this.kite.loginUrl(); }
  kinds = Object.keys(ASSET_KIND_LABEL) as AssetKind[];
  currencies: Currency[] = ['INR', 'USD', 'GBP', 'EUR', 'AED'];
  draft = signal<Partial<Asset> | null>(null);

  rows() { return this.store.assetsInScope(); }
  label(k: AssetKind) { return ASSET_KIND_LABEL[k]; }
  gain(a: Asset) { return this.store.assetCurrentINR(a) - this.store.assetBuyINR(a); }
  isInv(k?: AssetKind) { return !!k && isInvestment({ kind: k } as Asset); }
  isMet(k?: AssetKind) { return !!k && isMetal({ kind: k } as Asset); }

  add() {
    const first = this.store.people()[0];
    if (!first) { alert('Add a person first (People & PANs tab).'); return; }
    this.draft.set({ kind: 'shares', currency: 'INR', personId: first.id });
  }
  edit(a: Asset) { this.draft.set({ ...a }); }
  save() {
    const d = this.draft();
    if (!d) return;
    this.store.upsertAsset({
      id: d.id ?? '', kind: d.kind ?? 'shares', personId: d.personId!,
      currency: (d.currency as Currency) ?? 'INR',
      symbol: d.symbol, platform: d.platform,
      qty: d.qty != null ? Number(d.qty) : undefined,
      buyPrice: d.buyPrice != null ? Number(d.buyPrice) : undefined,
      currentPrice: d.currentPrice != null ? Number(d.currentPrice) : undefined,
      buyValue: d.buyValue != null ? Number(d.buyValue) : undefined,
      currentValue: d.currentValue != null ? Number(d.currentValue) : undefined,
      note: d.note,
    });
    this.draft.set(null);
  }
}
