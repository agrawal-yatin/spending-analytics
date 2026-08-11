# FamilyWealth PWA (Angular)

A local-first, installable Angular PWA for tracking your family's net worth and spending across bank accounts, credit cards, Demat/trading accounts, investments, and physical assets — the web frontend of the FamilyWealth project. Built to be **Supabase-ready**: all data flows through one adapter you swap later, so nothing here is throwaway.

Requires **Node 18.19+ or 20+**.

## Run it

```bash
cd familywealth-pwa
npm install
npm start          # ng serve → http://localhost:4200
```

Build for production (this is what you'd deploy / test PWA install on):

```bash
npm run build      # outputs to dist/familywealth-pwa
npx http-server dist/familywealth-pwa/browser -p 8080   # or any static server over HTTPS
```

> The service worker only activates in a production build served over HTTPS (or localhost). `ng serve` runs without it, which is normal for development.

It boots seeded with a sample family (you, spouse, daughter) plus three months of card spend and two months of bank activity, so every screen is populated immediately. Use **Settings → Erase all data** to start clean, or **Load sample family** to restore it.

## What works today

- **Dashboard** — consolidated family net worth or per-person view (top-right filter), allocation breakdown, per-person bars.
- **Accounts** — add/edit/delete bank/Demat/trading/wallet accounts with owner, PAN, currency (auto-converted to ₹), and a statement password format.
- **Credit Cards** — per-card outstanding + **statement upload**. CSV statements are parsed live into categorized transactions; PDFs are stored with a summary (real unlocking happens server-side later).
- **Spending** — auto-categorized transactions from *both* cards and bank statements, month-over-month trend, category breakdown, editable categories, month filter, person filter.
- **Investments & Assets** — shares, mutual funds, overseas stocks (with platform + live gain/loss), gold/silver (valued off spot), real estate.
- **People & PANs** — family members, each with multiple PANs.
- **Settings** — metal spot prices, FX rates, per-bank password formats, export JSON, load sample, erase.

## How it's structured

```
src/app/
  core/
    models.ts               Types — the domain model. Mirror these as Swift structs later.
    finance.ts              PURE logic: valuation, FX, net worth, categorization, date parsing, CSV parse.
    persistence.ts          PersistenceAdapter abstract class — the one seam to the backend.
    local-storage.adapter.ts LocalStorage implementation (v1).
    data.service.ts         Signal store + all mutations. The Angular "view-model".
    sample-data.ts          Seed + sample statements.
  features/
    dashboard | accounts | cards | spending | assets | people | settings   (one standalone component each)
  app.component.ts          Shell: brand, person filter, tab nav, router-outlet.
  app.routes.ts             Lazy-loaded routes.
  app.config.ts             Providers — router, service worker, and the adapter binding.
```

**Design principles baked in:**

1. **All business rules live in `core/finance.ts`** as pure functions — no Angular, no DOM. This is deliberate: when you build the SwiftUI app, you port these functions to Swift almost line-for-line, and both apps behave identically. (Better still, move them into a Supabase Edge Function so there's only one copy.)
2. **State is signals** (`DataService`). Components read `store.netWorth()`, `store.accountsInScope()`, etc. and call mutation methods. This maps directly to an `@Observable` view-model in SwiftUI.
3. **One persistence seam.** Every read/write goes through `PersistenceAdapter`. Local storage today; Supabase tomorrow.

## Adding a screen or field

- **New field:** add it to the interface in `models.ts`, include it in the relevant form component, and the store/persistence carry it automatically.
- **New screen:** create `features/foo.component.ts` (standalone), add a lazy route in `app.routes.ts`, add a `<a routerLink>` in `app.component.ts`.
- Reference the original HTML prototype for any screen behavior you want to match.

## Cloud sync (Supabase) — ready to activate

The backend groundwork is already in the project:

- `supabase/schema.sql` — the table + row-level security to run in your Supabase project.
- `supabase/SETUP.md` — **step-by-step guide to turn on cloud sync** (create project, run SQL, add keys, flip one line).
- `src/app/core/supabase.adapter.ts`, `supabase.client.ts`, `auth.service.ts`, and `src/app/features/login.component.ts` — the cloud adapter + email-code login, ready to wire.

Persistence is already **async** (`PersistenceAdapter` returns Promises), so switching from local to cloud needs no refactor — just follow `supabase/SETUP.md`.

### How the swap works (summary)

When you're ready for multi-device family sync, you do **not** rewrite the app:

1. Create a Supabase project; model the tables to match `models.ts` (people, tax_identities, accounts, assets, statements, transactions, settings) with row-level security per household.
2. `npm install @supabase/supabase-js`.
3. Add `core/supabase.adapter.ts` implementing `PersistenceAdapter` (`load()` / `save()`), or split into granular per-entity calls with Realtime subscriptions.
4. Change **one line** in `app.config.ts`:
   ```ts
   { provide: PersistenceAdapter, useClass: SupabaseAdapter }
   ```
5. Move the heavy/sensitive logic (statement PDF unlocking + parsing, Kite OAuth token exchange, price/FX fetch, categorization) into **Supabase Edge Functions** (TypeScript) so it's shared by this web app and the future SwiftUI app, and secrets never touch the client.

## Known placeholders

- PWA icons in `src/assets/icons/` are simple placeholders — replace with real 192×192 and 512×512 artwork before shipping.
- PDF statements are stored but not parsed in the browser (no client-side PDF unlocking). That job belongs in an Edge Function; CSV parsing works fully client-side and demonstrates the flow.
- No authentication yet — add Supabase Auth / Sign in with Apple when you add the backend.

## Roadmap fit

This PWA is Phase-1 of the larger plan (shared backend → SwiftUI multiplatform → Angular PWA → native polish). Because the logic is pure and the persistence is behind an adapter, everything you build here carries straight into the Supabase backend and the SwiftUI app.
