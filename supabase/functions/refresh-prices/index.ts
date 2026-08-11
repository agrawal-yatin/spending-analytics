// Supabase Edge Function: refresh-prices
// -----------------------------------------------------------------------------
// Fetches live FX (INR per unit) and gold/silver spot (INR per gram) from free,
// no-key public APIs. Server-side so there are no browser CORS issues, and one
// place to swap providers later. Returns partial data on any single failure.
//
// Response: { fx?: {USD,GBP,EUR,AED}, gold?: number, silver?: number, errors?: string[] }
//
// Deploy: supabase functions deploy refresh-prices
// -----------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const GRAMS_PER_TROY_OZ = 31.1034768;

async function fetchFx(): Promise<{ USD: number; GBP: number; EUR: number; AED: number }> {
  // base USD → rates[X] = X per 1 USD. INR per CCY = rates.INR / rates.CCY.
  const r = await fetch('https://open.er-api.com/v6/latest/USD');
  const j = await r.json();
  const rt = j.rates as Record<string, number>;
  const inrPer = (ccy: string) => rt.INR / rt[ccy];
  return { USD: rt.INR, GBP: inrPer('GBP'), EUR: inrPer('EUR'), AED: inrPer('AED') };
}

async function fetchMetalInrPerGram(symbol: 'XAU' | 'XAG', usdinr: number): Promise<number> {
  // gold-api.com: price = USD per troy ounce (no key).
  const r = await fetch(`https://api.gold-api.com/price/${symbol}`);
  const j = await r.json();
  const usdPerOz = Number(j.price);
  if (!usdPerOz) throw new Error(`no price for ${symbol}`);
  return (usdPerOz * usdinr) / GRAMS_PER_TROY_OZ;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  let usdinr = 83;
  try {
    const fx = await fetchFx();
    out.fx = { USD: round(fx.USD), GBP: round(fx.GBP), EUR: round(fx.EUR), AED: round(fx.AED) };
    usdinr = fx.USD;
  } catch (e) {
    errors.push('FX: ' + String((e as Error)?.message || e));
  }

  try { out.gold = round(await fetchMetalInrPerGram('XAU', usdinr)); }
  catch (e) { errors.push('Gold: ' + String((e as Error)?.message || e)); }

  try { out.silver = round2(await fetchMetalInrPerGram('XAG', usdinr)); }
  catch (e) { errors.push('Silver: ' + String((e as Error)?.message || e)); }

  if (errors.length) out.errors = errors;
  return new Response(JSON.stringify(out), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});

function round(n: number) { return Math.round(n * 100) / 100; }
function round2(n: number) { return Math.round(n * 100) / 100; }
