import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { supabase } from './supabase.client';
import { Asset } from './models';
import { uid } from './sample-data';

interface KiteHolding { symbol: string; qty: number; buyPrice: number; currentPrice: number; }

/**
 * Zerodha Kite Connect client flow:
 *  1. redirect the user to Kite login (loginUrl)
 *  2. Kite redirects back with ?request_token=…  (handled on app load)
 *  3. exchange it via the `kite` Edge Function, which returns holdings
 *  4. map holdings into the store as assets (platform-tagged so re-sync replaces)
 *
 * Requires environment.kiteApiKey + Supabase cloud mode (the Edge Function holds
 * the api_secret). `configured` gates the UI so nothing shows when unset.
 */
@Injectable({ providedIn: 'root' })
export class KiteService {
  private auth = inject(AuthService);
  private store = inject(DataService);

  get configured(): boolean {
    return !!environment.kiteApiKey && this.auth.configured && !!this.auth.user();
  }

  loginUrl(): string {
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${environment.kiteApiKey}`;
  }

  /** Call on app load; if a Kite redirect is present, complete the sync. */
  async handleRedirectIfPresent(): Promise<string | null> {
    const params = new URLSearchParams(location.search);
    const requestToken = params.get('request_token');
    const status = params.get('status');
    if (!requestToken) return null;
    // clean the URL regardless of outcome
    const clean = location.origin + location.pathname + location.hash;
    history.replaceState({}, '', clean);
    if (status && status !== 'success') return 'Zerodha login was cancelled.';
    return this.sync(requestToken);
  }

  /** Exchange request_token and import holdings for the selected/first person. */
  async sync(requestToken: string): Promise<string> {
    if (!this.configured) return 'Kite not configured.';
    const { data, error } = await supabase().functions.invoke('kite', {
      body: { action: 'sync', requestToken },
    });
    if (error) return 'Kite sync failed: ' + error.message;
    const res = data as { accessToken?: string; equity?: KiteHolding[]; mf?: KiteHolding[]; error?: string };
    if (res.error) return 'Kite: ' + res.error;

    const personId = this.targetPersonId();
    if (!personId) return 'Add a person first, then connect Zerodha.';

    const assets: Asset[] = [];
    for (const h of res.equity ?? []) assets.push(this.toAsset(personId, 'shares', 'Zerodha (Kite)', h));
    for (const h of res.mf ?? []) assets.push(this.toAsset(personId, 'mutualfund', 'Kite Coin', h));
    this.store.replacePlatformAssets(personId, ['Zerodha (Kite)', 'Kite Coin'], assets);

    return `Imported ${res.equity?.length ?? 0} equity + ${res.mf?.length ?? 0} mutual-fund holdings from Zerodha.`;
  }

  private targetPersonId(): string | undefined {
    const f = this.store.filterPerson();
    if (f !== 'all') return f;
    return this.store.people()[0]?.id;
  }

  private toAsset(personId: string, kind: 'shares' | 'mutualfund', platform: string, h: KiteHolding): Asset {
    return {
      id: uid(), kind, personId, currency: 'INR', platform,
      symbol: h.symbol, qty: h.qty, buyPrice: h.buyPrice, currentPrice: h.currentPrice,
    };
  }
}
