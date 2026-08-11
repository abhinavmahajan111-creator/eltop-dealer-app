# Eltop Dealer App — Chat Handoff (session ending 10 Aug 2026)

Continuation of `Eltop_Chat_Handoff_31-7-2026.md`. Correct Vercel deployments URL: **https://vercel.com/eltop-dealer/eltop-dealer-app-v3/deployments**

---

## 🔴 URGENT — do this first in the new chat

**Test dealer's credit_limit is currently set WRONG in production DB.** `eltop.business@gmail.com` (`ETP-DLR-8404`) has `credit_limit = 1000` in `profiles` table — this was set deliberately to test the new credit-limit block feature, but was **never reverted**. It should be `500000` (matches all other dealers). Revert this in Supabase → Table Editor → `profiles` before doing anything else, unless you're continuing the credit-limit test below.

**Credit-limit block feature is mid-test, not yet confirmed.** Last action taken: dealer logged in, Dashboard confirmed `Outstanding Rs. 1,314 > Credit Limit Rs. 1,000` (live ledger figure, correctly over limit). Was about to add an item to cart and hit Checkout to see if the block modal actually appears — **this has not been screenshotted/confirmed yet.** Pick up exactly here:
1. Dealer app → Catalogue/Cart → add any item → Checkout
2. Confirm block modal appears with correct live numbers (order value / balance credit limit / shortfall)
3. Test "Place Order — COD" button → confirm order appears in admin Orders list with `payment_status = 'pending'`
4. **Then revert `credit_limit` back to `500000`** and re-test that a within-limit dealer goes straight to Razorpay (no block modal) — regression check
5. Only mark the credit-limit block feature done after all of the above is confirmed live

---

## ✅ Resolved this session (chronological)

1. **DealerCRM blank-screen bug (React error #300)** — hooks called after conditional early-return in `AdminDealers.jsx`. Fixed (`be86c4d`), confirmed live.
2. **CustomerCRM + DealerCRM detail-page redesign** — avatar circles, tab bars, responsive stats grids, Account Info cards. Root cause of CustomerCRM's broken layout was `.admin-app` (a flex container) wrapping a page that needed a fixed full-page overlay like DealerCRM already had. Fixed (`8604f2d`). Also fixed a header-collapse bug on DealerCRM (`word-break: break-all` + no `flexWrap`).
3. **CustomerCRM Account Info NAME field** — showed raw stale placeholder ("New Dealer") instead of the header's "Unnamed customer" fallback. Fixed to show "—" (matches how other empty fields render) (`5998416`).
4. **Mobile-width check (375px)** — three separate `flexWrap`/`word-break` bugs found and fixed across CustomerCRM (`106f443`), DealerCRM (`b0d9867`), and the AdminDealers in-panel quick view (`10c4952`). All confirmed clean at narrow width, including busiest states (blocked customer, pending dealer with Approve/Reject).
5. **Admin table hairline column dividers** — subtle `border-right` added to shared `.admin-table` class (`d3902cb`). Verified it didn't affect other tables using the same class (Products table uses a different style, unaffected).
6. **Full PDF regeneration saga — 3 separate bugs, all fixed:**
   - **Storage RLS rejection** — root cause was the wrong JWT (anon key, not service_role) pasted into Vercel's `SUPABASE_SERVICE_ROLE_KEY` env var during earlier setup. Real fix: new `api/upload-pdf-url.js` serverless function using a correctly-configured service-role key to mint signed upload URLs (bypasses RLS legitimately, key never reaches the browser) (`8609fd2`).
   - **`PdfViewerModal` prop mismatch** — `AdminProducts.jsx` passed `blobUrl={...}` but the component expects `url={...}`, causing blank tabs on Open PDF (`a8b71fe`).
   - **Download corruption** — Download button re-wrapped an already-valid blob URL through `URL.createObjectURL()` a second time. Fixed to use the direct blob URL (`36a9feb`).
7. **Guest-row detail view** — confirmed working as originally designed (inline panel in `AdminDealers.jsx`, sourced from `allOrders` in memory, no `profiles` query). Not a bug.
8. **Blocked-dealer tabs (DealerCRM)** — confirmed intentional that admin retains full visibility/edit access (Orders, Activity, Ledger, AI Assistant) even when a dealer is blocked. Blocking restricts the dealer's own access only. No change made.
9. **Dealer-facing Ledger.jsx was a hardcoded stub** — showed fake numbers ("Rs. 1,25,000") to every dealer regardless of real data. Rewritten to query real `dealer_ledger` data (`5d5392e`), then fixed a follow-up bug where the OR-pattern query referenced a `profile_id` column that doesn't exist on `dealer_ledger` — reverted to plain `dealer_id` query for both `Ledger.jsx` and `Dashboard.jsx`'s outstanding card (`2bf4e4b`). Confirmed live — real ₹0/₹0 data with no console errors.

---

## 📋 Ledger & Voucher System — major feature built this session

**Spec doc (all design decisions locked):** `/mnt/user-data/outputs/Eltop_Ledger_Voucher_System_Spec.md`

Key decisions locked in the spec (see doc for full detail):
- Voucher types: Sales Invoice, Receipt (Payment In), Payment (Payment Out), Credit Note, Journal Voucher
- Journal vouchers: free Dr/Cr account selection (any two accounts, including the same account twice), no "which side" toggle — matches real Tally behavior
- Credit limit block: exact 3-option message (pay shortfall / temporary grant / COD)
- Cheque bounce: two separate counters (cycle counter resets on unblock; financial-year cumulative counter never resets, triggers zero-credit-for-3-months at 6 bounces/year)
- Aging in weeks (not day-buckets), reminders at 5/3/1 day before + due date
- Dispute flag freezes aging/reminders until admin resolves
- Partial payment allocation: FIFO default, manual override available
- Notifications: Phase 1 = email + in-app feed; Phase 2 = WhatsApp/SMS

**An interactive mockup was built and iterated extensively (10 versions) via the Visualizer tool** before building real code — final version had: period selector with opening/closing balance, inline-expandable voucher rows, free Dr/Cr account selection for journals, full-screen Tally-style voucher entry flow, proper Debit/Credit column-aligned particulars. This was chat-only exploration, not committed to the codebase — reference the conversation history if the mockup interaction pattern needs to be recalled, the built code is the source of truth going forward.

### Real build — DealerCRM Ledger tab (admin-side)

**Part A — voucher types split (`18adad6`):** Type picker now shows 5 tiles: Sales Invoice, Receipt (Pymt In), Payment (Pymt Out), Credit Note, Journal Voucher. Receipt and Payment Out both default to Credit direction (reduce dealer's due) — Payment Out is for incentive/rebate/commission payouts, NOT advances (advances should go through Journal Voucher instead). Vch No. prefixes: `EEIPL/RC/` (Receipt), `EEIPL/PO/` (Payment Out), `EEIPL/SI/` (Sales Invoice), `EEIPL/CN/` (Credit Note), `EEIPL/JV/` (Journal). Confirmed live, legacy pre-existing ledger rows still display correctly.

**Part B — Sales Invoice became a full billing form (`04d9b69`):** Product picker (search from `products` table), auto-calculated dealer net rate (`dlp × (1−discount1/100) × (1−discount2/100)`), multi-line-item support, delivery-state-based GST split (CGST+SGST if same state, IGST otherwise — 18% inclusive extraction formula reused from `Store.jsx`). **On Accept, creates a REAL order** — inserts into both `orders`+`order_items` AND `dealer_ledger`, per an explicit decision that manually-created invoices must show up consistently in the dealer's Orders tab and Dashboard stats, not just the Ledger.

**RLS gap found and fixed (SQL migration, not a code commit):** Admin-initiated inserts into `orders`/`order_items` were blocked by RLS (`dealer_id = auth.uid()` policies only covered dealer-initiated inserts, not admin-on-behalf-of-dealer). Fixed by adding `is_admin()`-based INSERT policies on both tables, matching the existing pattern used elsewhere (Products, Hisaab tables). **One orphaned order row was found and deleted** (`7dea72fa-00a5-40c1-b3d3-77e66f5540c9`) from a failed test before the fix — confirmed no other orphans exist for this dealer.

**Confirmed via live test:** 2-item Sales Invoice (₹691.20 + ₹1,356.80 = ₹2,048 total, Delhi CGST/SGST split) saved correctly, appeared in both Ledger (Dr ₹2,048, correct Vch No.) and Orders tab (matching line items, correct subtotal/tax/total) — data consistency confirmed.

### Credit-limit checkout block (`d3cb3ab`) — built, NOT yet fully tested (see urgent section above)

Diagnosis found a critical distinction: `profiles.outstanding` column is **stale/dead** (never written to by any code path) — the correct live source is computed from `dealer_ledger`, mirroring the same Dr/Cr aggregation DealerCRM's Ledger tab already uses. Built:
- Async live-balance check at top of `handlePayment` in `Store.jsx`, before Razorpay loads, only for `isApprovedDealer`
- Fails open (allows checkout) if the ledger query itself errors — deliberate choice, blocking legitimate orders due to a transient network issue is worse than the small risk of a rare over-limit slip-through
- Block modal shows the exact message from the spec, with live-computed order value / balance limit / shortfall
- **"Cash on Delivery" button — built**, creates a real order with `payment_status: 'pending'`
- **"Pay the balance now" button — NOT built**, flagged as non-trivial by Claude Code: needs a new dealer-side `dealer_ledger` INSERT RLS policy (dealers currently have no ability to insert their own ledger rows) plus a two-phase Razorpay handler (charge shortfall → record receipt → create full order on credit). This is a scoped follow-up, not done.
- **"Request temporary grant" button — placeholder only** ("Feature coming soon — contact admin"). The full grant/approval system (7-day commitment tracking, admin approval flow, auto-block on missed commitment) is a separate, not-yet-started feature per the spec.

---

## 🔴 Still fully pending — Ledger/Voucher system

- Finish testing credit-limit block (see URGENT section)
- "Pay the balance now" button — needs dealer-side RLS policy + two-phase Razorpay handler
- "Request temporary grant" — full request/approval system, not started
- Cheque bounce escalation (two-counter system) — spec locked, not built
- Aging report (week-based buckets) — not built
- Payment reminders (5/3/1 day + due date, email) — not built
- Dispute flag workflow — not built
- Partial payment allocation UI (FIFO default + manual override) — not built
- In-app notification feed (Phase 1 notifications) — not built

---

## 🟡 Older items, carried forward, unresolved

- CustomerCRM Guest-row / blocked-dealer detail tabs — confirmed fine, no action needed (see resolved section)
- Admin table hairline dividers — done this session
- Guest-row header mobile flexWrap gap (in `AdminDealers.jsx`, same pattern as the CustomerCRM/DealerCRM fixes) — flagged during testing, never fixed
- Pending-applicant Customer row Approve/Reject display — never verified
- Dealer portal login for a newly-promoted account — never tested end-to-end
- **PDF generation speed** — marked done at user's explicit instruction, without live verification. Still worth a real check given the upload path changed significantly this session (signed-URL flow).
- **Product Detail page "View Cart" bar disappearing bug** — marked done at user's explicit instruction, no actual fix applied. Bug likely still present.
- **Product image share/download popup (no single-vs-all selection)** — marked done at user's explicit instruction, no actual fix applied. Bug likely still present.
- Req A remaining pieces: `deleted_guests` composite key (Step 6, deliberately deferred), real non-sandbox Razorpay end-to-end test, bank statement spot-check for `pay_TGovJ4zbm84gBl`
- Verification-only (code pushed, never live-tested): phone-number cross-role banner (`3f145fd`), Store checkout prefill (`34e12bd`), mobile bugs batch (`d1acf6a`), Price List PDF minor items (last-row image size, Fanman watermark)
- Mobile bug (d) post-order screen scope, (e) dealer discount display format — awaiting your decision before building
- Not yet built (mockups approved): Bulk Edit "Add column", admin-only discount-% column on Products, `/login` desktop border
- Admin Products real-time update bug (MRP/DLP edit needs manual refresh)
- `/login` OTP full e2e test (Channel Partner + Customer)
- Category dropdown uppercase display fix — prompt sent, never confirmed
- Dealer greeting fallback (trim at first '.' in email local-part) — undecided
- mteam01 DLP+MRP pricing verification
- Pantone 4414C hex confirmation from print designer
- Dashboard Phase 3 (trend chart + category donut)
- Hisaab Telegram bot — Abhinav to update Groq edge function, redeploy
- Fanman idle-turn CSS rotateY sway — drafted, never sent

## 🟢 Low-priority / known gaps

- Profile page "Schemes & Offers" / "Support" rows — no click handler, even for approved dealers
- `.env.local` git-history check — never confirmed dev-OTP-bypass secret wasn't committed

## 🔵 Business-side / Phase 2 (no urgency)

- 2026 price list → machine-readable (Excel/CSV, SKU codes)
- Carton vs partial-quantity ordering logic
- GST breakdown on ledger/invoice screens (partially addressed via Sales Invoice form this session, but not the standalone request from earlier)
- Offline mode + scheme progress indicators
- Admin portal price-update workflow
- OTP fallback + catalogue filtering/sorting

---

## Reference — test accounts in use

| Email | Role/state | Notes |
|---|---|---|
| `eltop.business@gmail.com` | Approved Dealer | `ETP-DLR-8404`. **`credit_limit` currently WRONG at 1000 — revert to 500000** unless continuing the credit-limit test. |
| `ateam02.embassyelectric@gmail.com` | Pending Dealer | `ETP-DLR-2776`. `dealer_application_status = 'pending_details'`. |
| `motorcoolerdelhi@gmail.com` | Customer (test-blocked) | Used for CustomerCRM blocked-state testing. |
| `abhianv.mahajan111@gmail.com` | Customer | Confirmed-working baseline account. |

## Standing rules (unchanged, still apply)

1. **Never mark anything "Done" without a live screenshot from you.** Several items above were marked done this session purely on your explicit instruction, without verification — those are flagged clearly and are NOT the same as normal diagnostic-confirmed fixes.
2. **Diagnostic-first, always** — never send a fix prompt without root-cause confirmation first.
3. **Correct Vercel URL:** `vercel.com/eltop-dealer/eltop-dealer-app-v3/deployments` — Claude Code has repeatedly given wrong URLs in the past.
4. **Suspect cache first** — hard refresh (`Ctrl+Shift+R`) before concluding a fix didn't work; this genuinely happened twice this session (DealerCRM button-wrap fix, journal voucher testing).
5. Daily manual SQL cleanup of unverified profile rows — established routine, unrelated to this session's work.
