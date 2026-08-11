import { Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../core/data.service';
import { fmtINR, monthLabel, parseDate } from '../core/finance';
import { CATEGORIES } from '../core/models';

@Component({
  selector: 'app-spending',
  standalone: true,
  template: `
    <div class="card">
      <div class="tbl-head">
        <div><h2>Spending</h2><p class="sub" style="margin:0">Auto-categorized from uploaded credit-card &amp; bank statements</p></div>
        <select class="filter" [value]="month()" (change)="month.set($any($event.target).value)">
          <option value="all">All months</option>
          @for (m of months(); track m) { <option [value]="m">{{ ml(m) }}</option> }
        </select>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Total spend</div><div class="v neg">{{ f(totals().total) }}</div></div>
        <div class="kpi"><div class="l">Avg / month</div><div class="v">{{ f(totals().avg) }}</div></div>
        <div class="kpi"><div class="l">Top category</div><div class="v" style="font-size:16px">{{ totals().top || '—' }}</div></div>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h2>Month-over-month</h2><p class="sub">Total spend per month</p>
        @for (m of monthly(); track m.key) {
          <div style="margin-bottom:10px">
            <div class="row" style="display:flex;font-size:13px"><span>{{ ml(m.key) }}</span><span style="margin-left:auto;font-weight:600">{{ f(m.value) }}</span></div>
            <div class="bar"><span [style.width.%]="m.pct"></span></div>
          </div>
        } @empty { <div class="empty">Upload a statement to see trends</div> }
      </div>
      <div class="card">
        <h2>By category</h2><p class="sub">Where it goes</p>
        <div class="legend">
          @for (c of byCategory(); track c.label) {
            <div class="row"><span class="sw" [style.background]="c.color"></span>{{ c.label }}<span class="amt">{{ f(c.value) }} · {{ c.pct }}%</span></div>
          } @empty { <div class="empty">No spending in this period</div> }
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Transactions</h2><p class="sub">Change a category to re-classify — it's remembered</p>
      @if (debits().length) {
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th class="num">Amount</th></tr></thead>
          <tbody>
            @for (t of debits(); track t.stmtId + t.idx) {
              <tr>
                <td style="white-space:nowrap">{{ t.date }}</td>
                <td>{{ t.desc }}</td>
                <td><span class="chip" [class.card]="t.scope === 'card'">{{ t.account }}</span></td>
                <td>
                  <select [value]="t.category" (change)="recat(t.stmtId, t.idx, $any($event.target).value)">
                    @for (cat of cats; track cat) { <option [value]="cat">{{ cat }}</option> }
                  </select>
                </td>
                <td class="num"><b>{{ f(t.amount) }}</b></td>
              </tr>
            }
          </tbody>
        </table>
      } @else { <div class="empty">No debit transactions in this period.</div> }
    </div>
  `,
})
export class SpendingComponent {
  store = inject(DataService);
  f = fmtINR;
  ml = monthLabel;
  cats = CATEGORIES;
  month = signal<string>('all');

  private spends = computed(() => this.store.transactionsInScope().filter((t) => t.dir === 'debit'));
  months = computed(() => [...new Set(this.spends().map((t) => t.month))].sort());

  debits = computed(() => {
    const m = this.month();
    return this.spends()
      .filter((t) => m === 'all' || t.month === m)
      .sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0))
      .slice(0, 300);
  });

  totals = computed(() => {
    const all = this.spends();
    const inScope = this.debits();
    const total = inScope.reduce((s, t) => s + t.amount, 0);
    const mCount = Math.max(1, this.months().length);
    const cats: Record<string, number> = {};
    inScope.forEach((t) => (cats[t.category] = (cats[t.category] || 0) + t.amount));
    const top = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0];
    return { total, avg: all.reduce((s, t) => s + t.amount, 0) / mCount, top };
  });

  monthly = computed(() => {
    const by: Record<string, number> = {};
    this.spends().forEach((t) => (by[t.month] = (by[t.month] || 0) + t.amount));
    const keys = Object.keys(by).sort();
    const max = Math.max(1, ...keys.map((k) => by[k]));
    return keys.map((k) => ({ key: k, value: by[k], pct: (by[k] / max) * 100 }));
  });

  byCategory = computed(() => {
    const by: Record<string, number> = {};
    this.debits().forEach((t) => (by[t.category] = (by[t.category] || 0) + t.amount));
    const labels = Object.keys(by).sort((a, b) => by[b] - by[a]);
    const total = labels.reduce((s, l) => s + by[l], 0) || 1;
    const palette = ['#ef6c3b', '#12a150', '#2f6bff', '#6a4bff', '#d4a017', '#0ea5b5', '#e0459a', '#e0453f', '#8a8f98', '#b7791f'];
    return labels.map((l, i) => ({ label: l, value: by[l], pct: Math.round((by[l] / total) * 100), color: palette[i % palette.length] }));
  });

  recat(stmtId: string, idx: number, cat: string) { this.store.recategorize(stmtId, idx, cat); }
}
