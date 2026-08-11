import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataService } from '../core/data.service';
import { Settings } from '../core/models';
import { PriceService } from '../core/price.service';
import { GmailService } from '../core/gmail.service';

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
        <h2>Import statements from Gmail <span class="chip muted">beta</span></h2>
        <p class="sub">Scans your Gmail for statement PDFs and stages them on matching accounts. Encrypted PDFs are staged unparsed — open them and enter the password.</p>
        <button class="btn ghost" [disabled]="gmailBusy()" (click)="importGmail()">{{ gmailBusy() ? 'Working…' : '✉️ Fetch statements from Gmail' }}</button>
        @if (gmailMsg()) { <p class="hint" style="margin-top:8px">{{ gmailMsg() }}</p> }
      </div>
    }
  `,
})
export class SettingsComponent {
  store = inject(DataService);
  private prices = inject(PriceService);
  gmail = inject(GmailService);
  draft: Settings = structuredClone(this.store.settings());
  refreshing = signal(false);
  priceMsg = signal('');
  gmailBusy = signal(false);
  gmailMsg = signal('');

  async importGmail() {
    this.gmailBusy.set(true); this.gmailMsg.set('');
    try { this.gmailMsg.set(await this.gmail.importStatements()); }
    catch (e) { this.gmailMsg.set('Failed: ' + (e as Error).message); }
    finally { this.gmailBusy.set(false); }
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
