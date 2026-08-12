import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

let _client: SupabaseClient | null = null;

/** Lazily-created singleton Supabase client. */
export function supabase(): SupabaseClient {
  if (!_client) {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
      throw new Error('Supabase keys missing — set them in src/environments/environment.ts (see supabase/SETUP.md).');
    }
    _client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // PKCE returns the OAuth result as ?code=… (query string) instead of a
        // URL hash, so it survives the app's hash-based router. Also lets
        // Supabase exchange the code and expose provider_token.
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}
