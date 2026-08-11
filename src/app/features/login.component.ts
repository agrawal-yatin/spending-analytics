import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';

/**
 * Email + 6-digit-code login for cloud mode.
 *
 * WIRING (only needed after you enable Supabase — see supabase/SETUP.md):
 * In app.component.ts:
 *   import { AuthService } from './core/auth.service';
 *   import { LoginComponent } from './features/login.component';
 *   ...add LoginComponent to imports, and: auth = inject(AuthService);
 * Then wrap the shell body:
 *   @if (auth.user()) { ...existing nav + <router-outlet /> }
 *   @else { <app-login /> }
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card" style="max-width:400px;margin:60px auto">
      <div class="brand" style="margin-bottom:14px"><span class="logo">₹</span> FamilyWealth</div>
      @if (step() === 'email') {
        <h2>Sign in</h2><p class="sub">We'll email you a 6-digit code.</p>
        <div class="field"><label>Email</label><input type="email" [(ngModel)]="email" placeholder="you@example.com"></div>
        <button class="btn primary" [disabled]="busy()" (click)="send()">{{ busy() ? 'Sending…' : 'Send code' }}</button>
      } @else {
        <h2>Enter code</h2><p class="sub">Sent to {{ email }}</p>
        <div class="field"><label>6-digit code</label><input inputmode="numeric" [(ngModel)]="code" placeholder="123456"></div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" (click)="step.set('email')">Back</button>
          <button class="btn primary" [disabled]="busy()" (click)="verify()">{{ busy() ? 'Verifying…' : 'Verify' }}</button>
        </div>
      }
      @if (error()) { <p style="color:var(--red);font-size:13px;margin-top:10px">{{ error() }}</p> }
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  email = '';
  code = '';
  step = signal<'email' | 'code'>('email');
  busy = signal(false);
  error = signal('');

  async send() {
    if (!this.email.trim()) { this.error.set('Enter your email'); return; }
    this.busy.set(true); this.error.set('');
    const { error } = await this.auth.sendCode(this.email.trim());
    this.busy.set(false);
    if (error) { this.error.set(error.message); return; }
    this.step.set('code');
  }

  async verify() {
    this.busy.set(true); this.error.set('');
    const { error } = await this.auth.verifyCode(this.email.trim(), this.code.trim());
    this.busy.set(false);
    if (error) this.error.set(error.message);
    // on success, AuthService.user() updates and the shell swaps to the app.
  }
}
