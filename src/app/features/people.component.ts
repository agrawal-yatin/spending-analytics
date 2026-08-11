import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataService } from '../core/data.service';
import { Person, TaxIdentity } from '../core/models';
import { uid } from '../core/sample-data';

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <div class="tbl-head">
        <div><h2>People &amp; PANs</h2><p class="sub" style="margin:0">Each person can hold multiple PANs</p></div>
        <button class="btn primary" (click)="add()">+ Add person</button>
      </div>

      @for (p of store.people(); track p.id) {
        <div style="border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px;background:#fcfcfd">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><b style="font-size:15px">{{ p.name }}</b> <span class="chip muted">{{ p.relation || '—' }}</span></div>
            <div>
              <button class="btn ghost sm" (click)="edit(p)">Edit</button>
              <button class="btn danger sm" (click)="store.removePerson(p.id)">Delete</button>
            </div>
          </div>
          <div style="margin-top:8px;font-size:12.5px;color:var(--muted)">PANs:
            @for (t of p.pans; track t.id) { <span class="pan-tag">{{ t.pan }}{{ t.label ? ' · ' + t.label : '' }}</span>&nbsp; }
            @if (!p.pans.length) { <i>none</i> }
          </div>
        </div>
      } @empty { <div class="empty">No people yet.</div> }
    </div>

    @if (draft(); as d) {
      <div class="card">
        <h2>{{ d.id ? 'Edit person' : 'Add person' }}</h2>
        <div class="frow">
          <div class="field"><label>Name</label><input [(ngModel)]="d.name" placeholder="Full name"></div>
          <div class="field"><label>Relation</label><input [(ngModel)]="d.relation" placeholder="Self, Spouse, Daughter…"></div>
        </div>
        <div class="field"><label>PAN cards</label>
          @for (t of d.pans; track t.id; let i = $index) {
            <div class="frow" style="margin-bottom:6px">
              <input [(ngModel)]="t.pan" placeholder="ABCDE1234F">
              <div style="display:flex;gap:6px">
                <input [(ngModel)]="t.label" placeholder="label (optional)">
                <button class="btn danger sm" (click)="d.pans.splice(i, 1)">✕</button>
              </div>
            </div>
          }
          <button class="btn ghost sm" (click)="d.pans.push({ id: newId(), pan: '' })">+ Add PAN</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost" (click)="draft.set(null)">Cancel</button>
          <button class="btn primary" (click)="save()">Save</button>
        </div>
      </div>
    }
  `,
})
export class PeopleComponent {
  store = inject(DataService);
  draft = signal<Person | null>(null);
  newId = uid;

  add() { this.draft.set({ id: '', name: '', relation: '', pans: [{ id: uid(), pan: '' }] }); }
  edit(p: Person) { this.draft.set(structuredClone(p)); }
  save() {
    const d = this.draft();
    if (!d || !d.name.trim()) { alert('Enter a name'); return; }
    d.pans = d.pans.filter((t: TaxIdentity) => t.pan.trim()).map((t) => ({ ...t, pan: t.pan.trim().toUpperCase() }));
    this.store.upsertPerson(d);
    this.draft.set(null);
  }
}
