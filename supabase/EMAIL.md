# Import statements from Gmail (beta)

Scans your Gmail for statement PDFs and stages them on matching accounts. This is the most setup-heavy integration and the least tested — treat it as beta.

## What it does
1. You authorize Gmail read-only access (Google sign-in via Supabase).
2. The `gmail-statements` Edge Function searches recent emails with PDF attachments matching statement keywords and returns those attachments.
3. The app matches each attachment to an account (by institution name in the filename/sender) and stages a statement. Unencrypted PDFs auto-parse; **encrypted PDFs are staged unparsed** — open them from the account and enter the password to parse (bank passwords are never stored).

## Setup
### 1. Google Cloud OAuth
- Create/choose a project in Google Cloud Console → *APIs & Services*.
- Enable the **Gmail API**.
- Configure the OAuth consent screen; add the scope `.../auth/gmail.readonly`. While in "testing", add your family's emails as test users.
- Create an **OAuth client ID** (Web). Authorized redirect URI = your Supabase auth callback: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.

### 2. Supabase Google provider
- Supabase → *Authentication → Providers → Google* → paste the client ID + secret, enable.

### 3. Deploy the function
```bash
supabase functions deploy gmail-statements
```

## Use
Cloud mode, signed in → *Settings → "Import statements from Gmail (beta)"*. First run redirects to Google to grant Gmail access; after returning, click it again to fetch. Matched statements appear on their accounts / Credit Cards screen.

## Limitations & notes
- **Passwords:** encrypted statement PDFs still need the per-bank password to parse; the tool stages them and you unlock via the normal upload/password prompt. (Deliberate — we never store bank passwords.)
- **Matching** is by institution keyword; rename accounts to match how the bank appears in emails for best results, or attach manually.
- **Scope of search:** last ~120 days, PDF attachments, statement-like keywords (tweakable in the Edge Function's `DEFAULT_Q`).
- Google keeps `gmail.readonly` in the "restricted" scope category; for personal/family use in "testing" mode this is fine. Publishing publicly would require Google verification.
