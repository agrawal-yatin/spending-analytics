// Supabase Edge Function: parse-statement
// -----------------------------------------------------------------------------
// Unlocks a password-protected PDF (or reads a CSV) and returns categorized
// transactions. Runs on Deno. This is the server-side counterpart to the
// client's local CSV parser — the place where real PDF unlocking belongs, so
// the same endpoint can later serve the SwiftUI app too.
//
// Request  (POST JSON): { fileName: string, contentBase64: string, password?: string }
// Response (JSON):      { parsed: boolean, total: number, txns: Txn[], note?: string }
//
// Deploy:  supabase functions deploy parse-statement
// See supabase/EDGE-FUNCTIONS.md for full setup (CORS, JWT, testing).
// -----------------------------------------------------------------------------

import { resolvePDFJS } from 'https://esm.sh/pdfjs-serverless@0.5.0';

interface Txn {
  date: string;
  desc: string;
  amount: number;
  dir: 'debit' | 'credit';
  category: string;
  month: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---- categorization (kept in sync with src/app/core/finance.ts) ----
const CAT_RULES: [string, RegExp][] = [
  ['Food & Dining', /swiggy|zomato|restaurant|cafe|coffee|starbucks|dominos|pizza|mcdonald|kfc|dine|eatery|bakery|barbeque|biryani|dunkin/i],
  ['Groceries', /bigbasket|blinkit|zepto|dmart|d-mart|grofers|reliance fresh|more supermarket|grocery|supermarket|instamart|jiomart/i],
  ['Shopping', /amazon|flipkart|myntra|ajio|nykaa|meesho|shop|mart|store|lifestyle|shoppers|croma|reliance digital|decathlon|ikea|apparel/i],
  ['Travel', /uber|ola|rapido|irctc|makemytrip|goibibo|indigo|vistara|air ?india|akasa|redbus|ixigo|cleartrip|flight|hotel|oyo|airbnb|metro|toll|fastag/i],
  ['Fuel', /fuel|petrol|diesel|hpcl|bpcl|indian oil|ioc|shell|petro|filling station|gas station/i],
  ['Utilities & Bills', /electricity|water bill|gas bill|broadband|airtel|jio|vodafone|vi |bsnl|act fibernet|tata play|dth|recharge|bescom|mseb|bill pay|postpaid|utility/i],
  ['Entertainment', /netflix|spotify|prime video|hotstar|disney|bookmyshow|pvr|inox|youtube|gaming|steam|playstation|apple\.com\/bill|subscription/i],
  ['Health', /pharmacy|apollo|medplus|pharmeasy|1mg|hospital|clinic|diagnostic|medical|doctor|dental|lab test|healthcare/i],
  ['Cash & Transfers', /atm|cash withdrawal|upi\/|imps|neft|rtgs|transfer|paytm|phonepe|gpay|google pay|self|to a\/c|fund transfer/i],
  ['Fees & Interest', /interest|late fee|finance charge|annual fee|gst|service charge|penalty|charges|surcharge|markup/i],
  ['EMI & Loans', /emi|loan|installment|instalment|nach|mandate/i],
  ['Investments', /zerodha|groww|coin|mutual fund|sip|indmoney|ind money|nse|bse|broking|demat|smallcase|upstox/i],
  ['Income', /salary|credit interest|refund|reversal|cashback|reimbursement|dividend|interest credit|received|neft cr|imps cr/i],
];
function categorize(desc: string): string {
  for (const [cat, re] of CAT_RULES) if (re.test(desc || '')) return cat;
  return 'Other';
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseDate(s: string): Date | null {
  if (!s) return null;
  s = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; const mo = MONTHS[m[2].toLowerCase()]; if (mo != null) return new Date(y, mo, +m[1]); }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function monthKey(s: string): string {
  const d = parseDate(s);
  if (!d) return 'unknown';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function enrich(raw: { date: string; desc: string; amount: number; dir: 'debit' | 'credit' }[]): Txn[] {
  return raw.map((t) => ({ ...t, category: categorize(t.desc), month: monthKey(t.date) }));
}

// ---- CSV ----
function parseCsv(text: string): { txns: Txn[]; total: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { txns: [], total: 0 };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l: string) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim());
  let hi = 0, header = split(lines[0]);
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const h = split(lines[i]).map((x) => x.toLowerCase());
    if (h.some((x) => /date/.test(x)) && h.some((x) => /amount|amt|debit|credit|withdraw|deposit/.test(x))) { hi = i; header = split(lines[i]); break; }
  }
  const hl = header.map((x) => x.toLowerCase());
  const iDate = hl.findIndex((x) => /date/.test(x));
  const iAmt = hl.findIndex((x) => /amount|amt/.test(x));
  const iDeb = hl.findIndex((x) => /debit|withdraw/.test(x));
  const iCred = hl.findIndex((x) => /credit|deposit/.test(x));
  const iType = hl.findIndex((x) => /type|dr\/cr|cr\/dr/.test(x));
  const iDesc = hl.findIndex((x) => /desc|narration|particular|detail|merchant|transaction|remarks/.test(x));
  const num = (v: string) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  const rows: { date: string; desc: string; amount: number; dir: 'debit' | 'credit' }[] = [];
  let total = 0;
  for (let i = hi + 1; i < lines.length; i++) {
    const c = split(lines[i]); if (c.length < 2) continue;
    const date = iDate >= 0 ? c[iDate] : c[0];
    let amount = 0; let dir: 'debit' | 'credit' = 'debit';
    if (iDeb >= 0 || iCred >= 0) {
      const deb = iDeb >= 0 ? num(c[iDeb]) : 0; const cred = iCred >= 0 ? num(c[iCred]) : 0;
      if (cred > 0 && cred >= deb) { amount = cred; dir = 'credit'; } else { amount = deb; dir = 'debit'; }
    } else {
      const raw = iAmt >= 0 ? c[iAmt] : c[c.length - 1]; amount = Math.abs(num(raw));
      const t = (iType >= 0 ? c[iType] : raw) || '';
      if (/(^|\s)cr\b|credit|deposit/i.test(t) || num(raw) < 0) dir = 'credit';
    }
    if (!amount) continue;
    const desc = iDesc >= 0 ? c[iDesc] : c[1] || '';
    rows.push({ date, desc, amount, dir });
    if (dir === 'debit') total += amount;
    if (rows.length >= 2000) break;
  }
  return { txns: enrich(rows), total };
}

// ---- PDF: unlock with password, extract text, heuristically parse lines ----
async function pdfToText(bytes: Uint8Array, password?: string): Promise<string> {
  const { getDocument } = await resolvePDFJS();
  const doc = await getDocument({ data: bytes, password: password || undefined, useSystemFonts: true }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items as { str: string; hasEOL?: boolean }[]) {
      line += item.str + ' ';
      if (item.hasEOL) { out += line.trim() + '\n'; line = ''; }
    }
    if (line.trim()) out += line.trim() + '\n';
    out += '\n';
  }
  return out;
}

const DATE_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\.?\s+\d{2,4})/;
const AMT_RE = /(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2})/g;

function parseStatementText(text: string): { txns: Txn[]; total: number } {
  const rows: { date: string; desc: string; amount: number; dir: 'debit' | 'credit' }[] = [];
  let total = 0;
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const dm = line.match(DATE_RE);
    if (!dm) continue;
    const amounts = line.match(AMT_RE);
    if (!amounts || !amounts.length) continue;
    const amount = parseFloat(amounts[amounts.length - 1].replace(/,/g, ''));
    if (isNaN(amount) || amount === 0) continue;
    const dir: 'debit' | 'credit' = /\bcr\b|credit|deposit/i.test(line) ? 'credit' : 'debit';
    let desc = line.replace(dm[0], ' ');
    for (const a of amounts) desc = desc.replace(a, ' ');
    desc = desc.replace(/\b(dr|cr)\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
    rows.push({ date: dm[0], desc: desc || 'Transaction', amount, dir });
    if (dir === 'debit') total += amount;
    if (rows.length >= 2000) break;
  }
  return { txns: enrich(rows), total };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { fileName, contentBase64, password } = await req.json();
    if (!fileName || !contentBase64) {
      return new Response(JSON.stringify({ error: 'fileName and contentBase64 required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const bytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));

    let result: { txns: Txn[]; total: number };
    let note: string | undefined;

    if (/\.(csv|txt)$/i.test(fileName)) {
      result = parseCsv(new TextDecoder().decode(bytes));
    } else {
      try {
        const text = await pdfToText(bytes, password);
        result = parseStatementText(text);
        if (!result.txns.length) note = 'PDF unlocked but no transactions matched — this bank layout may need a custom parser.';
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        const wrongPw = /password|encrypted/i.test(msg);
        return new Response(JSON.stringify({
          parsed: false, total: 0, txns: [],
          error: wrongPw ? 'Could not unlock the PDF — check the password format.' : 'PDF parse failed: ' + msg,
        }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ parsed: result.txns.length > 0, total: result.total, txns: result.txns, note }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
