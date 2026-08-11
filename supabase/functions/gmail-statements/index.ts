// Supabase Edge Function: gmail-statements
// -----------------------------------------------------------------------------
// Searches the signed-in user's Gmail for statement emails and returns the PDF
// attachments (base64). The client then feeds each into `parse-statement`.
//
// Requires a Google OAuth access token with scope
//   https://www.googleapis.com/auth/gmail.readonly
// obtained on the client via Supabase Google sign-in (session.provider_token).
//
// Request:  { accessToken: string, query?: string, max?: number }
// Response: { attachments: { fileName, contentBase64, from, date }[], scanned: number }
//
// Deploy: supabase functions deploy gmail-statements
// See supabase/EMAIL.md.
// -----------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const G = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_Q = 'has:attachment filename:pdf (statement OR "credit card" OR "account statement" OR "e-statement") newer_than:120d';

function b64urlToB64(s: string) { return s.replace(/-/g, '+').replace(/_/g, '/'); }

interface Part { filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string }; parts?: Part[]; }
function findPdfParts(p: Part, acc: { filename: string; attachmentId: string }[] = []) {
  if (p.filename && /\.pdf$/i.test(p.filename) && p.body?.attachmentId) {
    acc.push({ filename: p.filename, attachmentId: p.body.attachmentId });
  }
  for (const c of p.parts ?? []) findPdfParts(c, acc);
  return acc;
}
function header(payload: any, name: string): string {
  return (payload.headers ?? []).find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { accessToken, query, max } = await req.json();
    if (!accessToken) return json({ error: 'accessToken (Google) required' }, 400);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const q = encodeURIComponent(query || DEFAULT_Q);
    const limit = Math.min(max || 10, 25);

    const listRes = await fetch(`${G}/messages?maxResults=${limit}&q=${q}`, { headers: auth });
    const list = await listRes.json();
    if (list.error) return json({ error: 'Gmail: ' + (list.error.message || 'search failed') }, 200);
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id);

    const attachments: { fileName: string; contentBase64: string; from: string; date: string }[] = [];
    for (const id of ids) {
      const msg = await (await fetch(`${G}/messages/${id}?format=full`, { headers: auth })).json();
      const from = header(msg.payload, 'From');
      const date = header(msg.payload, 'Date');
      for (const part of findPdfParts(msg.payload)) {
        const att = await (await fetch(`${G}/messages/${id}/attachments/${part.attachmentId}`, { headers: auth })).json();
        if (att.data) attachments.push({ fileName: part.filename, contentBase64: b64urlToB64(att.data), from, date });
        if (attachments.length >= 30) break;
      }
      if (attachments.length >= 30) break;
    }
    return json({ attachments, scanned: ids.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 200);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
