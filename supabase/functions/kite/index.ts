// Supabase Edge Function: kite
// -----------------------------------------------------------------------------
// Zerodha Kite Connect server-side glue. The api_secret must never reach the
// browser, so the token exchange (which needs it) happens here.
//
// Secrets (set once):  supabase secrets set KITE_API_KEY=xxx KITE_API_SECRET=yyy
//
// Actions (POST JSON):
//   { action: 'sync',     requestToken }  → exchanges token, returns { accessToken, equity[], mf[] }
//   { action: 'holdings', accessToken }   → re-pulls holdings for an existing token
//
// Deploy: supabase functions deploy kite
// See supabase/KITE.md for the full setup + redirect URL.
// -----------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const API = 'https://api.kite.trade';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function authHeader(apiKey: string, accessToken: string) {
  return { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${accessToken}` };
}

async function exchange(apiKey: string, apiSecret: string, requestToken: string): Promise<string> {
  const checksum = await sha256Hex(apiKey + requestToken + apiSecret);
  const body = new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum });
  const r = await fetch(`${API}/session/token`, {
    method: 'POST',
    headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (j.status !== 'success') throw new Error(j.message || 'Kite token exchange failed');
  return j.data.access_token as string;
}

async function equityHoldings(apiKey: string, accessToken: string) {
  const r = await fetch(`${API}/portfolio/holdings`, { headers: authHeader(apiKey, accessToken) });
  const j = await r.json();
  if (j.status !== 'success') throw new Error(j.message || 'holdings fetch failed');
  return (j.data as any[]).map((h) => ({
    symbol: h.tradingsymbol, qty: h.quantity + (h.t1 || 0),
    buyPrice: h.average_price, currentPrice: h.last_price,
  })).filter((h) => h.qty > 0);
}

async function mfHoldings(apiKey: string, accessToken: string) {
  const r = await fetch(`${API}/mf/holdings`, { headers: authHeader(apiKey, accessToken) });
  const j = await r.json();
  if (j.status !== 'success') return [];
  return (j.data as any[]).map((h) => ({
    symbol: h.fund || h.tradingsymbol, qty: h.quantity,
    buyPrice: h.average_price, currentPrice: h.last_price,
  })).filter((h) => h.qty > 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const apiKey = Deno.env.get('KITE_API_KEY');
  const apiSecret = Deno.env.get('KITE_API_SECRET');
  if (!apiKey || !apiSecret) {
    return json({ error: 'KITE_API_KEY / KITE_API_SECRET not set as Supabase secrets' }, 500);
  }
  try {
    const { action, requestToken, accessToken } = await req.json();
    if (action === 'sync') {
      if (!requestToken) return json({ error: 'requestToken required' }, 400);
      const token = await exchange(apiKey, apiSecret, requestToken);
      const [equity, mf] = await Promise.all([equityHoldings(apiKey, token), mfHoldings(apiKey, token)]);
      return json({ accessToken: token, equity, mf });
    }
    if (action === 'holdings') {
      if (!accessToken) return json({ error: 'accessToken required' }, 400);
      const [equity, mf] = await Promise.all([equityHoldings(apiKey, accessToken), mfHoldings(apiKey, accessToken)]);
      return json({ equity, mf });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 200);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
