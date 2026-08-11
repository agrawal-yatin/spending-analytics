// ---- Domain model (mirror these as Swift structs in the SwiftUI app) ----

export type Currency = 'INR' | 'USD' | 'GBP' | 'EUR' | 'AED';

export type AccountKind =
  | 'savings' | 'current' | 'fd' | 'demat' | 'trading' | 'wallet' | 'creditcard' | 'loan';

export type AssetKind =
  | 'shares' | 'mutualfund' | 'overseasstock' | 'gold' | 'silver' | 'realestate' | 'other';

export type TxnDirection = 'debit' | 'credit';

export interface TaxIdentity {
  id: string;
  pan: string;
  label?: string;
}

export interface Person {
  id: string;
  name: string;
  relation?: string;
  pans: TaxIdentity[];
}

export interface Account {
  id: string;
  institution: string;
  kind: AccountKind;
  personId: string;
  panId?: string;
  balance: number;
  currency: Currency;
  /** Password rule for this bank's protected statements (used server-side to unlock). */
  pwFormat?: string;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  personId: string;
  currency: Currency;
  // investments (shares / mutualfund / overseasstock)
  symbol?: string;
  platform?: string;
  qty?: number;         // shares/units, or grams for metals
  buyPrice?: number;    // per unit
  currentPrice?: number;// per unit
  // metals use qty + buyValue; value = qty * spot
  buyValue?: number;
  // real estate / other
  currentValue?: number;
  note?: string;
}

export interface Transaction {
  date: string;
  desc: string;
  amount: number;       // always positive
  dir: TxnDirection;
  category: string;
  month: string;        // 'YYYY-MM'
}

export interface Statement {
  id: string;
  accountId: string;
  scope: 'card' | 'bank';
  pwFormat?: string;
  period?: string;
  total: number;
  fileName?: string;
  txns: Transaction[];
  parsed: boolean;
  uploadedAt: number;
}

export interface Settings {
  gold: number;   // INR per gram
  silver: number; // INR per gram
  fx: Record<Currency, number>; // INR per 1 unit
  pwFormats: { bank: string; fmt: string }[];
}

export interface AppData {
  people: Person[];
  accounts: Account[];
  assets: Asset[];
  statements: Statement[];
  settings: Settings;
}

export const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Shopping', 'Travel', 'Fuel', 'Utilities & Bills',
  'Entertainment', 'Health', 'Cash & Transfers', 'Fees & Interest', 'EMI & Loans',
  'Investments', 'Income', 'Other',
] as const;

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  savings: 'Savings', current: 'Current', fd: 'Fixed Deposit', demat: 'Demat',
  trading: 'Trading', wallet: 'Wallet/Cash', creditcard: 'Credit Card', loan: 'Loan',
};

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  shares: 'Shares', mutualfund: 'Mutual Funds', overseasstock: 'Overseas Stocks',
  gold: 'Gold', silver: 'Silver', realestate: 'Real Estate', other: 'Other',
};

export const LIABILITY_KINDS: AccountKind[] = ['creditcard', 'loan'];
export const INVEST_KINDS: AssetKind[] = ['shares', 'mutualfund', 'overseasstock'];
export const METAL_KINDS: AssetKind[] = ['gold', 'silver'];
