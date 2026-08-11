import { AppData } from './models';

/**
 * The single seam between the app and where data lives.
 * Async so a remote backend (Supabase) fits the same contract as local storage.
 * v1 uses LocalStorageAdapter. To add cloud sync, provide SupabaseAdapter instead
 * (one line in app.config.ts) — no other code changes needed.
 */
export abstract class PersistenceAdapter {
  abstract load(): Promise<AppData | null>;
  abstract save(data: AppData): Promise<void>;
}
