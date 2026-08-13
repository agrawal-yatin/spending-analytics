# Import statements from Outlook / Microsoft 365 (beta)

Scans your Outlook mailbox for statement PDFs and stages them on matching accounts. Microsoft counterpart of the Gmail flow — use this if your bank mail is on Outlook / Hotmail / Microsoft 365.

## What it does
1. You authorize Mail.Read access (Microsoft sign-in via Supabase Azure provider).
2. The `outlook-statements` Edge Function searches recent mail for statement-like messages with PDF attachments (Microsoft Graph) and returns them.
3. The app matches each to an account (by institution name in filename/sender) and stages a statement. Unencrypted PDFs auto-parse; **encrypted PDFs are staged unparsed** — open them and enter the password.

## Setup
### 1. Register an Azure app
- Go to https://portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
- Supported account types: choose one that includes **personal Microsoft accounts** if your Outlook is personal (e.g. "Accounts in any org directory and personal Microsoft accounts").
- **Redirect URI** (type: Web): your Supabase auth callback → `https://rzjhndthdfephvijnbnf.supabase.co/auth/v1/callback`.
- Under **API permissions** → add Microsoft Graph **delegated** permission **Mail.Read** (and `offline_access`, `openid`, `email`). Grant/consent.
- Under **Certificates & secrets** → create a **client secret**; note the **Application (client) ID** + secret value.

### 2. Enable the provider in Supabase
- Supabase → **Authentication → Providers → Azure** → paste the client ID + secret, set the Azure tenant to `common` (for personal + work accounts), enable.

### 3. Deploy the function
```bash
supabase functions deploy outlook-statements
```

## Use
Cloud mode, signed in → **Settings → Import statements from email → 📧 Fetch from Outlook**. First run redirects to Microsoft to grant Mail.Read; after returning, click it again to fetch. Matched statements appear on their accounts / Credit Cards screen.

## Notes & limits
- **Passwords:** encrypted statement PDFs still need the per-bank password to parse (never stored) — the tool stages them and you unlock via the password prompt.
- **Matching** is by institution keyword — name accounts to match how the bank appears in your email for best hit-rate.
- **Search scope:** statement-like keywords with PDF attachments (tweak in the function's `DEFAULT_SEARCH`).
- Signing in with Microsoft here is a *separate* authorization from your app's email-code login; it only grants read access to your mail.
