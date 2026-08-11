import { Injectable, computed, inject, signal } from '@angular/core';
import { PersistenceAdapter } from './persistence';
import { AppData, Account, Asset, Person, Statement, Transaction } from './models';
import { sampleData, blankData, uid } from './sample-data';
import { netWorth, accountINR, assetCurrentINR, assetBuyINR } from './finance';

/** Read the LocalStorageAdapter snapshot directly (for local→cloud migration). */
function readLocalSnapshot(): AppData | null {
  try {
    const raw = localStorage.getItem('familywealth_ng_v1');
    if (!raw) return null;
    const d = JSON.parse(raw) as AppData;
    return d && Array.isArray(d.people) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Central signal store. Components read the signals/computed values and call
 * the mutation methods; every mutation persists through the injected adapter.
 * This is the Angular equivalent of an @Observable view-model in SwiftUI.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private adapter = inject(PersistenceAdapter);

  /** Full app state. Starts blank, hydrated asynchronously from the adapter. */
  readonly data = signal<AppData>(blankData());

  /** True once the initial load from the adapter has completed. */
  readonly ready = signal(false);

  /** Currently selected person, or 'all' for the whole family. */
  readonly filterPerson = signal<string | 'all'>('all');

  readonly settings = computed(() => this.data().settings);
  readonly people = computed(() => this.data().people);

  readonly netWorth = computed(() => netWorth(this.data(), this.filterPerson()));

  readonly accountsInScope = computed(() => {
    const p = this.filterPerson();
    return this.data().accounts.filter((a) => p === 'all' || a.personId === p);
  });
  readonly assetsInScope = computed(() => {
    const p = this.filterPerson();
    return this.data().assets.filter((a) => p === 'all' || a.personId === p);
  });

  /** Flattened transactions across statements, respecting the person filter. */
  readonly transactionsInScope = computed(() => {
    const p = this.filterPerson();
    const d = this.data();
    const out: (Transaction & { account: string; scope: 'card' | 'bank'; stmtId: string; idx: number })[] = [];
    for (const s of d.statements) {
      const acc = d.accounts.find((a) => a.id === s.accountId);
      if (!acc) continue;
      if (p !== 'all' && acc.personId !== p) continue;
      s.txns.forEach((t, idx) =>
        out.push({ ...t, account: acc.institution, scope: s.scope, stmtId: s.id, idx }),
      );
    }
    return out;
  });

  constructor() {
    void this.reload();
  }

  /**
   * Load persisted state from the adapter; seed sample data on first run.
   * Public so the shell can re-hydrate after sign-in (cloud mode), when the
   * adapter can finally read the user's rows.
   */
  async reload() {
    this.ready.set(false);
    const loaded = await this.adapter.load();
    if (loaded) {
      this.data.set(loaded);
    } else {
      // First run with this adapter. If we're on a remote adapter but the user
      // has existing local data, migrate it up (so switching to cloud keeps data);
      // otherwise seed the sample family.
      const local = readLocalSnapshot();
      this.data.set(local ?? sampleData());
      await this.adapter.save(this.data());
    }
    this.ready.set(true);
  }

  /** Replace all data (e.g. from an imported JSON export) and persist. */
  importData(d: AppData) {
    if (!d || !Array.isArray(d.people)) throw new Error('Not a valid FamilyWealth export');
    // fill any missing settings keys defensively
    const base = blankData();
    d.settings = { ...base.settings, ...(d.settings ?? {}) };
    this.data.set(d);
    this.persist();
  }

  // ---- helpers exposed to components ----
  personName(id: string): string { return this.people().find((p) => p.id === id)?.name ?? '—'; }
  panLabel(id?: string): string {
    if (!id) return '';
    for (const p of this.people()) { const t = p.pans.find((x) => x.id === id); if (t) return t.pan; }
    return '';
  }
  accountINR(a: Account) { return accountINR(a, this.settings()); }
  assetCurrentINR(a: Asset) { return assetCurrentINR(a, this.settings()); }
  assetBuyINR(a: Asset) { return assetBuyINR(a, this.settings()); }
  statementsFor(accountId: string): Statement[] {
    return this.data().statements.filter((s) => s.accountId === accountId).sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  // ---- mutations ----
  private update(fn: (d: AppData) => void) {
    const next = structuredClone(this.data());
    fn(next);
    this.data.set(next);
    this.persist();
  }
  private persist() { void this.adapter.save(this.data()); }

  setFilter(p: string | 'all') { this.filterPerson.set(p); }

  upsertPerson(p: Person) {
    this.update((d) => {
      const i = d.people.findIndex((x) => x.id === p.id);
      if (i >= 0) d.people[i] = p; else d.people.push({ ...p, id: p.id || uid() });
    });
  }
  removePerson(id: string) {
    this.update((d) => {
      const accIds = d.accounts.filter((a) => a.personId === id).map((a) => a.id);
      d.people = d.people.filter((x) => x.id !== id);
      d.accounts = d.accounts.filter((a) => a.personId !== id);
      d.assets = d.assets.filter((a) => a.personId !== id);
      d.statements = d.statements.filter((s) => !accIds.includes(s.accountId));
    });
  }

  upsertAccount(a: Account) {
    this.update((d) => {
      const i = d.accounts.findIndex((x) => x.id === a.id);
      if (i >= 0) d.accounts[i] = a; else d.accounts.push({ ...a, id: a.id || uid() });
    });
  }
  removeAccount(id: string) {
    this.update((d) => { d.accounts = d.accounts.filter((x) => x.id !== id); d.statements = d.statements.filter((s) => s.accountId !== id); });
  }

  upsertAsset(a: Asset) {
    this.update((d) => {
      const i = d.assets.findIndex((x) => x.id === a.id);
      if (i >= 0) d.assets[i] = a; else d.assets.push({ ...a, id: a.id || uid() });
    });
  }
  removeAsset(id: string) { this.update((d) => { d.assets = d.assets.filter((x) => x.id !== id); }); }

  /** Replace all assets on the given platforms for a person (used by Kite sync). */
  replacePlatformAssets(personId: string, platforms: string[], fresh: Asset[]) {
    this.update((d) => {
      d.assets = d.assets.filter((a) => !(a.personId === personId && a.platform != null && platforms.includes(a.platform)));
      for (const a of fresh) d.assets.push({ ...a, id: a.id || uid() });
    });
  }

  addStatement(s: Statement) { this.update((d) => { d.statements.push({ ...s, id: s.id || uid() }); }); }
  removeStatement(id: string) { this.update((d) => { d.statements = d.statements.filter((x) => x.id !== id); }); }
  recategorize(stmtId: string, idx: number, category: string) {
    this.update((d) => { const s = d.statements.find((x) => x.id === stmtId); if (s && s.txns[idx]) s.txns[idx].category = category; });
  }

  saveSettings(patch: Partial<AppData['settings']>) { this.update((d) => { d.settings = { ...d.settings, ...patch }; }); }

  loadSample() { this.data.set(sampleData()); this.persist(); }
  eraseAll() { this.data.set(blankData()); this.persist(); }
  exportJson(): string { return JSON.stringify(this.data(), null, 2); }
}
