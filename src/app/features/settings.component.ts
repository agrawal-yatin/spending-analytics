import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataService } from '../core/data.service';
import { Settings } from '../core/models';
import { PriceService } from '../core/price.service';
import { GmailService } from '../core/gmail.service';
import { OutlookService } from '../core/outlook.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <h2>Prices &amp; exchange rates</h2>
      <p class="sub">Used to value metals and convert overseas holdings into INR</p>
      <div class="frow">
        <div class="field"><label>Gold (₹/g)</label><input type="number" [(ngModel)]="draft.gold"></div>
        <div class="field"><label>Silver (₹/g)</label><input type="number" [(ngModel)]="draft.silver"></div>
      </div>
      <div class="frow">
        <div class="field"><label>USD → INR</label><input type="number" [(ngModel)]="draft.fx.USD"></div>
        <div class="field"><label>GBP → INR</label><input type="number" [(ngModel)]="draft.fx.GBP"></div>
      </div>
      <div class="frow">
        <div class="field"><label>EUR → INR</label><input type="number" [(ngModel)]="draft.fx.EUR"></div>
        <div class="field"><label>AED → INR</label><input type="number" [(ngModel)]="draft.fx.AED"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" (click)="save()">Save prices</button>
        <button class="btn ghost" [disabled]="refreshing()" (click)="refreshPrices()">
          {{ refreshing() ? 'Fetching…' : '↻ Refresh live prices' }}
        </button>
      </div>
      @if (priceMsg()) { <p class="hint" style="margin-top:8px">{{ priceMsg() }}</p> }
    </div>

    <div class="card">
      <h2>Statement password formats</h2>
      <p class="sub">The rule each bank uses to protect PDF statements (used server-side to unlock)</p>
      @for (pf of draft.pwFormats; track $index) {
        <div class="frow" style="margin-bottom:8px">
          <input [(ngModel)]="pf.bank">
          <div style="display:flex;gap:6px">
            <input [(ngModel)]="pf.fmt">
            <button class="btn danger sm" (click)="draft.pwFormats.splice($index, 1)">✕</button>
          </div>
        </div>
      }
      <button class="btn ghost sm" (click)="draft.pwFormats.push({ bank: 'New bank', fmt: '' })">+ Add bank format</button>
      <div style="margin-top:10px"><button class="btn primary" (click)="save()">Save formats</button></div>
    </div>

    <div class="card">
      <h2>Data</h2>
      <p class="sub">Stored only in this browser. Swap the persistence adapter to sync via Supabase.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost" (click)="exportJson()">Export JSON</button>
        <label class="btn ghost" style="cursor:pointer">
          Import JSON
          <input type="file" accept=".json,application/json" hidden (change)="importJson($event)">
        </label>
        <button class="btn ghost" (click)="store.loadSample()">Load sample family</button>
        <button class="btn danger" (click)="erase()">Erase all data</button>
      </div>
      <p class="hint" style="margin-top:8px">Tip: to move your local data into the cloud, Export here, sign in on cloud mode, then Import. (First cloud sign-in also auto-migrates any local data.)</p>
    </div>

    @if (gmail.available) {
      <div class="card">
        <h2>Import statements from email <span class="chip muted">beta</span></h2>
        <p class="sub">Scans your mailbox in a date range for statement PDFs and stages them on matching accounts. Encrypted PDFs prompt for the password.</p>
        <div class="frow" style="max-width:420px">
          <div class="field"><label>From</label><input type="date" [(ngModel)]="fromDate" [max]="toDate"></div>
          <div class="field"><label>To</label><input type="date" [(ngModel)]="toDate" [max]="today"></div>
        </div>
        <p class="hint" style="margin-top:0">Max range 1 year. Default: last 90 days.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn ghost" [disabled]="busy()" (click)="importOutlook()">{{ busy() === 'outlook' ? 'Working…' : '📧 Fetch from Outlook' }}</button>
          <button class="btn ghost" [disabled]="busy()" (click)="importGmail()">{{ busy() === 'gmail' ? 'Working…' : '✉️ Fetch from Gmail' }}</button>
        </div>
        @if (mailMsg()) { <p class="hint" style="margin-top:8px">{{ mailMsg() }}</p> }
      </div>
    }
  `,
})
export class SettingsComponent {
  store = inject(DataService);
  private prices = inject(PriceService);
  gmail = inject(GmailService);
  private outlook = inject(OutlookService);
  draft: Settings = structuredClone(this.store.settings());
  refreshing = signal(false);
  priceMsg = signal('');
  busy = signal<'outlook' | 'gmail' | null>(null);
  mailMsg = signal('');
  today = new Date().toISOString().slice(0, 10);
  toDate = this.today;
  fromDate = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  /** Returns [fromISO, toISO], clamped to a max 365-day window. */
  private range(): [string, string] {
    let from = new Date(this.fromDate + 'T00:00:00');
    const to = new Date(this.toDate + 'T23:59:59');
    if (to.getTime() - from.getTime() > 365 * 864e5) {
      from = new Date(to.getTime() - 365 * 864e5);
      this.fromDate = from.toISOString().slice(0, 10);
    }
    return [from.toISOString(), to.toISOString()];
  }

  async importGmail() {
    this.busy.set('gmail'); this.mailMsg.set('');
    const [f, t] = this.range();
    try { this.mailMsg.set(await this.gmail.importStatements(f, t)); }
    catch (e) { this.mailMsg.set('Failed: ' + (e as Error).message); }
    finally { this.busy.set(null); }
  }

  async importOutlook() {
    this.busy.set('outlook'); this.mailMsg.set('');
    const [f, t] = this.range();
    try { this.mailMsg.set(await this.outlook.importStatements(f, t)); }
    catch (e) { this.mailMsg.set('Failed: ' + (e as Error).message); }
    finally { this.busy.set(null); }
  }

  save() { this.store.saveSettings(structuredClone(this.draft)); alert('Saved.'); }

  async refreshPrices() {
    this.refreshing.set(true); this.priceMsg.set('');
    try {
      const u = await this.prices.refresh();
      if (u.fx) this.draft.fx = { ...this.draft.fx, ...u.fx };
      if (u.gold) this.draft.gold = u.gold;
      if (u.silver) this.draft.silver = u.silver;
      // persist immediately so valuations update everywhere
      this.store.saveSettings(structuredClone(this.draft));
      const got = [u.fx ? 'FX' : '', u.gold ? 'gold' : '', u.silver ? 'silver' : ''].filter(Boolean).join(', ');
      this.priceMsg.set(got ? `Updated: ${got}.${u.errors?.length ? ' Some sources failed.' : ''}` : 'Could not fetch prices — enter manually or try again.');
    } catch (e) {
      this.priceMsg.set('Refresh failed: ' + (e as Error).message);
    } finally {
      this.refreshing.set(false);
    }
  }
  erase() { if (confirm('Erase ALL data in this browser?')) { this.store.eraseAll(); this.draft = structuredClone(this.store.settings()); } }
  exportJson() {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'familywealth-data.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async importJson(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    try {
      const parsed = JSON.parse(await file.text());
      if (!confirm('Replace all current data with the contents of this file?')) return;
      this.store.importData(parsed);
      this.draft = structuredClone(this.store.settings());
      alert('Imported.');
    } catch (err) {
      alert('Import failed: ' + (err as Error).message);
    }
  }
}
