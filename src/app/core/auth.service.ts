import { Injectable, signal } from '@angular/core';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { supabase } from './supabase.client';

/**
 * Thin auth wrapper over Supabase (email 6-digit code / OTP).
 *
 * Safe when Supabase isn't configured: if `environment.supabaseUrl` /
 * `supabaseAnonKey` are blank, `configured` is false and the service never
 * touches the Supabase client — so the app keeps running purely local-first.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** True only when Supabase keys are present — gates all cloud behaviour. */
  readonly configured = !!environment.supabaseUrl && !!environment.supabaseAnonKey;

  private sb: SupabaseClient | null = this.configured ? supabase() : null;
  readonly user = signal<User | null>(null);

  /**
   * OAuth provider access token (Google / Microsoft), captured as it arrives.
   * Supabase only exposes provider_token right after sign-in and drops it on
   * token refresh, so we cache it (in memory + sessionStorage) for the mail
   * import features to use.
   */
  readonly providerToken = signal<string | null>(readCachedProviderToken());

  constructor() {
    if (!this.sb) return;
    this.sb.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
      this.captureProviderToken(data.session);
    });
    this.sb.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      this.captureProviderToken(session);
    });
  }

  private captureProviderToken(session: unknown) {
    const t = (session as { provider_token?: string } | null)?.provider_token;
    if (t) {
      this.providerToken.set(t);
      try { sessionStorage.setItem('fw_provider_token', t); } catch { /* ignore */ }
    }
  }

  /** Send a login code to the given email. */
  sendCode(email: string) {
    if (!this.sb) throw new Error('Supabase not configured');
    return this.sb.auth.signInWithOtp({ email });
  }

  /** Verify the 6-digit code the user received by email. */
  verifyCode(email: string, token: string) {
    if (!this.sb) throw new Error('Supabase not configured');
    return this.sb.auth.verifyOtp({ email, token, type: 'email' });
  }

  signOut() {
    try { sessionStorage.removeItem('fw_provider_token'); } catch { /* ignore */ }
    this.providerToken.set(null);
    return this.sb ? this.sb.auth.signOut() : Promise.resolve();
  }
}

function readCachedProviderToken(): string | null {
  try { return sessionStorage.getItem('fw_provider_token'); } catch { return null; }
}
