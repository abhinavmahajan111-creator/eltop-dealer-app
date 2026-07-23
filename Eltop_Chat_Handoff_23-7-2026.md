# ELTOP by Embassy — Chat Handoff — 23 July 2026

Full session summary for continuity into the next chat. This session was dominated by a real-money payment/order-integrity crisis — read that section first.

---

## 🔴 IMMEDIATE NEXT STEP

**Delete 4 confirmed-bogus orphaned test orders.** `/admin/health` flagged 4 orphaned orders (order row exists, no order_items) from 06/07/2026: `7090E35F` (₹1,799), `8517CC55` (₹3,598), `E7F526C3` (₹0), `576F64E9` (₹2,123). Investigated their payment_ids in Razorpay: **not found in Live Mode**, found in **Test Mode** with status "Authorized" (never Captured) — confirmed old dev/testing artifacts, **no real money involved**. Safe to simply delete these 4 order rows. Not yet done. Next step was about to run:

```sql
SELECT id, payment_id, total FROM orders 
WHERE id::text LIKE '7090e35f%' 
   OR id::text LIKE '8517cc55%' 
   OR id::text LIKE 'e7f526c3%' 
   OR id::text LIKE '576f64e9%';
```
— then delete from `order_items` (if any) and `orders` using the returned full UUIDs.

---

## 🔴 CRITICAL SAGA — Payment/Order Integrity (Req A Step 4 and beyond)

This was the core of the session. Sequence of events, root causes, and fixes, in order:

### 1. Guest email hard-block — the core feature
Business rule (final, confirmed): email is the permanent identity key for order history. Guest checkout must be **hard-blocked** if the entered email matches an existing Customer/Dealer account. Exact required message: *"You cannot checkout as a guest with this email address. Either login with this email, or use a different email to checkout as a guest."*

### 2. First bug — RLS silently filtering (FIXED, commit `d1acf6a`)
`check_profile_exists` RPC queried `profiles` table directly; Supabase RLS silently filtered rows for anon users (query succeeded, 0 rows — indistinguishable from "no match"). Fixed with a `SECURITY DEFINER` RPC bypassing RLS.

### 3. Second bug — wrong table (FIXED, commit `0da801d`)
Even after RLS fix, customer emails still weren't blocked. Root cause: **Customers in this app are `auth.users` entries with NO corresponding `profiles` row** — only Dealers have profiles rows. So `check_profile_exists` (querying `profiles`) returned `false` for every customer email. Fixed by querying **`auth.users`** instead. This also explained an earlier apparent "mobile vs desktop" inconsistency — it was actually "dealer email vs customer email," unrelated to device.

### 4. UX polish — pop-in animation (DONE, commit `984fbe9`)
A red banner now also renders directly above "Continue to Payment" (not just near the email field) so it's always visible. Added a spring pop-in animation (scale 0.85→1 overshoot) + pulse-on-re-click. Confirmed working on both laptop and mobile.

### 5. THE BIG ONE — profile_id foreign key bug (FIXED, commit `d44f3d9`)
Real Razorpay payment succeeded (₹5, `pay_TGoiPVAhKCvFJM`) but **order save failed**: *"insert or update on table orders violates foreign key constraint orders_profile_id_fkey"* — **customer was charged, no order was created.** Root cause: `handlePayment` set `profile_id = session.user.id` for ANY logged-in user, but Customers have no `profiles` row (same class of bug as #3) — violating the FK. Fixed: `profile_id` from session only set when `isDealer` is true.

### 6. Admin Orders page showing empty (FIXED, commit `36f1a57`)
Dashboard showed "14 orders, ₹20,768 revenue" but `/admin/orders` showed "No orders yet." Root cause: adding `profile_id` FK gave `orders` TWO foreign keys to `profiles` (`profile_id` and `dealer_id`); the unqualified `profiles(...)` join in AdminOrders became ambiguous to PostgREST → HTTP 400 → silently swallowed by `if (!error && data)`. Fixed: explicit `profiles!dealer_id(...)` join + added `console.error` so future query errors surface.

### 7. Manual recovery — TWO real lost payments found and recovered
- `pay_TGoiPVAhKCvFJM` (10:15am, ₹5) — recovered as order `03212bca-f711-403d-9fe1-c62340d5f5ca`. Customer detail per Razorpay: phone +91 9998 887771, email ravi.testcheckout23july@gmail.com — **Sumaksh flagged he doesn't recognize this contact info; unresolved who/what device made this specific payment.**
- `pay_TGp1IzbIdfPiK7` (10:33am, ₹5, Abhinav Mahajan's personal UPI) — initially recovered as a NEW order `ad20de04-...`

### 8. Third silent-failure class — empty array insert (FIXED, commit `c63755e`)
A genuine live order `AB2C3993` (11:23am, ₹5) existed with correct customer info but **"No items found"**. Root cause: `supabase.from('order_items').insert([])` with an EMPTY array returns `{error: null}` — no exception at all — when `capturedItems` was empty at payment time (race condition/refresh). Fixed with an explicit empty-guard that alerts with Payment ID instead of silently succeeding. **Also added in this commit: Payment ID now printed on the Sales Order print view, next to Voucher No.**

### 9. Duplicate discovered and resolved
`AB2C3993`'s payment_id turned out to be **the same** `pay_TGp1IzbIdfPiK7` already recovered as `AD20DE04` in step 7 — meaning there were now TWO orders for one payment (double-counting revenue by ₹5). Resolved: inserted the missing items into the genuine order `AB2C3993`, then deleted the duplicate `AD20DE04` order + its item entirely. Verified — exactly 1 row remains for that payment_id.

### 10. Real payment test — cancel/abandon path confirmed safe
Tested cancelling a Razorpay payment mid-flow — app did not crash, no bad state.

### 11. A near-double-debit scare — resolved as a non-issue
A UPI attempt showed "Payment could not be completed" but Sumaksh felt money was debited. Checked Razorpay dashboard: that attempt shows "Customer – Payment Timed Out" (not Captured), Failed count = 0 — **very likely no double-debit occurred**, but Sumaksh should still spot-check his bank statement once to be fully sure.

### 12. New standing infrastructure built in response (commit `716bfba` + `acac4dd`)
- **CLAUDE.md Rules §12-14 added**: (§12) self-check all 3 user types (Guest/Customer/Dealer) whenever payment code is touched; (§13) bans silent `if (!error && data)` error-swallowing patterns in the payment callback, mandates explicit error + console.error + user alert; (§14) proactive daily reconciliation of Razorpay Captured payments vs `orders` table, unprompted, any gap = P0.
- **New `/admin/health` page** (linked from Admin sidebar): shows Total Orders, Total Revenue, Orphaned Orders count, Duplicate Payment IDs count, Paid/No-Payment-ID count, with a detail table and "what to do" guidance. This is what found the 4 old orphaned test orders described in the Immediate Next Step above.
- **New customer-facing "Payment or Order Issue?" link** — added to Store footer Quick Links (confirmed visible), TrackOrder page, and order confirmation flow. Submits to a new `support_requests` table.
- **`support_requests` table** — created (after one failed attempt: first tried a `profiles.role`-based admin policy which doesn't exist in this app; corrected to use the actual `admins` table pattern: `EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())`). Table + all policies now live and confirmed via "Success. No rows returned".
- **Daily checklist proposed by Claude Code, NOT YET APPROVED by Sumaksh** (5 items, ~30 sec each): check /admin/health for "All Clear"; scan /admin/orders for any order missing items since yesterday; spot-check Razorpay "Captured" count vs Admin order count; check support_requests for new complaints; after any deploy, re-run /admin/health + place a ₹1 test order end-to-end.

### Still outstanding from this whole saga
- Approve or trim the 5-item daily checklist.
- Delete the 4 bogus orphaned test orders (see Immediate Next Step).
- Resolve the unrecognized-contact-info question on the `pay_TGoiPVAhKCvFJM` recovery (step 7).
- Confirm Vercel shows `c63755e` and `acac4dd` as Ready.
- Verify `/admin/health` UI, `/contact` form submission, TrackOrder/footer links, on mobile width.
- Optionally: spot-check bank statement for the near-double-debit scare (step 11) — very likely fine.

---

## OTHER ACTIVE ITEMS (not part of the payment saga)

### Phone-number cross-role banner (tier-based, non-blocking) — commit `3f145fd`
Final decision: email is the only hard-block key; phone gets a soft, non-blocking, TIER-based suggestion (Guest(1)<Customer(2)<Dealer(3)) — banner shows only when the matched account's tier is higher than the current user's. Implemented and self-check passed for all 6 logic branches. **Still needs live verification** across all 6 scenarios (Guest+Customer-phone, Guest+Dealer-phone, Customer+Dealer-phone should show banner; Customer+Customer-phone, Dealer+any should not; login-link works; never blocks checkout).

### Checkout prefill for logged-in users — commit `34e12bd`
Customer/Dealer checkout form (Name/Phone/Email/Address) now prefills from profile. **Still needs live verification** (Customer prefilled, Dealer prefilled incl. address, Guest still empty).

### Mobile bugs batch (5 issues found together, 22/7) — commit `d1acf6a`
(a) Product Detail overflow, (b) missing thumbnails, (c) qty +/- misalignment + cumulative-add bug, (d) dead-end order confirmation screen, (e) inconsistent/wrong-basis discount %. **Fixed: (a)(b)(c) and the 57%/58% consistency part of (e)** — self-verified in preview at 375/768/1280px, **still needs live mobile-device verification**. **NOT YET DECIDED by Sumaksh:**
- **(d) — post-order screen scope**: Claude Code proposed itemized order summary + total + static "dispatched in 1-2 business days" text + guest-only signup prompt. Explicitly NOT proposing real-time tracking/WhatsApp/email receipt (no backend exists). Awaiting approval.
- **(e-basis) — dealer discount display format**: Option A "36% off DLP" badge / Option B no % badge, just Net + DLP prices / Option C both MRP-based and DLP-based badges shown together. Awaiting choice.

### Admin Dealers & Customers TYPE dropdown — commit `50b937c`
Clipping fix caused a click-through regression (portal dropdown options unclickable); fixed by including the portal ref in the outside-click check. Confirmed Ready on Vercel, but **actual click-through behavior not yet tested live**.

### Admin Products real-time update bug
Editing MRP/DLP doesn't reflect in the Products list until manual refresh. Workaround: relogging in fixes it (session/cache staleness). **Root cause not yet fixed.**

### /login desktop border
Desktop split-panel has 0px border (mobile has a thick gold border). Mockup approved conceptually but **not yet sent as a build prompt**.

### /login OTP end-to-end test
Mobile border + scroll-cutoff bugs confirmed working. **Full OTP login flow (Channel Partner + Customer) still never verified end-to-end**, only visually — auth/routing code was touched multiple times during the border saga.

### /store zoom investigation — RESOLVED as a non-issue
A "90% browser zoom" symptom turned out to be **Chrome's own per-site zoom memory** (not a code bug) — Sumaksh manually zoomed once, Chrome remembered it for the domain. Confirmed resolved after resetting zoom (Ctrl+0). The earlier CSS fix (`overflow-y:scroll` instead of `scrollbar-gutter:stable`, commit `1f43b6a`) can stay as-is; it fixed a separate real login↔store width-shift issue.

### Price List PDF — minor remaining items
Last-row image size inconsistency (fix pushed, `a9dac35`) and light Fanman watermark per page (pushed) — both **pending re-verification**.

---

## COMPLETED THIS SESSION (confirmed done, reference only)
- Guest hard-block fully working end-to-end (see saga above).
- Pop-in/pulse animation for the block banner.
- Checkout prefill code pushed.
- iOS Cart drawer fix (commit `6ccce3a`) — body was missing `overflow-x:hidden`, CartDrawer used `100vw` instead of `100dvw`; both caused it to render off-screen on iOS Safari. Self-verified in preview at 375/390/430px; **still needs live iPhone verification**.
- 4 of 5 mobile bugs from the 22/7 batch.
- Admin Orders empty-list bug (ambiguous FK join).
- Both real lost payments recovered; duplicate order cleaned up; empty-order_items bug fixed.
- Payment ID added to printed Sales Order.
- `/admin/health` page, `support_requests` table + customer complaint link, CLAUDE.md Rules §12-14.
- Dropdown-in-clipped-container fix (`426f7ad`) and its click-through follow-up (`50b937c`).

---

## STANDING CLAUDE.md RULES (cumulative reference)
- Multiple-of-4 PDF page padding (A5-fold printing constraint).
- Always use existing brand assets — never recreate logos/mascot with typed text or shapes.
- Three-level role hierarchy dedup in Admin list (Guest<Customer<Dealer — an email shows only under its highest level).
- Step-by-step self-check for complex features — no shortcuts, zero tolerance for mid-implementation bugs.
- Usage-justification breakdown after every individual code change/action.
- Efficiency/minimize-token-usage — avoid redundant reads, batch edits.
- **§12-14 (NEW, 23/7) — Payment-Order Integrity**: self-check all 3 user types when payment code is touched; never silently swallow order-save errors; proactively reconcile Razorpay Captured payments vs `orders` daily/whenever payment code ships, using `/admin/health`.
- Standing expectation: always confirm `git status` is clean and the correct commit shows "Ready" on Vercel before reporting anything done (this rule was violated once this session — the pop-in animation was verified only in local preview and never actually committed until Sumaksh caught it by checking Vercel himself).

---

## OTHER PENDING / NOT-YET-BUILT (lower priority, reference)
- Bulk Edit "Add column" option (HSN Code/Category/Unit editable columns) — mockup approved, not yet sent as a build prompt.
- Admin-only discount-% "Add column" on main Products table — mockup approved, not yet sent.
- Dealer greeting fallback — unresolved follow-up on whether to trim at the first '.' in the email local-part.
- Dashboard Phase 3 — monthly turnover trend + category-breakdown donut chart.
- Hisaab Telegram bot — Abhinav needs to update the Groq edge-function API format, redeploy, re-run webhook registration.
- Fanman mascot idle-turn CSS animation — prompt drafted, never sent.
- Pinch-to-zoom for admin panel — explicitly parked/discarded, not active.
- Req A Step 6 (`deleted_guests` composite-key dependency) — deliberately deferred, not formally decided.
- Req A Step 5 — confirm Ledger.jsx (not just Dashboard.jsx) also uses the OR-union query for dealer_id/profile_id.

---

## PROJECT CONTEXT (reference)
- Web app: eltopbyembassy.com — Vercel project `eltop-dealer-app-v3`, Supabase ref `prwxautydwvmwcwieskd`.
- Sumaksh directs product decisions and reviews outputs; developer Abhinav Mahajan implements code via Claude Code (a separate coding-agent chat, not this conversation).
- Workflow in this chat: Sumaksh describes a bug/feature (often in Hinglish) → Claude (here) sometimes shows a mockup and asks clarifying questions → Claude drafts a precise, ready-to-paste Claude Code prompt → Sumaksh pastes Claude Code's response back here → Claude verifies the claim, updates the running Done/Pending tracker, and either confirms or pushes back with a follow-up prompt.
- Standing expectation for Claude Code: always confirm `git status` is clean and the correct commit is Ready on Vercel before reporting anything as done.
- Pricing model: unverified guest = MRP; OTP-verified customer = 15% off MRP; dealer = DLP × tiered discounts set by Admin.
- Every item Claude Code is asked to do is tracked as Pending until Sumaksh explicitly says "done"/"mark done" or shares a confirming screenshot — this discipline should continue in the next chat.
- Admin auth uses a dedicated `admins` table (row with `id = auth.uid()` = is admin) — NOT a `role` column on `profiles`. Remember this for any future RLS policy work.
- Customers are `auth.users` entries with NO `profiles` row (only Dealers have profiles rows) — this distinction caused THREE separate bugs this session (`check_profile_exists`, the `profile_id` FK violation, and the AdminOrders ambiguous-join). Any future code that branches on "does this user have a profiles row" needs to account for this.

---

*End of handoff document. Generated 23 July 2026 for continuity into a new chat session.*
