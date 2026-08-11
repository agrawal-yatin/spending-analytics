import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { supabase } from './supabase.client';

export interface PriceUpdate {
  fx?: { USD: number; GBP: number; EUR: number; AED: number };
  gold?: number;
  silver?: number;
  errors?: string[];
}

const GRAMS_PER_TROY_OZ = 31.1034768;

/**
 * Fetches live FX + metal prices.
 * - Cloud mode: via the `refresh-prices` Edge Function (no CORS issues).
 * - Local mode: best-effort direct fetch from free public APIs.
 */
@Injectable({ providedIn: 'root' })
export class PriceService {
  private auth = inject(AuthService);

  async refresh(): Promise<PriceUpdate> {
    if (this.auth.configured && this.auth.user()) {
      const { data, error } = await supabase().functions.invoke('refresh-prices', { body: {} });
      if (error) return { errors: [error.message] };
      return data as PriceUpdate;
    }
    return this.refreshDirect();
  }

  /** Client-side fallback (works when the providers allow CORS). */
  private async refreshDirect(): Promise<PriceUpdate> {
    const out: PriceUpdate = {};
    const errors: string[] = [];
    let usdinr = 83;
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
      const rt = j.rates as Record<string, number>;
      const per = (c: string) => rt['INR'] / rt[c];
      out.fx = { USD: r(rt['INR']), GBP: r(per('GBP')), EUR: r(per('EUR')), AED: r(per('AED')) };
      usdinr = rt['INR'];
    } catch (e) { errors.push('FX: ' + String(e)); }

    try { out.gold = r(await metal('XAU', usdinr)); } catch (e) { errors.push('Gold: ' + String(e)); }
    try { out.silver = r(await metal('XAG', usdinr)); } catch (e) { errors.push('Silver: ' + String(e)); }

    if (errors.length) out.errors = errors;
    return out;
  }
}

async function metal(symbol: 'XAU' | 'XAG', usdinr: number): Promise<number> {
  const j = await (await fetch(`https://api.gold-api.com/price/${symbol}`)).json();
  const usdPerOz = Number(j.price);
  if (!usdPerOz) throw new Error('no price');
  return (usdPerOz * usdinr) / GRAMS_PER_TROY_OZ;
}
function r(n: number) { return Math.round(n * 100) / 100; }
