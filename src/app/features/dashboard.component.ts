import { Component, computed, inject } from '@angular/core';
import { DataService } from '../core/data.service';
import { fmtINR } from '../core/finance';
import { ASSET_KIND_LABEL, LIABILITY_KINDS } from '../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="card">
      <div class="nw-cap">{{ store.filterPerson() === 'all' ? 'Family net worth' : store.personName(store.filterPerson()) + "'s net worth" }}</div>
      <div class="nw-main" [style.color]="nw().net < 0 ? 'var(--red)' : 'var(--ink)'">{{ f(nw().net) }}</div>
      <div class="kpis">
        <div class="kpi"><div class="l">Assets</div><div class="v pos">{{ f(nw().assets) }}</div></div>
        <div class="kpi"><div class="l">Liabilities</div><div class="v neg">{{ f(nw().liabilities) }}</div></div>
        <div class="kpi"><div class="l">Investments</div><div class="v">{{ f(nw().investments) }}</div></div>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h2>Allocation</h2><p class="sub">Where the money sits</p>
        <div class="legend">
          @for (c of allocation(); track c.label) {
            <div style="margin-bottom:10px">
              <div class="row"><span class="sw" [style.background]="c.color"></span>{{ c.label }}<span class="amt">{{ f(c.value) }} · {{ c.pct }}%</span></div>
              <div class="bar"><span [style.width.%]="c.pct" [style.background]="c.color"></span></div>
            </div>
          } @empty { <div class="empty">No positive holdings yet</div> }
        </div>
      </div>

      <div class="card">
        <h2>By person</h2><p class="sub">Net worth per family member</p>
        <table><tbody>
          @for (r of byPerson(); track r.name) {
            <tr>
              <td><b>{{ r.name }}</b><div style="font-size:12px;color:var(--muted)">{{ r.relation }}</div></td>
              <td style="width:45%"><div class="bar"><span [style.width.%]="r.pct"></span></div></td>
              <td class="num"><b>{{ f(r.net) }}</b></td>
            </tr>
          } @empty { <tr><td class="empty">Add people to see the breakdown</td></tr> }
        </tbody></table>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  store = inject(DataService);
  f = fmtINR;
  nw = this.store.netWorth;

  allocation = computed(() => {
    const s = this.store.settings();
    const cats: Record<string, number> = {};
    for (const a of this.store.accountsInScope()) {
      if (LIABILITY_KINDS.includes(a.kind)) continue;
      const c = this.catOfAccount(a.kind);
      cats[c] = (cats[c] || 0) + this.store.accountINR(a);
    }
    for (const a of this.store.assetsInScope()) {
      const c = ASSET_KIND_LABEL[a.kind];
      cats[c] = (cats[c] || 0) + this.store.assetCurrentINR(a);
    }
    const labels = Object.keys(cats).filter((k) => cats[k] > 0).sort((a, b) => cats[b] - cats[a]);
    const total = labels.reduce((sum, l) => sum + cats[l], 0) || 1;
    const palette = ['#2f6bff', '#12a150', '#6a4bff', '#d4a017', '#e0459a', '#0ea5b5', '#ef6c3b', '#8a8f98', '#1f6fb2', '#9aa2af'];
    return labels.map((l, i) => ({ label: l, value: cats[l], pct: Math.round((cats[l] / total) * 100), color: palette[i % palette.length] }));
  });

  byPerson = computed(() => {
    const d = this.store.data();
    const rows = d.people.map((p) => {
      let net = 0;
      d.accounts.filter((a) => a.personId === p.id).forEach((a) => (net += this.store.accountINR(a)));
      d.assets.filter((a) => a.personId === p.id).forEach((a) => (net += this.store.assetCurrentINR(a)));
      return { name: p.name, relation: p.relation ?? '', net };
    }).sort((a, b) => b.net - a.net);
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
    return rows.map((r) => ({ ...r, pct: (Math.abs(r.net) / max) * 100 }));
  });

  private catOfAccount(kind: string): string {
    if (['savings', 'current', 'fd'].includes(kind)) return 'Bank';
    if (kind === 'demat') return 'Demat';
    if (kind === 'trading') return 'Trading';
    if (kind === 'wallet') return 'Wallet';
    return 'Bank';
  }
}
