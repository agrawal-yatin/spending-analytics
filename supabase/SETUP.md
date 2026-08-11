# Enabling cloud sync (Supabase)

The app runs **local-first** out of the box — no backend needed. Follow these steps when you want multi-device sync across your family's phones/laptops. Nothing here changes local behaviour until the last step.

## 1. Create a Supabase project
1. Go to https://supabase.com → **New project** (free tier is fine).
2. Note your **Project URL** and **anon public key** from *Project Settings → API*.

## 2. Create the table
Open *SQL Editor* in Supabase, paste the contents of [`schema.sql`](./schema.sql), and run it. This creates `wealth_state` with row-level security so each user can only touch their own data.

## 3. Turn on email auth
*Authentication → Providers → Email* → enable it. For the built-in login screen we use a **6-digit email code** (OTP), so under *Authentication → Email Templates* the default "magic link" also sends a code — no extra config needed. (You can add Sign in with Apple later.)

## 4. Add your keys to the app
Edit `src/environments/environment.ts`:
```ts
export const environment = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',
};
```
> The anon key is safe to ship in a client app — RLS is what protects the data.

## 5. Install the client library
```bash
npm install @supabase/supabase-js
```

## 6. Flip the switch
In `src/app/app.config.ts`, swap the persistence adapter:
```ts
// import { LocalStorageAdapter } from './core/local-storage.adapter';
import { SupabaseAdapter } from './core/supabase.adapter';

// { provide: PersistenceAdapter, useClass: LocalStorageAdapter },
{ provide: PersistenceAdapter, useClass: SupabaseAdapter },
```

## 7. Login gate — already wired
The login gate is **already built into `app.component.ts`**, so there's nothing to do here:

- **No keys set** → `AuthService.configured` is false → the app runs local-first, no login shown.
- **Keys set** → the app shows the email-code login when signed out, and once you sign in it re-hydrates from your cloud data and shows a **Sign out** button in the top bar.

So after steps 1–6, just run `npm start`, sign in with your email + the 6-digit code, and your data syncs to Supabase. Open the app on another device, sign in with the same email → same data.

## Notes & next steps
- **v1 writes the whole state on each change.** Fine for a family's data size; when you outgrow it, migrate to the normalized tables sketched at the bottom of `schema.sql` and switch to per-entity reads/writes with Supabase Realtime for live updates.
- **Migrating your existing local data:** in the running app before switching, use *Settings → Export JSON*. After enabling cloud + signing in, we can add a one-time "import JSON" to push it up (say the word and I'll add the button).
- **Heavy/sensitive work** (PDF statement unlocking + parsing, Kite OAuth, price fetch) belongs in **Supabase Edge Functions** next, so it's shared with the future SwiftUI app and secrets never touch the client.
