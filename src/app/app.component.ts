import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DataService } from './core/data.service';
import { AuthService } from './core/auth.service';
import { KiteService } from './core/kite.service';
import { LoginComponent } from './features/login.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LoginComponent],
  template: `
    <!--
      Access rule:
      - Local mode (no Supabase keys): auth.configured is false → show the app.
      - Cloud mode (keys set): show the app only when signed in, else the login screen.
    -->
    @if (showApp()) {
      <div class="app">
        <div class="topbar">
          <div class="brand"><span class="logo">₹</span> FamilyWealth</div>
          <div style="display:flex;align-items:center;gap:8px">
            <select class="filter" [value]="store.filterPerson()" (change)="onFilter($event)">
              <option value="all">👨‍👩‍👧 Whole family</option>
              @for (p of store.people(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
            @if (auth.configured && auth.user()) {
              <button class="btn ghost sm" (click)="signOut()">Sign out</button>
            }
          </div>
        </div>

        <nav class="tabs">
          <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
          <a routerLink="/accounts" routerLinkActive="active">Accounts</a>
          <a routerLink="/cards" routerLinkActive="active">Credit Cards</a>
          <a routerLink="/spending" routerLinkActive="active">Spending</a>
          <a routerLink="/assets" routerLinkActive="active">Investments &amp; Assets</a>
          <a routerLink="/people" routerLinkActive="active">People &amp; PANs</a>
          <a routerLink="/settings" routerLinkActive="active">Settings</a>
        </nav>

        <router-outlet />

        <div style="text-align:center;color:var(--muted);font-size:12px;margin-top:22px">
          FamilyWealth PWA · {{ auth.configured ? 'cloud sync' : 'local-first' }} · not financial advice
        </div>
      </div>
    } @else {
      <app-login />
    }
  `,
})
export class AppComponent {
  store = inject(DataService);
  auth = inject(AuthService);
  private kite = inject(KiteService);

  /** Show the app in local mode always; in cloud mode only when signed in. */
  showApp = computed(() => !this.auth.configured || !!this.auth.user());

  private lastLoadedUser: string | null = null;

  constructor() {
    // Cloud mode: once the user signs in (or switches), re-hydrate the store from
    // their cloud data, then complete any pending Zerodha (Kite) login redirect.
    // The reload is deferred to a microtask so its signal writes happen OUTSIDE
    // this effect's reactive context (Angular forbids synchronous signal writes
    // inside an effect — NG0600).
    effect(() => {
      const uid = this.auth.configured ? (this.auth.user()?.id ?? null) : null;
      if (uid && uid !== this.lastLoadedUser) {
        this.lastLoadedUser = uid;
        queueMicrotask(() => void this.store.reload().then(() => this.finishKiteRedirect()));
      } else if (!uid) {
        this.lastLoadedUser = null;
      }
    });
  }

  private async finishKiteRedirect() {
    const msg = await this.kite.handleRedirectIfPresent();
    if (msg) alert(msg);
  }

  onFilter(e: Event) { this.store.setFilter((e.target as HTMLSelectElement).value); }
  signOut() { void this.auth.signOut(); }
}
