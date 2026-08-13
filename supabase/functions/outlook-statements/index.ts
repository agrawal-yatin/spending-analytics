// Supabase Edge Function: outlook-statements
// -----------------------------------------------------------------------------
// Searches the signed-in user's Outlook / Microsoft 365 mailbox for statement
// emails and returns the PDF attachments (base64). The client then feeds each
// into `parse-statement`. Outlook counterpart of `gmail-statements`.
//
// Requires a Microsoft Graph access token with delegated scope Mail.Read,
// obtained on the client via Supabase Azure sign-in (session.provider_token).
//
// Request:  { accessToken: string, query?: string, max?: number }
// Response: { attachments: { fileName, contentBase64, from, date }[], scanned: number }
//
// Deploy: supabase functions deploy outlook-statements
// See supabase/OUTLOOK.md.
// -----------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULT_SEARCH = '"statement" OR "credit card" OR "account statement" OR "e-statement"';

const MAX_MSGS = 800;         // safety cap on messages scanned
const MAX_ATTACHMENTS = 200;  // safety cap on PDFs returned

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { accessToken, query, fromISO, toISO } = await req.json();
    if (!accessToken) return json({ error: 'accessToken (Microsoft Graph) required' }, 400);
    const auth = { Authorization: `Bearer ${accessToken}` };

    // Date window (default: last 365 days; hard-capped at 365).
    const now = new Date();
    let to = toISO ? new Date(toISO) : now;
    let from = fromISO ? new Date(fromISO) : new Date(now.getTime() - 365 * 864e5);
    const maxSpan = 365 * 864e5;
    if (to.getTime() - from.getTime() > maxSpan) from = new Date(to.getTime() - maxSpan);
    const fromStr = from.toISOString();
    const toStr = to.toISOString();

    // hasAttachments + received in [from, to], newest first. No KQL $search.
    const filter = encodeURIComponent(`hasAttachments eq true and receivedDateTime ge ${fromStr} and receivedDateTime le ${toStr}`);
    const order = encodeURIComponent('receivedDateTime desc');
    let url: string | undefined =
      `${GRAPH}/me/messages?$filter=${filter}&$orderby=${order}&$top=50&$select=id,subject,from,hasAttachments,receivedDateTime`;

    // Page through @odata.nextLink until the window is exhausted or we hit caps.
    const msgs: any[] = [];
    let pages = 0;
    while (url && pages < 30 && msgs.length < MAX_MSGS) {
      const r = await fetch(url, { headers: auth });
      const j = await r.json();
      if (j.error) {
        if (pages === 0) return json({ error: 'Graph: ' + (j.error.message || 'search failed') }, 200);
        break; // partial results are fine
      }
      for (const m of j.value ?? []) msgs.push(m);
      url = j['@odata.nextLink'];
      pages++;
    }

    let filtered = msgs;
    if (query) {
      const q = String(query).toLowerCase();
      filtered = msgs.filter((m: any) => (m.subject || '').toLowerCase().includes(q));
    }

    const attachments: { fileName: string; contentBase64: string; from: string; date: string }[] = [];
    for (const m of filtered) {
      if (attachments.length >= MAX_ATTACHMENTS) break;
      const from = m.from?.emailAddress?.address ?? '';
      const date = m.receivedDateTime ?? '';
      const attRes = await fetch(`${GRAPH}/me/messages/${m.id}/attachments?$select=name,contentType,contentBytes`, { headers: auth });
      const att = await attRes.json();
      for (const a of att.value ?? []) {
        const isFile = a['@odata.type'] === '#microsoft.graph.fileAttachment';
        if (isFile && /\.pdf$/i.test(a.name || '') && a.contentBytes) {
          attachments.push({ fileName: a.name, contentBase64: a.contentBytes, from, date });
        }
        if (attachments.length >= MAX_ATTACHMENTS) break;
      }
    }
    return json({ attachments, scanned: filtered.length, from: fromStr, to: toStr });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 200);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
