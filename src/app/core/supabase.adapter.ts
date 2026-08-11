import { Injectable } from '@angular/core';
import { PersistenceAdapter } from './persistence';
import { AppData } from './models';
import { supabase } from './supabase.client';

/**
 * Cloud persistence: stores the whole app state as one JSONB row per user
 * (table `wealth_state`, protected by RLS). Same load/save contract as
 * LocalStorageAdapter — activate it by binding this class in app.config.ts.
 * Requires the user to be signed in (see AuthService + LoginComponent).
 */
@Injectable()
export class SupabaseAdapter extends PersistenceAdapter {
  private sb = supabase();

  async load(): Promise<AppData | null> {
    const { data: auth } = await this.sb.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    const { data, error } = await this.sb
      .from('wealth_state')
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) { console.error('Supabase load failed', error); return null; }
    return (data?.data as AppData) ?? null;
  }

  async save(state: AppData): Promise<void> {
    const { data: auth } = await this.sb.auth.getUser();
    const user = auth.user;
    if (!user) return; // not signed in yet — nothing to persist remotely
    const { error } = await this.sb
      .from('wealth_state')
      .upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() });
    if (error) console.error('Supabase save failed', error);
  }
}
