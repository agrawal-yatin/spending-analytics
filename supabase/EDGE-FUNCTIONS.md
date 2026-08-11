# Edge Function: `parse-statement`

Server-side statement parsing — unlocks password-protected PDFs and returns categorized transactions. The client calls it automatically in cloud mode (signed in); in local mode it isn't used and CSV parsing stays in the browser.

Source: [`functions/parse-statement/index.ts`](./functions/parse-statement/index.ts) (Deno).

## Deploy

Prerequisites: the [Supabase CLI](https://supabase.com/docs/guides/cli) and a project already created (see `SETUP.md`).

```bash
# from the project root
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy parse-statement
```

That's it — no extra secrets are required. The function only reads the uploaded bytes + password from the request body; it doesn't touch the database.

## How the client uses it

`src/app/core/statement-parse.service.ts` calls it via `supabase.functions.invoke('parse-statement', …)` whenever the user is signed in. Request body:

```jsonc
{ "fileName": "HDFC_Regalia_Jun.pdf", "contentBase64": "…", "password": "YATI0703" }
```

Response:

```jsonc
{ "parsed": true, "total": 34210, "txns": [ { "date": "02/06/2026", "desc": "ZOMATO", "amount": 880, "dir": "debit", "category": "Food & Dining", "month": "2026-06" } ] }
```

For encrypted PDFs, the Credit Cards screen prompts for the actual password (showing the bank's password *format* as a hint) and passes it through. The password is sent to your own Supabase function over HTTPS and is never stored.

## Notes & limits

- **PDF text extraction** uses `pdfjs-serverless`. Unlocking works with the correct password; if it's wrong you get a clear "check the password format" message.
- **Transaction extraction from PDFs is heuristic** (finds lines with a date + amount). It handles many common Indian bank/card layouts but not all — some banks will need a tailored parser. CSV parsing is exact. When a layout doesn't match, the function returns `parsed: false` with a note so you can fall back to the CSV export or add a parser for that bank.
- **Auth:** Supabase requires a valid JWT by default, so only signed-in users can call it. Keep that default on.
- **CORS** is handled in the function for browser calls.
- **Next step (optional):** persist parsed statements straight into normalized `statements`/`transactions` tables from the function, so parsing and storage happen in one server round-trip and the SwiftUI app reuses the exact same endpoint.

## Local testing (optional)

```bash
supabase functions serve parse-statement --no-verify-jwt
# then POST a small CSV as base64 to http://localhost:54321/functions/v1/parse-statement
```
