# Connect Zerodha (Kite Connect)

Auto-imports your Zerodha equity + mutual-fund holdings into the app. Requires cloud mode (the `api_secret` lives only as a Supabase secret, never in the browser).

## 1. Create a Kite Connect app
1. Go to https://developers.kite.trade/ → **Create new app** (Kite Connect). It costs ₹500/month per app, or is free on the personal tier for holdings/positions.
2. Set the **Redirect URL** to exactly where the app runs, e.g. `http://localhost:4200/` in dev or your deployed URL.
3. Note the **API key** and **API secret**.

## 2. Store the secret in Supabase
```bash
supabase secrets set KITE_API_KEY=your_api_key KITE_API_SECRET=your_api_secret
supabase functions deploy kite
```

## 3. Add the API key to the app
`src/environments/environment.ts`:
```ts
kiteApiKey: 'your_api_key',
```
(Only the key — never the secret — goes in the client.)

## 4. Use it
With Supabase cloud mode on and signed in, the **🔗 Connect Zerodha** button appears on the *Investments & Assets* screen.

1. Pick the family member in the top-right filter (holdings import against that person; "Whole family" uses the first person).
2. Click **Connect Zerodha** → log in on Kite → you're redirected back.
3. The app exchanges the token via the `kite` Edge Function and imports your equity (as *Shares*, platform "Zerodha (Kite)") and mutual funds (as *Mutual Funds*, platform "Kite Coin").

Re-syncing replaces the previous Zerodha/Coin holdings for that person, so quantities and prices stay current.

## Notes
- Kite **access tokens expire daily** — you log in again each day you want a fresh pull. (A later enhancement can store the token for same-day re-pulls.)
- Only **holdings** are imported (long-term positions). Intraday positions and the order book aren't part of net worth.
- Smallcase/IND Money aren't covered here — Smallcase holdings show through your broker; IND Money has no export API (enter manually).
