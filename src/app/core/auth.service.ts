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

  constructor() {
    if (!this.sb) return;
    this.sb.auth.getSession().then(({ data }) => this.user.set(data.session?.user ?? null));
    this.sb.auth.onAuthStateChange((_event, session) => this.user.set(session?.user ?? null));
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
    return this.sb ? this.sb.auth.signOut() : Promise.resolve();
  }
}
