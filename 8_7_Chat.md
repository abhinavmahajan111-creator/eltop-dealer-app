# Eltop Dealer App — Session Reference (as of 9 July 2026, ~12:15 PM)

**Purpose:** Paste this into a new chat to give Claude full context on the Eltop Dealer App project without re-explaining everything. Image limit was hit in the previous session, so this captures everything discussed and built.

---

## PROJECT BASICS

- **Project:** Eltop Dealer App — D2C + dealer B2B e-commerce platform for Eltop by Embassy (Embassy Electricals India Pvt. Ltd.)
- **Live site:** eltopbyembassy.com
- **Admin panel:** eltopbyembassy.com/admin
- **Stack:** React/Vite/Tailwind frontend, Supabase (Postgres + Auth) backend, Razorpay payments (LIVE mode), hosted on Vercel
- **Repo:** GitHub — `abhinavmahajan111-creator/eltop-dealer-app` (branch: `master`)
- **Developer:** Abhinav Mahajan (builds via Claude Code, desktop app)
- **Business owner / PM:** Sumaksh Mahajan
- **Working pattern:** Sumaksh directs Claude (this chat) → Claude gives exact prompts → Abhinav pastes into Claude Code → Claude Code proposes diffs → Sumaksh reviews → apply → test → verify with screenshots. Claude Code does NOT have direct Supabase DB access — SQL is always run manually by Sumaksh/Abhinav in the Supabase SQL Editor.
- **A `CLAUDE.md` file exists in the project root** (same folder as `package.json`) with mandatory self-check rules Claude Code follows every session — RLS policy reminders, filter-pattern consistency, delete/restore checks, payment/auth flagging, hook-import checking, edge-case checking (error-type conflation, race conditions, binary-state assumptions), and **mandatory Vercel deployment verification after every push** (a build can succeed on `git push` but still fail on Vercel — this must always be checked before considering a task done).

---

## GIT / BACKUP INFRASTRUCTURE (already set up)

- `quick-push.bat` and `auto-push.bat` scripts exist in the project folder for one-click / scheduled backup (Task Scheduler can be configured to run `auto-push.bat` daily).
- Standard manual backup: open terminal in the project folder, run `git add -A && git commit -m "..." && git push`.
- **CRITICAL LESSON LEARNED:** A push succeeding does NOT mean the site updated — 4 consecutive Vercel deployments failed silently for ~19 hours while testing continued against a stale build. **Always check the Vercel deployments page after every push and confirm "Ready" (green), not "Error" (red), before testing or considering anything done.** Vercel dashboard: vercel.com/eltop-dealer/eltop-dealer-app-v3/deployments

---

## MAJOR ARCHITECTURE: Identity System (dealer / customer / admin)

This was the biggest piece of work this session. Full context needed if continuing this thread:

### The problem that triggered it
Originally, `isDealer` was determined by "does a `profiles` row exist for this user." This was WRONG — a DB trigger (`handle_new_user()`) auto-creates a `profiles` row for **every** authenticated user (guest OTP, customer, dealer, previously even admin), so "row exists" never meant "is a dealer."

### The fix — new discriminator model
- `profiles.is_dealer` (boolean, default `false`) — the real source of truth for dealer status. Only set `true` via admin approval (approval UI not yet built — see Pending).
- `profiles.dealer_application_status` (text, default `'none'`) — will track `'none' | 'pending' | 'approved' | 'rejected'` once the application flow is built.
- **Admins are NOT in `profiles` at all** — a separate `admins` table (id, email) is the sole source of admin identity. The `handle_new_user()` trigger was updated to skip creating a `profiles` row if the new user's ID is already in `admins`.
- Sole admin account: `abhinav.mahajan111@gmail.com`, UID `74a3cf0f-ba60-4921-a576-0ea99944371e`. Confirmed in `admins` table, profiles row deleted.

### Full reset already executed (confirmed, intentional)
Ran in Supabase SQL Editor:
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_dealer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dealer_application_status text NOT NULL DEFAULT 'none';

UPDATE public.profiles SET is_dealer = false, dealer_application_status = 'none';
-- (ALL existing profiles reset to non-dealer, including real dealers like
-- "Embassy Electricals (India) Private Limited" who had 6 real orders —
-- this was a deliberate, confirmed decision; Sumaksh will manually
-- re-approve genuine dealers once the approval UI exists)

DELETE FROM public.profiles WHERE id = '74a3cf0f-ba60-4921-a576-0ea99944371e'; -- admin's row removed

INSERT INTO public.admins (id, email)
VALUES ('74a3cf0f-ba60-4921-a576-0ea99944371e', 'abhinav.mahajan111@gmail.com')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admins WHERE id = new.id) THEN
    RETURN new;
  END IF;
  INSERT INTO public.profiles (id, email, dealer_code)
  VALUES (new.id, new.email, 'ETP-DLR-' || lpad((floor(random() * 9999))::text, 4, '0'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
**Result:** All 4 remaining profiles are `is_dealer = false` (i.e. everyone is currently a "customer" until manually re-approved as a dealer). This is expected and correct, not a bug — confirmed multiple times during testing when Embassy Electricals' account showed customer/guest behavior instead of dealer.

### AppContext.jsx — current state flags
- `session` — raw Supabase session
- `sessionChecked` — true once the INITIAL `getSession()` call resolves (critical — see race conditions below)
- `profileLoaded` — true once the `profiles` fetch resolves (handles PGRST116 = "no row" as a valid customer signal, distinct from other errors which retry once then leave `profileLoaded: false` = "unknown, still loading")
- `isDealer` — `profile?.is_dealer === true`
- `adminChecked` — true once the separate `admins` table query resolves
- `isAdmin` — `Boolean(data)` from the `admins` query
- `isCustomer` — `profileLoaded && Boolean(session?.user?.id) && !isDealer && !isAdmin`
- `dealerApplicationStatus` — exposed from `profile.dealer_application_status`
- `dealer` — the profile object (still falls back to `DEMO_PROFILE` for dealer-app screens' safety, but `isDealer` is the real truth now, not profile presence)

### Route guards
- **`AdminRoute.jsx`** — wraps `/admin/*`. Waits for `!sessionChecked || checking || (isLoggedIn && !isAdmin && (!profileLoaded || !adminChecked))` before redirecting. `!isAdmin && isDealer → /dashboard`, `!isAdmin && isCustomer → /store`, else `/login`.
- **`DealerRoute.jsx`** — wraps all 8 dealer-app screens (`/dashboard`, `/catalogue`, `/product/:id`, `/cart`, `/confirm`, `/tracking`, `/ledger`, `/profile`). Same three-phase loading gate (`sessionChecked`, `profileLoaded`, `adminChecked`). `isDealer → allow`, `isAdmin → /admin`, `isCustomer → /store`, else `/login`.
- **`CustomerRoute.jsx`** — wraps `/my-account`. `isCustomer || isDealer → allow` (dealers can see their own order view too), else `/store`.

### Race conditions found and fixed (in order — this took multiple rounds)
1. **First bug:** `isDealer` derived from profile-row-existence instead of `is_dealer` flag — fixed via the reset above.
2. **Second bug:** `DealerRoute`'s loading gate only waited on `profileLoaded`, not `adminChecked` — admin's profile query resolves fast (PGRST116), before the separate `admins` query finishes, so `isAdmin` was still `false` at decision time → admin got wrongly redirected to `/login`. Fixed by adding `adminChecked` flag, gating on both.
3. **Third bug (deepest):** Even with `adminChecked`, a **hard full-page reload** still failed — because `session` itself starts as `null` on mount and `getSession()` resolves asynchronously. The route guards were evaluating `session?.user` as falsy (still loading) and treating it as "definitely no session," skipping the loading gate entirely and immediately redirecting to `/login` before the real session was even checked. Fixed by adding `sessionChecked` (true only once the initial `getSession().then()` resolves) and gating all three route guards on it FIRST, before anything else.

**This third fix (`sessionChecked`) was confirmed working** — admin hard-reloading `/profile` or `/dashboard` now correctly lands on `/admin`, not `/login`. This was the last blocking bug in the identity system core.

---

## OTHER MAJOR FEATURES BUILT THIS SESSION (in rough order)

1. **Git backup infrastructure** — `quick-push.bat`, `auto-push.bat`, Windows Task Scheduler setup guide.
2. **CRM feature parity between Dealers and Guests/Customers** — unified "Dealers & Customers" admin list, soft-delete (`deleted_guests` table, mirrors dealer `profiles.deleted_at` pattern), guest CRM with full 5-tab parity (Overview/Orders/Activity/Ledger/AI Assistant) matching DealerCRM, `guest_activities` table for the Activity tab, recycle bin toggle button in the toolbar, sidebar label fix ("Dealers & Customers").
3. **Repeat-guest recognition + email OTP verification** — `check_repeat_guest` RPC, inline OTP verify in checkout, `orders.email_verified` column, verified badges in AdminOrders/GuestCRM.
4. **Pricing model corrections (multiple rounds — this had bugs, now fixed):**
   - Final correct model: **unverified guest → full MRP** (no discount). **OTP-verified guest/customer → 15% off MRP**, shown transparently with strikethrough MRP + "15% off" badge. **Dealer → DLP × (1 − discount1%) × (1 − discount2%)**, NOT MRP-based. New dealer signups default `discount1 = 36` (SQL: `ALTER TABLE profiles ALTER COLUMN discount1 SET DEFAULT 36;` — already run). Existing dealers' discount1/discount2 values were NOT touched by this default change.
   - This pricing logic lives in `Store.jsx`'s `getPrice()` function and is applied consistently across product listing, product detail, cart, checkout, the Razorpay `amount` sent, and the `orders`/`order_items` records saved.
   - The dealer phone-app path (`/catalogue` → `/cart` → `AppContext.placeOrder`) already had correct DLP-based pricing from the start and was not part of the bug — only the public `/store` page had the MRP-based bug.
5. **Razorpay checkout fixes:**
   - Fixed a critical bug where cancelling/abandoning a UPI payment left the checkout permanently stuck on "Processing your payment" — `modal.ondismiss` now reopens the checkout form pre-filled with the customer's data instead of being a no-op.
   - Added `modal.animation: false` and `modal.escape: true` for iOS Safari rendering fixes.
   - Razorpay's own "Cancel Payment" dialog mobile-responsiveness issue is NOT fixable from our side (it's inside Razorpay's iframe) — flagged, not fixed.
6. **Auth guard gap closed** — `/dashboard`, `/profile`, `/catalogue`, `/cart`, `/confirm`, `/tracking`, `/ledger` previously had ZERO guard (anyone with any session, or even sometimes no session, could see fake `DEMO_PROFILE` dealer data). This is now fully fixed via `DealerRoute.jsx` (see Identity System above).
7. **Customer account UI (just built, NOT YET TESTED as of this document):**
   - `src/pages/MyAccount.jsx` — new page at `/my-account`, reuses GuestCRM's stat-card/order-table patterns (stripped of admin-only Activity/AI tabs), shows "My Orders" and "Overview" tabs, logout button.
   - `src/components/CustomerRoute.jsx` — guards `/my-account`.
   - Store header now shows "Hi, {name} ▾" dropdown (My Orders / Logout) instead of "Login / Sign Up" when `isCustomer` is true. Name is fetched from the customer's most recent order (`customer_name` column), not from a form field.
   - Last deployment before this document: commit `eb81d13` ("feat: customer account UI — My Account page, CustomerRoute guard, Store header greeting dropdown") — confirmed "Ready" on Vercel.
   - **THIS IS UNTESTED.** The testing checklist that still needs to be run:
     - [ ] Login as a reset "customer" account (e.g. `abhinav_defines@yahoo.com` or Embassy Electricals' email) → `/store` → header shows "Hi, {name} ▾"
     - [ ] Dropdown → "My Orders" → navigates to `/my-account`, shows real order history
     - [ ] Dropdown → "Logout" → session clears, header reverts to "Login / Sign Up"
     - [ ] Mobile width — dropdown doesn't overflow
     - [ ] `/my-account` while NOT logged in → redirects to `/store`
     - [ ] Browser console (F12) on both `/store` and `/my-account` — confirm no red errors
8. **Miscellaneous bug fixes this session:** AdminProducts form fields lost their labels once a value was typed (placeholder-only labels) — fixed with persistent labels. OTP resend cooldown was frozen at a static number — root cause was Supabase's own rate-limit error text being confused with our custom countdown; fixed so `startCooldown` only fires on successful send (cooldown intentionally left at 30s per Sumaksh's explicit instruction, NOT reduced to 15s). Missing `useCallback` import caused a full runtime crash (blank black screen) on `/store` — fixed, and a CLAUDE.md rule was added about checking hook imports and not trusting "build passed" as proof the page actually works. A `??`/`||` mixing syntax error also broke the Vercel build at one point — fixed.

---

## PENDING / NOT YET DONE

1. **Test the customer account UI** (see checklist above — this is the immediate next step).
2. **Dealer application / onboarding flow (Phases 2–5 of a plan that was only partially started):**
   - Phase 1 (data model reset, admin exclusivity, trigger fix) — ✅ DONE (see Identity System above).
   - Phase 2 (dealer application form: text fields already in schema — shop_name, owner_name, gstin, address, etc. — PLUS new fields to add: PAN number, shop photo upload, GST certificate upload) — NOT STARTED.
   - Phase 3 (AI document verification — extract + flag inconsistencies for admin review, does NOT auto-approve/reject, final decision always stays with admin) — NOT STARTED.
   - Phase 4 (admin approval panel — view pending applications, approve sets `is_dealer = true` + `dealer_application_status = 'approved'` + admin can set discount1/discount2, reject sets `dealer_application_status = 'rejected'`) — NOT STARTED.
   - Phase 5 ("Login as Dealer" page with two options — "Existing Dealer" login vs "Apply as New Dealer" — entry point for the whole flow) — NOT STARTED.
   - **Important:** until Phase 4 (approval UI) exists, there is no way to re-promote a dealer back to `is_dealer = true` except by running SQL manually. Embassy Electricals and other genuine former dealers are currently all showing as customers.
3. **Auth guard for `/profile` etc.** — technically covered by DealerRoute now, but re-verify once the customer UI testing is done, since customers should NOT be redirected into dealer screens at all (already handled, but worth a final pass).
4. **Refund the test ₹599 Razorpay payment** (very old item, low priority, optional, can be done anytime via Razorpay dashboard → payment → Issue Refund).
5. **Phone number format inconsistency** in dealer profiles (`phone`, `phone2` — some have `+91` prefix, some don't) — the `check_dealer_match`/`check_repeat_guest` RPCs normalize for comparison, but underlying data isn't cleaned up. Low priority.
6. **Razorpay's "Cancel Payment" dialog mobile-responsiveness** — confirmed not fixable from our side, would need to be reported to Razorpay support if it's ever considered worth pursuing.

---

## KEY SCHEMA NOTES (for quick reference)

**`profiles` table (dealers + reset customers):** id, name, dealer_code, email, gstin, address, credit_limit, outstanding, created_at, is_blocked, discount1, discount2, owner_name, shop_name, registration_type, phone2, shop_address, godown_address, website, territories, location_lat, location_lng, staff_assigned, name_staff1/2, photo_owner, photo_staff1/2, photo_shop_inside, photo_shop_board, video_shop_interior, **is_dealer** (new), **dealer_application_status** (new)

**`admins` table:** id, email — sole source of admin identity, mutually exclusive with `profiles`

**`orders` table:** id, dealer_id, status, subtotal, tax, cgst, sgst, igst, total, delivery_address, created_at, payment_id, payment_status, customer_name, customer_phone, customer_email, **email_verified**

**`order_items` table:** order_id, product_id, name, price, qty, mrp, dlp, net_rate, discount1, discount2, hsn_code

**`deleted_guests` table:** id, guest_key, deleted_at, restored_at — soft-delete tracking for guests (mirrors `profiles.deleted_at` pattern for dealers)

**`guest_activities` table:** id, guest_key, type, notes, created_at — Activity tab log for GuestCRM

**`restore_requests` table:** id, profile_id, contact_value, requested_at, status

**Key RPCs:** `check_dealer_match(phone, email)`, `check_repeat_guest(email)` — both exclude soft-deleted rows

**Razorpay:** LIVE mode. Frontend-only checkout (no backend payment verification currently — Store.jsx calls Razorpay directly, saves order on client-side success callback). Not flagged as urgent but worth knowing.

---

## HOW TO CONTINUE IN A NEW CHAT

Paste this whole document at the start. The very next action should be: **test the customer account UI** (checklist in section 7 above), then move to the dealer application/onboarding flow (Phases 2–5) if that's still wanted, or address whatever new issue comes up from testing. Always follow the established pattern: Claude writes a prompt → Abhinav pastes into Claude Code → diff reviewed here before applying → apply → backup (git push) → **Vercel "Ready" confirmed** → browser test → screenshot back.
