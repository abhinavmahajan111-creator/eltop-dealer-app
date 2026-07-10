# Eltop Dealer App — Session Reference (as of 10 July 2026, ~11:20 AM)

**Purpose:** Paste this into a new chat to give Claude full context on the Eltop Dealer App project without re-explaining everything. Image limit was hit in this session, so this captures everything discussed and built.

---

## PROJECT BASICS

- **Project:** Eltop Dealer App — D2C + dealer B2B e-commerce platform for Eltop by Embassy (Embassy Electricals India Pvt. Ltd.)
- **Live site:** eltopbyembassy.com
- **Admin panel:** eltopbyembassy.com/admin
- **Stack:** React/Vite/Tailwind frontend, Supabase (Postgres + Auth + Edge Functions) backend, Razorpay payments (LIVE mode), Resend (email), hosted on Vercel
- **Repo:** GitHub — `abhinavmahajan111-creator/eltop-dealer-app` (branch: `master`)
- **Developer:** Abhinav Mahajan (builds via Claude Code, desktop app)
- **Business owner / PM:** Sumaksh Mahajan
- **Working pattern:** Sumaksh directs Claude (this chat) → Claude gives exact prompts → Abhinav pastes into Claude Code → Claude Code proposes diffs → Sumaksh reviews → apply → test → verify with screenshots.

---

## ⚠️ CRITICAL INFRASTRUCTURE ISSUE — READ FIRST

### Multiple Vercel projects exist — only ONE is live
Discovered this session: there are **three separate Vercel projects** under the `eltop-dealer` team:
- **`eltop-dealer-app-v3`** — ✅ **THIS IS THE LIVE ONE**, aliased to `eltopbyembassy.com` and `www.eltopbyembassy.com`. All deploys MUST go here.
- `eltop-dealer-app` — NOT connected to the live domain. Do not deploy here.
- `eltop-dealer-app-v2` — NOT connected to the live domain. Do not deploy here.

**What went wrong this session:** Git push → Vercel auto-deploy (webhook) appears to have **stopped working partway through this session** — commits were pushed to GitHub but no new deployment appeared on `eltop-dealer-app-v3`, even after waiting and refreshing. Root cause was never fully diagnosed (may be a Vercel webhook issue, may be something else — **worth investigating properly in the new chat if it recurs**).

**Workaround used:** Manual deploy via Vercel CLI:
```bash
npx vercel login
npx vercel link
# When prompted "Which project?" — MUST select eltop-dealer/eltop-dealer-app-v3
npx vercel --prod
```
After first linking correctly, subsequent `npx vercel --prod` runs deploy straight to v3 without re-prompting.

**⚠️ Before any future session ends or new work begins:** confirm whether normal `git push` → Vercel auto-deploy has started working again, or whether CLI deploy is still required as a manual step every time. If Abhinav pushes a commit, **always verify on `vercel.com/eltop-dealer/eltop-dealer-app-v3/deployments`** that the new commit actually shows up and is "Ready" — don't assume push = deployed.

### Edge Functions deploy separately
Edge Function code changes (anything in `supabase/functions/`) are **NOT deployed by Vercel at all**. They require:
```bash
npx supabase functions deploy <function-name>
```
This was a point of confusion this session — Vercel deploy ≠ Edge Function deploy. Keep them mentally separate.

---

## GIT / BACKUP INFRASTRUCTURE

- `quick-push.bat` and `auto-push.bat` scripts exist in the project folder.
- Standard manual backup: `git add -A && git commit -m "..." && git push`.
- **CRITICAL LESSON (carried over + reinforced this session):** A push succeeding does NOT mean the site updated. Always check the Vercel deployments page (on the correct **v3** project) and confirm "Ready" (green) before testing.

---

## THIS SESSION'S WORK — IN ORDER

### 1. "My Profile" feature — Phase A — ✅ COMPLETE & FULLY TESTED

Built and verified end-to-end:
- **Header dropdown**: "My Profile" option added between "My Orders" and "Logout" in the Store.jsx account dropdown, navigates to `/my-account?tab=profile`.
- **`MyAccount.jsx`**: new "Profile & Addresses" tab.
  - **Basic Info**: editable Name + Phone (10-digit validated), saves to `profiles.name` / `profiles.phone`. Shows "Profile saved." on success.
  - **Saved Addresses**: full CRUD against new `customer_addresses` table (id, profile_id, label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default, created_at). RLS scoped to `auth.uid() = profile_id`.
    - Add/Edit/Delete all tested and working.
    - "Set as default" — clear-then-set logic confirmed working (only one address shows "Default" badge at a time).
    - Required-field red asterisks added to match "Full Name *" pattern.
    - **State field is now a dropdown** of all 36 Indian states/UTs (was free text). Bug found and fixed: the placeholder "Select State" option originally had `disabled` attribute, which caused non-matching saved values to silently default to the first real option ("Andaman and Nicobar Islands") instead of showing the placeholder — **fixed** by removing `disabled` from the placeholder option.
    - **UX fix applied**: address card list is now hidden while the add/edit form is open (was cluttered before).
  - Address list is hidden while add/edit form open.
- **New component**: `src/components/AddressForm.jsx` (add/edit address form, used by MyAccount).
- **Display name consistency bug — fixed**: header greeting and Overview tab's "Name" field previously sourced the customer's display name only from their most recent order's `customer_name`, which meant (a) zero-order customers saw their email duplicated in the header, and (b) editing the new Profile name field had no visible effect anywhere. Fixed with priority: `profiles.name` → most recent order's `customer_name` → email. Verified working — editing name now instantly reflects in both the Store header and MyAccount Overview tab.
- **Testing checklist**: 100% complete — profile edit, address add/edit/delete/default, state dropdown, validation, mobile-width tabs, console clean.

**Files touched:** `src/pages/Store.jsx`, `src/pages/MyAccount.jsx`, `src/components/AddressForm.jsx`.

### 2. Customer CRM in Admin panel — ✅ COMPLETE

- **New `src/admin/CustomerCRM.jsx`**: read-only detail view for registered customers (`is_dealer = false` profiles), reached by clicking a customer row in the unified Dealers & Customers list. Three tabs: Overview (account info + order stats), Orders (expandable order history), Addresses (read-only saved addresses list with Default badge).
- **`src/admin/AdminDealers.jsx` changes**:
  - `dealerList` now correctly filters to `is_dealer === true` only (previously all profiles were treated as dealers — this was fixed as part of this work, verified not to break existing dealer CRM access).
  - New `customerList` for `is_dealer === false` profiles, merged into the unified list.
  - New green "Customer" TypeBadge, new "Customers" filter option in the Type dropdown with live count.
  - Row click routes to `/admin/crm/customer/:profileId` for customer rows (vs. opening DealerCRM panel for dealers, vs. GuestCRM for guests).
  - Delete button disabled/greyed for customer rows (read-only in this view; customers manage their own data via My Account).
- **Excel export**: "Export to Excel" now also produces a **second file**, `customers-export-{date}.xlsx`, with **one row per saved address** (not one row per customer) — columns: profile_id, account_name, account_phone, account_email, account_created_at, contact_type ("account" or "delivery"), address_label, recipient_name, recipient_phone, address_line1/2, city, state, pincode, is_default. Zero-address customers still get one "account" row. This structure was chosen deliberately for clean marketing-list import (see Business Decisions below).
- **New route**: `/admin/crm/customer/:profileId` added to `App.jsx`.
- Minor cleanup applied: removed a wasted placeholder Supabase query in `CustomerCRM.jsx`'s initial data fetch.

**Files touched:** `src/admin/CustomerCRM.jsx` (new), `src/App.jsx`, `src/admin/AdminDealers.jsx`.

### 3. Data integrity bug — blank orders — ✅ FOUND, DIAGNOSED, FIXED

- Two orders (dated 2026-07-06) were found with `customer_name`, `customer_phone`, `customer_email` all NULL, despite having real `payment_id`s and `status = 'confirmed'`.
- **Root cause (fully confirmed via git history + Razorpay dashboard):** these were **test-mode Razorpay transactions** (confirmed "Authorized" status in Razorpay Test Mode, not Live) placed during a ~2-hour window on 2026-07-06 when the checkout code (before commit `83414b2`) had no customer-info fields in the insert statement at all. **No real money was involved — no refund/business action needed.**
- **Fix applied (two layers):**
  1. **Client-side guard** in `handlePayment` (Store.jsx) — blocks order insert if `data.name` or `data.phone` is blank, with console.error + alert. Commit `1df17c8`.
  2. **DB-level enforcement** — ran SQL to patch the two historical blank rows (`customer_name = 'Test Order'`, `customer_phone = '0000000000'`) then added `NOT NULL` constraints on `orders.customer_name` and `orders.customer_phone`. **Verified applied successfully.**
- This issue is fully closed.

### 4. Business decision — marketing data strategy — ✅ DECIDED

Discussed and decided with Sumaksh:
- **2a. Delivery-address contacts (not just account holders) WILL be included in future marketing outreach** — i.e., a customer's saved delivery addresses (which may have different recipient names/phones than the account holder, e.g. office contact) are fair game for marketing, not restricted to only the verified account email/phone. *(Note: standard TRAI/DND compliance caveats were raised but the business decision was made to include them.)*
- **2b. Excel export needed with per-address granularity** — built (see section 2 above).
- Claude's suggestion (not yet implemented, worth reconsidering in future): tag each contact row with a "source" (account vs. delivery-address) so lists can be filtered later if compliance needs arise. Not built yet — flagged as a nice-to-have.

### 5. Admin Products bug — PGRST116 coercion error — ✅ FIXED

- "Update Product" in Admin → Products threw `"Cannot coerce the result to a single JSON object"`.
- Root cause: `.update(payload).eq("id", form.id).select().single()` — `.single()` is fragile on updates.
- **Fix:** changed to `.maybeSingle()` on the update path only (insert path still correctly uses `.single()`). Commit `d0986a8`. Confirmed working after fix (no more error, list refreshes).
- **Unresolved side-note:** a test product "Eltop Candy Submersible Pump 18W" (SKU `ETP-CANSUBPUM-49`) has inconsistent-looking pricing data in the DB: `mrp=599, dlp=3, price=380`. This was being used as a cheap test-checkout product and was never fully cleaned up. **If this product is meant to be a real catalog item, its MRP/DLP/price need to be sanity-checked and corrected. If it's just a test artifact, consider deleting it or clearly marking it as inactive/test-only.**

### 6. "New Dealer" default name bug — ✅ PARTIALLY FIXED

- New customer signups (via OTP, `is_dealer = false`) were getting a default profile name of "New Dealer" (leftover from when all signups were dealers). Fixed going forward to use "New Customer" for the customer-facing signup path (dealer application flow, if/when built, should keep "New Dealer").
- **Existing rows were NOT backfilled** (deliberate — flagged for Sumaksh to decide). As of this session, 3 of 4 customer profiles still show "New Dealer" as their name in the DB (motorcoolerdelhi@gmail.com, abhinav.m.embassy@gmail.com, sakshimahajan2001@gmail.com) since they haven't edited their profile name themselves. Only `abhinav_defines@yahoo.com` (AABBCC) has a custom name because it was manually edited via My Account during testing.

### 7. Order Confirmation Email feature — 🟡 IN PROGRESS, BUG FOUND, FIX NOT YET DEPLOYED

**Goal:** after a successful Razorpay payment on `/store`, send the customer a confirmation email (via Resend, through a new Supabase Edge Function) containing order ID, Razorpay payment reference, items, total — addressing the original ask that customers get *some* durable proof of their order (a payment reference "like a UTR/receipt").

**What's built:**
- New Supabase Edge Function: `supabase/functions/send-order-confirmation/index.ts`. Takes `{order_id, payment_id, customer_name, customer_email, total, items[]}`, sends a styled HTML email via Resend API.
- `Store.jsx` change: after successful order insert, fire-and-forget invoke of this function.
- **Resend setup (all done):**
  - Resend account already existed (was already being used for Supabase Auth's SMTP/OTP emails) — discovered this mid-session, saved significant setup time.
  - `eltopbyembassy.com` domain **already verified** in Resend (confirmed via Supabase Auth SMTP settings showing `noreply@eltopbyembassy.com` as a working sender).
  - Created a **new, dedicated API key** in Resend named `order-confirmation-function` (separate from whatever key Supabase Auth's SMTP uses).
  - Added `RESEND_API_KEY` as a Supabase Edge Function secret.
  - `FROM_EMAIL` in the function is set to `Eltop by Embassy <orders@eltopbyembassy.com>`.
- Edge Function **deployed successfully** via `npx supabase functions deploy send-order-confirmation` (confirmed in Supabase dashboard).

**Bugs found and fixed so far:**
1. **`data.email` was blank for logged-in customers** — the checkout form's email field is optional for logged-in users (they're already authenticated), so `if (data.email)` was skipping the invoke entirely for customer-account checkouts. **Fixed** (commit `bc8035c`) with fallback: `const confirmationEmail = data.email || session?.user?.email || null;`. Verified via console log that this fallback correctly resolves the logged-in customer's email.
2. **Vercel deployment confusion** (see Critical Infrastructure section above) delayed testing — several test orders were run against stale deployments before this was caught.

**🔴 CURRENT BLOCKING BUG — root cause found, fix NOT yet applied:**
- After multiple real test orders (small amounts, ₹9–20, on **live** Razorpay — see Test Data section below), the confirmation email never arrived. Only Razorpay's own generic payment-receipt email arrived (from `no-reply@razorpay.com`), never our custom one from `orders@eltopbyembassy.com`.
- Diagnosed via Supabase Edge Function **Invocations** tab: only `OPTIONS` (CORS preflight) requests were logged, **zero `POST` requests** — across three separate test orders.
- Added verbose console logging (commit `af23b39`, deployed via `npx supabase... ` — wait, this was a **frontend** change so it went via `npx vercel --prod` to v3) to capture the exact invoke error.
- **Root cause confirmed via browser console:**
  ```
  Access to fetch at '.../functions/v1/send-order-confirmation' from origin 
  'https://www.eltopbyembassy.com' has been blocked by CORS policy: Request 
  header field x-client-info is not allowed by Access-Control-Allow-Headers 
  in preflight response.
  ```
  The Supabase JS client automatically sends an `x-client-info` header (and likely `apikey`) with every `functions.invoke()` call, but the Edge Function's CORS `OPTIONS` handler only allows `authorization, content-type` — missing `x-client-info` (and possibly `apikey`).

**NEXT STEP (not yet done — do this first in the new chat):**
Fix the Edge Function's CORS headers. In `supabase/functions/send-order-confirmation/index.ts`, change:
```
Access-Control-Allow-Headers: authorization, content-type
```
to:
```
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```
**Important:** this is an Edge Function change — deploy via `npx supabase functions deploy send-order-confirmation`, **NOT** `npx vercel --prod` (that only deploys the frontend). Get the diff from Abhinav, apply, deploy via Supabase CLI, then run one more test order and verify:
1. Browser console shows `[order-confirmation] invoke response:` (success) not `invoke failed:`
2. Supabase Edge Function Invocations tab shows a `POST` (not just `OPTIONS`)
3. Actual email arrives at the test inbox from `orders@eltopbyembassy.com`

### 8. Guest Order Tracking — 🟡 INVESTIGATED, PLANNED, NOT YET BUILT

**Original question that triggered this:** if a guest places an order and closes the browser with zero confirmation, how do they ever find their order again?

**Investigation findings:**
- The existing `/tracking` route (`src/screens/OrderTracking.jsx`) is **not a real feature** — it's a static mockup with hardcoded fake data (`ORD-10234`, June 2024 timestamps), gated behind `<DealerRoute>` (dealer-only), never wired to any real Supabase query. A guest can't even reach it.
- Before this session's Resend work, **zero** order confirmation (email or SMS) was sent to guests after checkout.
- Conclusion: guest order tracking effectively does not exist as a feature yet.

**Plan drafted (approved by Sumaksh, NOT yet built — deprioritized while debugging the email CORS bug):**
- **Feature 1 (in progress — see section 7 above):** order confirmation email with payment reference. This is step one toward solving the tracking problem (at least gives the customer *something* in their inbox).
- **Feature 2 (not started):** new public route `/track` (distinct from the existing dealer-only `/tracking` — leave that untouched). Guest enters email → OTP sent via Supabase's existing `signInWithOtp`/`verifyOtp` (same mechanism as checkout) → on verification, guest sees their orders (query scoped by new RLS policies restricting `orders`/`order_items` to `auth.email() = customer_email AND dealer_id IS NULL`).
- **RLS policies for Feature 2 were drafted but NOT yet run:**
  ```sql
  CREATE POLICY "Customers can view their own orders by email"
    ON public.orders FOR SELECT
    USING (auth.role() = 'authenticated' AND lower(customer_email) = lower(auth.email()) AND dealer_id IS NULL);

  CREATE POLICY "Customers can view items of their own orders"
    ON public.order_items FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id 
      AND lower(o.customer_email) = lower(auth.email()) AND o.dealer_id IS NULL));
  ```
- **Known risk flagged, needs a solution before building:** if a logged-in customer (My Account session) opens `/track` in another tab and verifies an OTP there, `supabase.auth.verifyOtp()` on the shared Supabase client would **overwrite/destroy their existing login session** (single shared client, single localStorage key). Proposed fix (not implemented): instantiate a **separate Supabase client** scoped to `/track` with a custom `storageKey` so its session is isolated from the main app's session.

**Next steps for this feature (after email CORS bug is fixed):**
1. Run the two RLS policies above.
2. Build `src/pages/TrackOrder.jsx` with the isolated-session pattern.
3. Add public route `/track` to `App.jsx`.
4. Update the post-checkout alert/email to mention `/track` as where to check order status.

---

## KEY SCHEMA NOTES (updated this session)

**`profiles` table:** id, name, dealer_code, email, gstin, address, credit_limit, outstanding, created_at, is_blocked, discount1, discount2, owner_name, shop_name, registration_type, phone, phone2, shop_address, godown_address, website, territories, location_lat, location_lng, staff_assigned, name_staff1/2, photo_*, video_shop_interior, is_dealer, dealer_application_status, deleted_at

**`admins` table:** id, email — sole source of admin identity, mutually exclusive with `profiles`

**`customer_addresses` table (NEW this session):** id, profile_id (→ profiles.id), label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default, created_at. RLS: owner-only via `auth.uid() = profile_id`.

**`orders` table:** id, dealer_id, status, subtotal, tax, cgst, sgst, igst, total, delivery_address, created_at, payment_id, payment_status, customer_name (**NOT NULL** as of this session), customer_phone (**NOT NULL** as of this session), customer_email, email_verified

**`order_items` table:** order_id, product_id, name, price, qty, mrp, dlp, net_rate, discount1, discount2, hsn_code

**`products` table:** includes `mrp`, `dlp`, `price`, `sku`, `hsn_code`, `standard_packing`, `stock`, etc.

**`deleted_guests`, `guest_activities`, `restore_requests` tables:** unchanged from before.

**New Supabase Edge Function:** `send-order-confirmation` — deployed, has a CORS bug (see section 7), fix pending.

**Razorpay:** LIVE mode. Frontend-only checkout (no backend payment verification). This session's testing generated several small **real** Live-mode payments (₹9–20 range) — see Test Data below.

---

## TEST DATA / ACCOUNTS AS OF THIS SESSION

**Customers (`is_dealer = false`, all 4 existing profiles):**
| Email | Display name | Notes |
|---|---|---|
| abhinav_defines@yahoo.com | AABBCC | Manually edited via My Account; phone 9971096801; has 1 saved address ("55", Delhi, marked Default) |
| motorcoolerdelhi@gmail.com | New Dealer *(stale default)* | Also appears as a guest order under name "sakshi" |
| abhinav.m.embassy@gmail.com | New Dealer *(stale default)* | |
| sakshimahajan2001@gmail.com | New Dealer *(stale default)* | |

**Dealers:** currently **zero** — no profile has `is_dealer = true`. Dealer application/onboarding flow (Phases 2–5 from earlier sessions) still not built.

**Guests (order-only, no login):** sakshi, anj, abby, kkk, ABC, and 2 fully-blank historical rows (now patched to "Test Order" placeholder — see section 3).

**⚠️ Real Live-mode test payments made THIS session (small amounts, not yet refunded — consider refunding or noting as absorbed test cost):**
- `pay_TBS4s3NA68vqy8` — ~₹10
- `pay_TBSXDreuHefhDe` — ~₹9
- `pay_TBTDlEA0squP7g` — ~₹9
- `pay_TBgjVmkLuPcSsq` — ~₹9
- Plus at least one earlier ₹20 attempt that failed ("Payment could not be completed — declined due to potential risk" — this was Razorpay's fraud-risk engine reacting to rapid repeated test attempts, not a bug; resolved by waiting and retrying).
- (Separately, historical from a prior session: an old ~₹599 test payment was already flagged as pending refund — still unresolved, low priority, mentioned in earlier session doc.)

**Note on Razorpay Test Mode:** was toggled ON briefly this session purely to investigate the two historical blank-order payment IDs (which turned out to be Test Mode transactions from 2026-07-06). **Toggled back OFF** afterward — production should stay on Live mode by default.

---

## PENDING / NOT YET DONE (priority order)

1. **🔴 IMMEDIATE: Fix CORS bug in `send-order-confirmation` Edge Function** (see section 7) — add `x-client-info, apikey` to `Access-Control-Allow-Headers`, deploy via `npx supabase functions deploy send-order-confirmation`, re-test with a real order, confirm email arrives.
2. Investigate whether Vercel git-push auto-deploy is working again, or still needs manual CLI deploy every time.
3. Decide what to do with the test product "Eltop Candy Submersible Pump 18W" (SKU ETP-CANSUBPUM-49) — its mrp/dlp/price look inconsistent (599/3/380).
4. Consider refunding the small real test payments made this session via Razorpay dashboard (or decide they're an acceptable testing cost).
5. Build Feature 2 — public guest order tracking page (`/track`) — plan is ready, RLS policies drafted, isolated-session approach identified. See section 8.
6. Decide whether to backfill the "New Dealer" → correct name for the 3 existing customer profiles still showing the stale default.
7. Dealer application/onboarding flow (Phases 2–5 from earlier sessions) — still entirely not started. No dealers currently exist in the system.
8. Old ~₹599 test Razorpay payment from a prior session — still pending refund decision (very low priority).
9. Phone number format inconsistency in dealer profiles — low priority, carried over from earlier sessions.
10. Consider adding a "source" tag (account vs. delivery-address) to the customer Excel export for future marketing-list filtering flexibility (discussed, not built, optional).

---

## HOW TO CONTINUE IN A NEW CHAT

Paste this whole document at the start. The very next action should be: **fix and deploy the CORS header fix for the order-confirmation Edge Function** (item 1 above), then verify with one more real test order that the email actually arrives. After that, move to whichever pending item is next priority, or address whatever new issue comes up.

Always follow the established pattern: Claude writes a prompt → Abhinav pastes into Claude Code → diff reviewed here before applying → apply → **push AND verify on Vercel `eltop-dealer-app-v3` project specifically** (or deploy Edge Functions via Supabase CLI, as appropriate) → confirm "Ready" → browser test → screenshot back.

**Remember the golden rule from this session: always double-check WHICH deployment target (Vercel project, or Supabase Edge Function) a given code change actually needs, since this session lost significant time to deploying to the wrong Vercel project and confusing frontend vs. Edge Function deploys.**
