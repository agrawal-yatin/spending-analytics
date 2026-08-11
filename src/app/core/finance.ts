// ---- Pure business logic. No Angular, no DOM. Port these rules to Swift 1:1. ----

import {
  Account, Asset, AppData, Settings, Transaction, TxnDirection,
  LIABILITY_KINDS, INVEST_KINDS, METAL_KINDS,
} from './models';

export function fmtINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function toINR(amount: number, currency: string, settings: Settings): number {
  const rate = (settings.fx as Record<string, number>)[currency] ?? 1;
  return amount * rate;
}

/** Signed INR value of an account: liabilities are negative. */
export function accountINR(a: Account, s: Settings): number {
  const v = toINR(a.balance || 0, a.currency, s);
  return LIABILITY_KINDS.includes(a.kind) ? -v : v;
}

export function isInvestment(a: Asset): boolean { return INVEST_KINDS.includes(a.kind); }
export function isMetal(a: Asset): boolean { return METAL_KINDS.includes(a.kind); }

export function assetCurrentINR(a: Asset, s: Settings): number {
  if (isMetal(a)) return (a.qty || 0) * (a.kind === 'gold' ? s.gold : s.silver);
  if (isInvestment(a)) return toINR((a.qty || 0) * (a.currentPrice || 0), a.currency, s);
  return toINR(a.currentValue || 0, a.currency, s);
}

export function assetBuyINR(a: Asset, s: Settings): number {
  if (isInvestment(a)) return toINR((a.qty || 0) * (a.buyPrice || 0), a.currency, s);
  return toINR(a.buyValue || 0, a.currency, s);
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  investments: number;
  net: number;
}

export function netWorth(data: AppData, personId: string | 'all'): NetWorth {
  const s = data.settings;
  let assets = 0, liabilities = 0, investments = 0;
  data.accounts
    .filter((a) => personId === 'all' || a.personId === personId)
    .forEach((a) => { const v = accountINR(a, s); if (v >= 0) assets += v; else liabilities += -v; });
  data.assets
    .filter((a) => personId === 'all' || a.personId === personId)
    .forEach((a) => { const v = assetCurrentINR(a, s); assets += v; if (isInvestment(a)) investments += v; });
  return { assets, liabilities, investments, net: assets - liabilities };
}

// ---- Categorization ----

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

export function categorize(desc: string): string {
  const d = String(desc || '');
  for (const [cat, re] of CAT_RULES) if (re.test(d)) return cat;
  return 'Other';
}

// ---- Date helpers ----

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDate(s: string): Date | null {
  if (!s) return null;
  s = String(s).trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; const mo = MONTHS[m[2].toLowerCase()]; if (mo != null) return new Date(y, mo, +m[1]); }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function monthKey(s: string): string {
  const d = parseDate(s);
  if (!d) return 'unknown';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function monthLabel(key: string): string {
  if (key === 'unknown') return 'Undated';
  const [y, mo] = key.split('-');
  const nm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return nm[+mo - 1] + ' ' + y;
}

export function enrichTxns(raw: Partial<Transaction>[]): Transaction[] {
  return raw.map((t) => ({
    date: t.date || '',
    desc: t.desc || '',
    amount: t.amount || 0,
    dir: (t.dir as TxnDirection) || 'debit',
    category: t.category || categorize(t.desc || ''),
    month: monthKey(t.date || ''),
  }));
}

// ---- CSV statement parser (client-side). PDFs are unlocked/parsed server-side. ----

export function parseCsvStatement(text: string): { txns: Transaction[]; total: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { txns: [], total: 0 };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l: string) => l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim());

  let headerIdx = 0, header = split(lines[0]);
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const h = split(lines[i]).map((x) => x.toLowerCase());
    if (h.some((x) => /date/.test(x)) && h.some((x) => /amount|amt|debit|credit|withdraw|deposit/.test(x))) {
      headerIdx = i; header = split(lines[i]); break;
    }
  }
  const hl = header.map((x) => x.toLowerCase());
  const dateCol = hl.findIndex((x) => /date/.test(x));
  const amtCol = hl.findIndex((x) => /amount|amt/.test(x));
  const debCol = hl.findIndex((x) => /debit|withdraw/.test(x));
  const credCol = hl.findIndex((x) => /credit|deposit/.test(x));
  const typeCol = hl.findIndex((x) => /type|dr\/cr|cr\/dr/.test(x));
  const descCol = hl.findIndex((x) => /desc|narration|particular|detail|merchant|transaction|remarks/.test(x));
  const num = (v: string) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

  const rows: Partial<Transaction>[] = [];
  let total = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = split(lines[i]);
    if (c.length < 2) continue;
    const date = dateCol >= 0 ? c[dateCol] : c[0];
    let amount = 0; let dir: TxnDirection = 'debit';
    if (debCol >= 0 || credCol >= 0) {
      const deb = debCol >= 0 ? num(c[debCol]) : 0;
      const cred = credCol >= 0 ? num(c[credCol]) : 0;
      if (cred > 0 && cred >= deb) { amount = cred; dir = 'credit'; } else { amount = deb; dir = 'debit'; }
    } else {
      const raw = amtCol >= 0 ? c[amtCol] : c[c.length - 1];
      amount = Math.abs(num(raw));
      const t = (typeCol >= 0 ? c[typeCol] : raw) || '';
      if (/(^|\s)cr\b|credit|deposit/i.test(t) || num(raw) < 0) dir = 'credit';
    }
    if (!amount) continue;
    const desc = descCol >= 0 ? c[descCol] : c[1] || '';
    rows.push({ date, desc, amount, dir });
    if (dir === 'debit') total += amount;
    if (rows.length >= 1000) break;
  }
  return { txns: enrichTxns(rows), total };
}
