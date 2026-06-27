# Eltop Dealer App

B2B dealer ordering platform for Eltop electrical products. React + Vite frontend, Supabase for auth/database.

## Local development

```
npm install
npm run dev
```

The app works without Supabase configured — it falls back to the static product/invoice data in `src/data/`, and login accepts any OTP. Connect Supabase (below) to switch to real auth and a live database.

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` to create the `profiles`, `products`, `orders`, `order_items`, and `invoices` tables (with RLS policies and an auto-create-profile trigger on signup).
3. Run `supabase/seed.sql` to load the 83 Eltop products. Regenerate it after editing `src/data/products.js` with:
   ```
   npm run generate-seed
   ```
4. In **Authentication → Providers**, enable **Phone** sign-in (requires an SMS provider like Twilio/MessageBird configured under Authentication → Providers → Phone).
5. Copy `.env.example` to `.env` and fill in your project's URL and anon key (Project Settings → API):
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
6. Restart `npm run dev`. Once `.env` is set, the app will:
   - Send real OTPs via SMS for login (`src/screens/Login.jsx`)
   - Load products from the `products` table instead of the static file
   - Load/save invoices and orders per logged-in dealer
   - Auto-create a `profiles` row (with a generated dealer code) for every new signed-up user

## Project structure

- `src/screens/` — one component per app screen (Login, Dashboard, Catalogue, ProductDetail, Cart, OrderConfirm, OrderTracking, Ledger, Profile)
- `src/components/` — shared layout (`PhoneFrame`, `BottomNav`)
- `src/context/AppContext.jsx` — cart, auth, and data-fetching state, shared via `useApp()`
- `src/lib/supabase.js` — Supabase client (`null` until env vars are set)
- `src/data/` — static fallback data, used until Supabase is connected
- `supabase/schema.sql` — table definitions + RLS policies
- `supabase/seed.sql` — generated product seed data (`npm run generate-seed` to regenerate)
- `public/images/` — product photos extracted from the Eltop catalogue PDFs
