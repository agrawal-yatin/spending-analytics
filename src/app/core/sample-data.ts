import { AppData, Statement, Transaction } from './models';
import { enrichTxns, monthLabel } from './finance';

export const uid = () => Math.random().toString(36).slice(2, 9);

export function blankData(): AppData {
  return {
    people: [], accounts: [], assets: [], statements: [],
    settings: {
      gold: 7100, silver: 92,
      fx: { INR: 1, USD: 83, GBP: 105, EUR: 90, AED: 22.6 },
      pwFormats: [
        { bank: 'HDFC Bank', fmt: 'First 4 letters of name (CAPS) + DDMM of DOB — e.g. YATI0703' },
        { bank: 'ICICI Bank', fmt: 'First 4 letters of first name (CAPS) + day & month of DOB' },
        { bank: 'SBI / SBI Card', fmt: 'Date of birth as DDMMYYYY' },
        { bank: 'Axis Bank', fmt: 'First 4 letters of name (CAPS) + DDMM of DOB' },
        { bank: 'American Express', fmt: 'First 4 letters of name + last 5 digits of card' },
      ],
    },
  };
}

export function sampleData(): AppData {
  const d = blankData();
  const you = { id: uid(), name: 'Yatin', relation: 'Self', pans: [{ id: uid(), pan: 'ABCPY1234K', label: 'Primary' }] };
  const wife = { id: uid(), name: 'Priya', relation: 'Spouse', pans: [{ id: uid(), pan: 'FGHPS5678L' }] };
  const dau = { id: uid(), name: 'Aarohi', relation: 'Daughter', pans: [{ id: uid(), pan: 'JKLPA9012M', label: 'Minor' }] };
  d.people = [you, wife, dau];

  const hdfcSav = { id: uid(), institution: 'HDFC Bank', kind: 'savings' as const, personId: you.id, panId: you.pans[0].id, balance: 850000, currency: 'INR' as const, pwFormat: 'First 4 letters of name (CAPS) + DDMM of DOB' };
  const hdfcCard = { id: uid(), institution: 'HDFC Regalia', kind: 'creditcard' as const, personId: you.id, panId: you.pans[0].id, balance: 120000, currency: 'INR' as const, pwFormat: 'First 4 letters of name (CAPS) + DDMM of DOB' };
  d.accounts = [
    hdfcSav,
    { id: uid(), institution: 'Zerodha', kind: 'demat', personId: you.id, panId: you.pans[0].id, balance: 0, currency: 'INR' },
    { id: uid(), institution: 'Chase (US)', kind: 'savings', personId: you.id, balance: 18000, currency: 'USD' },
    hdfcCard,
    { id: uid(), institution: 'Amex Platinum', kind: 'creditcard', personId: you.id, panId: you.pans[0].id, balance: 65000, currency: 'INR' },
    { id: uid(), institution: 'ICICI Bank', kind: 'savings', personId: wife.id, panId: wife.pans[0].id, balance: 430000, currency: 'INR' },
    { id: uid(), institution: 'SBI Minor A/c', kind: 'savings', personId: dau.id, panId: dau.pans[0].id, balance: 150000, currency: 'INR' },
  ];
  d.assets = [
    { id: uid(), kind: 'shares', personId: you.id, symbol: 'INFY + TCS + HDFCBANK', platform: 'Zerodha (Kite)', qty: 180, buyPrice: 1250, currentPrice: 1520, currency: 'INR' },
    { id: uid(), kind: 'mutualfund', personId: you.id, symbol: 'Parag Parikh Flexi Cap', platform: 'Kite Coin', qty: 4200, buyPrice: 62, currentPrice: 78, currency: 'INR' },
    { id: uid(), kind: 'mutualfund', personId: wife.id, symbol: 'UTI Nifty Index', platform: 'IND Money', qty: 3100, buyPrice: 120, currentPrice: 141, currency: 'INR' },
    { id: uid(), kind: 'overseasstock', personId: you.id, symbol: 'AAPL + MSFT', platform: 'IND Money', qty: 35, buyPrice: 190, currentPrice: 236, currency: 'USD' },
    { id: uid(), kind: 'gold', personId: you.id, qty: 250, buyValue: 1400000, currency: 'INR' },
    { id: uid(), kind: 'silver', personId: wife.id, qty: 3000, buyValue: 210000, currency: 'INR' },
    { id: uid(), kind: 'realestate', personId: you.id, note: 'Flat in Pune', buyValue: 6500000, currentValue: 9200000, currency: 'INR' },
  ];
  d.statements = buildSampleStatements(hdfcCard.id, hdfcSav.id);
  return d;
}

function buildSampleStatements(cardId: string, bankId: string): Statement[] {
  const cardData: Record<string, [string, string, number][]> = {
    '2026-04': [['02/04/2026', 'SWIGGY BANGALORE', 640], ['05/04/2026', 'AMAZON.IN', 2350], ['08/04/2026', 'INDIAN OIL PETROL', 3000], ['12/04/2026', 'BIGBASKET', 1820], ['15/04/2026', 'NETFLIX SUBSCRIPTION', 649], ['18/04/2026', 'UBER TRIP', 420], ['22/04/2026', 'APOLLO PHARMACY', 980], ['26/04/2026', 'MYNTRA', 3100], ['29/04/2026', 'ZOMATO', 560]],
    '2026-05': [['03/05/2026', 'SWIGGY BANGALORE', 720], ['06/05/2026', 'MAKEMYTRIP FLIGHT', 18600], ['10/05/2026', 'DMART GROCERY', 2640], ['14/05/2026', 'SHELL FUEL', 2800], ['17/05/2026', 'BOOKMYSHOW PVR', 900], ['20/05/2026', 'AMAZON.IN', 1450], ['24/05/2026', 'SPOTIFY', 149], ['27/05/2026', 'ANNUAL FEE + GST', 2950], ['30/05/2026', 'OLA CABS', 380]],
    '2026-06': [['02/06/2026', 'ZOMATO', 880], ['05/06/2026', 'BLINKIT', 1240], ['09/06/2026', 'CROMA ELECTRONICS', 15900], ['13/06/2026', 'INDIGO AIRLINES', 9200], ['16/06/2026', 'HPCL FUEL', 3200], ['19/06/2026', '1MG PHARMACY', 640], ['22/06/2026', 'FLIPKART', 2760], ['25/06/2026', 'STARBUCKS', 420], ['28/06/2026', 'FINANCE CHARGE', 1180]],
  };
  const bankData: Record<string, [string, string, number, ('credit' | 'debit')?][]> = {
    '2026-05': [['01/05/2026', 'SALARY CREDIT ACME CORP', 285000, 'credit'], ['03/05/2026', 'UPI/RENT/LANDLORD', 45000], ['07/05/2026', 'ELECTRICITY BILL BESCOM', 2400], ['11/05/2026', 'SIP ZERODHA COIN', 25000], ['15/05/2026', 'AIRTEL BROADBAND', 1099], ['20/05/2026', 'ATM CASH WITHDRAWAL', 10000], ['26/05/2026', 'LIC PREMIUM NACH', 8400]],
    '2026-06': [['01/06/2026', 'SALARY CREDIT ACME CORP', 285000, 'credit'], ['03/06/2026', 'UPI/RENT/LANDLORD', 45000], ['08/06/2026', 'ELECTRICITY BILL BESCOM', 2650], ['11/06/2026', 'SIP ZERODHA COIN', 25000], ['16/06/2026', 'JIO POSTPAID', 799], ['21/06/2026', 'HOME LOAN EMI', 52000], ['27/06/2026', 'SCHOOL FEES', 38000]],
  };
  const out: Statement[] = [];
  const push = (accId: string, scope: 'card' | 'bank', data: Record<string, any[][]>, prefix: string) => {
    Object.keys(data).forEach((m) => {
      const txns: Transaction[] = enrichTxns(
        data[m].map((r) => ({ date: r[0], desc: r[1], amount: r[2], dir: (r[3] as any) || 'debit' })),
      );
      const total = txns.filter((t) => t.dir === 'debit').reduce((s, t) => s + t.amount, 0);
      out.push({ id: uid(), accountId: accId, scope, period: monthLabel(m), total, fileName: `${prefix}_${m}.csv`, txns, parsed: true, uploadedAt: Date.now() - Math.random() * 1e7 });
    });
  };
  push(cardId, 'card', cardData, 'HDFC_Regalia');
  push(bankId, 'bank', bankData, 'HDFC_Bank');
  return out;
}
