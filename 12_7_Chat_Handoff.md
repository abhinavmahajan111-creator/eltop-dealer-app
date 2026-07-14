# Eltop Dealer App — Session Handoff (12 July 2026)

**Context for new chat:** This doc summarizes everything done in a long session (continuing from `9_7_Chat.md`). Workflow: Sumaksh → Claude (this chat) drafts prompts → Abhinav pastes into Claude Code → diffs reviewed here before Abhinav applies → deploy via `npx vercel --prod` (auto-deploy on git push is currently working, but has flaked before — always verify "Ready" + correct alias on the Vercel deployments page, not just terminal output).

**Repo/infra:**
- Vercel project: `eltop-dealer/eltop-dealer-app-v3` (NOT `eltop-dealer-app` — a wrong-project deploy happened once this session, always confirm `Aliased: https://www.eltopbyembassy.com` in output)
- GitHub: `abhinavmahajan111-creator/eltop-dealer-app.git`, branch `master`
- Supabase project: `prwxautydwvmwcwieskd`
- CLAUDE.md governs Claude Code behavior: §4 auth-touching code needs real browser testing, §5 document file changes, §6 edge cases, §7 hooks

---

## 1. Guest Order Tracking (`/track`) — COMPLETE ✅

Built from scratch this session:
- `src/lib/supabaseTrackClient.js` — isolated Supabase client with custom `storageKey: 'eltop-track-auth'` so it never overwrites the main app's logged-in session
- `src/pages/TrackOrder.jsx` — email → OTP → verify → shows guest's own orders (RLS-scoped, `dealer_id IS NULL`)
- RLS policies added: "Customers can view their own orders by email" (orders) + "Customers can view items of their own orders" (order_items) — both scoped to `auth.email()` match + `dealer_id IS NULL`
- Bug fixed: email casing — normalized to lowercase on both query filter and display text (was causing "No orders found" for correct accounts)
- OTP UX: Enter key now triggers verify, not just button click
- Entry points added: footer "📦 Track Your Order" link, header (replaced redundant "Dealer Login" button — it was routing to the same place as "Login/Sign Up"), post-payment alert mentions `/track`, confirmation email has a "Track Your Order →" button (Edge Function `send-order-confirmation` updated)

## 2. CORS bug on order confirmation email — COMPLETE ✅

`send-order-confirmation` Edge Function's `Access-Control-Allow-Headers` was missing `x-client-info, apikey`. Fixed and confirmed via live test order — email now arrives from `orders@eltopbyembassy.com`.

## 3. Vercel auto-deploy — CONFIRMED WORKING ✅

Was flaky earlier; confirmed via test push that git-push auto-deploy works. Manual `npx vercel --prod` remains the fallback/verification method — **always double-check the deploy actually targeted `eltop-dealer-app-v3` and aliased to `www.eltopbyembassy.com`**, since a `vercel login` re-auth once linked to the WRONG project (`eltop-dealer-app`, no `-v3`) silently. Fix: run `npx vercel link` and explicitly confirm the "Which project?" prompt shows `eltop-dealer-app-v3 (linked by git)` before deploying.

## 4. Responsive/mobile fixes — COMPLETE ✅

Multiple rounds across Store.jsx, MyAccount.jsx, Login.jsx, index.css:
- Mobile header: ELTOP + Embassy logos both visible side-by-side (previously Embassy was hidden <640px due to an inline `display:'block'` overriding CSS `display:none` — found and fixed), logos enlarged on mobile after freeing space
- Desktop logos: switched from mismatched `max-width` caps to equal `height: 38px` for visual balance
- Tablet horizontal-scroll bug: root cause was `100vw` + body `justify-content:center` interaction with scrollbar width: fixed via `html { overflow-x: hidden }` (safety-net, not root-structural fix — be aware if new components ever genuinely overflow, this silently clips them)
- "Hi, {name} ▾" dropdown unclickable bug: was `overflow:hidden` on `.store-header` clipping the absolutely-positioned dropdown — removed, replaced with the html-level overflow fix above so both problems stay solved together
- Login/Sign Up split into two stacked buttons ("Login" / "Sign up") on mobile only, to save space — both route to `/login` unchanged
- MyAccount Orders tab: summary cards (This Month/Last 3 Months/Lifetime) made clickable filters; whole table rows click-to-expand (replacing tiny ▶ trigger); filter bar added (Order ID search, Date range, exact Total match, Status dropdown) — all combine with AND logic, mutual exclusion between date-range and period-card filters; filter bar wraps 2×2 on mobile

## 5. Test product pricing — RESOLVED ✅

"Eltop Candy Submersible Pump 18W" had mismatched MRP/DLP/price (real MRP ₹599/DLP ₹380 vs a leftover test price of ~₹9-10). Sumaksh fixed the real price directly in admin. Note: if cheap live-payment testing is needed again, a different low-price test product or approach will be needed.

## 6. Test payment refunds — DEFERRED (not urgent)

Multiple small real Razorpay payments (~₹9-20 each) accumulated during live testing across sessions. Sumaksh will handle via Razorpay dashboard whenever convenient — not blocking anything.

## 7. Customer Excel export "Source" column — COMPLETE ✅

Added to `AdminDealers.jsx`'s customer export:
- "Registered Customer" (profiles, `is_dealer=false`)
- "Guest Checkout" (orders with `dealer_id IS NULL` whose email has NO profiles row — cross-referenced in JS, one row per unique guest email)
- Skipped "Converted to Dealer" distinction — no reliable audit trail to determine "was originally customer"; these are already visible in the Dealers sheet via `is_dealer=true`
- Guests who later registered show only as "Registered Customer" (no duplicate rows) — profile takes precedence
- Confirmed working via live export screenshot

## 8. Dealer/Staff role-based login overhaul — COMPLETE ✅ (major feature, multi-round debugging)

### What was built
Complete rework of `Login.jsx`'s role dropdown, which previously let ANY email through OTP regardless of whether it actually matched the selected role in the DB.

**Non-dealer staff roles** (Sales Executive, Logistics & Dispatch, Back Office — Administrator uses a separate pre-existing `admins` table check):
- New `staff` table: `id (FK auth.users), email, role (CHECK IN sales_executive/logistics/back_office)`, RLS: public SELECT (needed for pre-OTP check before a session exists — acceptable for this B2B internal context)
- **Pre-OTP validation**: before sending OTP, query `staff` table for email+role match. No match → OTP is NOT sent, inline error: "You're not registered as a {role}. Contact admin for clarification."
- ⚠️ **UNTESTED** — staff table is currently empty, no test rows inserted. Sales Executive error-path (no match) has been implicitly exercised, but the success path (real staff row → OTP → dashboard) has NOT been verified.

**Dealer / Channel Partner role** — split into "Existing Dealer" vs "New Dealer — Sign Up" sub-choice:
- *Existing Dealer*: OTP → verify → check `profiles.is_dealer`. `true` → `/dashboard`. Not true → sign out, show "Sorry, not registered as a dealer" + button to switch to New Dealer signup (email pre-filled)
- *New Dealer Signup*: OTP → verify → insert/update profile with `is_dealer: true, dealer_application_status: 'pending_details'` → lands on `/store` (not `/dashboard`) with a status banner
- New DB column: `profiles.dealer_application_status` (TEXT, default NULL — NULL/`'none'` = legacy approved dealers, unaffected)
- Banners on `/store` driven by `dealerApplicationStatus`: `'pending_details'` → yellow "application incomplete" banner; `'under_review'` → blue "under review" banner (Phase 2 will build the actual application form that transitions pending→under_review)

### Bugs found and fixed during this build (long debugging chain — useful context if similar issues resurface)
1. **RLS INSERT policy missing** on `profiles` — new dealer signup's insert/update were silently failing (errors were being swallowed, no `const {error}` capture). Added `CREATE POLICY "Users can insert own profile"` and `"...update own profile"` for `authenticated` role, `auth.uid() = id`. Also fixed the swallowed-error pattern in Login.jsx (now captures and surfaces errors, signs out cleanly on failure instead of navigating into a broken state).
2. **Race condition / stale header flash**: after new dealer signup, `/store` briefly showed the customer "Hi, {name}" header before correcting to "Dealer Dashboard" + banner, because `navigate('/store')` fired before AppContext's profile re-fetch completed. Went through 3 iterations:
   - Attempt 1 (`refreshSession()` fire-and-forget) — didn't wait, still flashed
   - Attempt 2 (parallel direct re-query + refreshSession) — reduced but didn't eliminate flash, and made 406-error spam worse
   - **Final fix (Option B, working)**: added a proper awaitable `refreshProfile()` `useCallback` in `AppContext.jsx` that queries profiles directly and updates context state, returning a Promise. Login.jsx now does `await refreshProfile()` BEFORE `navigate('/store')` — fully deterministic, no race.
   - Additionally added a `localBusy` state in Login.jsx: "Verify & Login" button shows "Setting up account..." and stays disabled through the whole insert→refresh→navigate sequence, as a spinner-guard safety net.
3. **406 errors** — root cause was `.single()` in the profile fetch throwing PostgREST 406 when zero rows exist (a genuine HTTP response, not really a "bug" but noisy/confusing). Fixed by switching the entire profile-load path to `.maybeSingle()` (returns `{data:null,error:null}` for zero rows instead of erroring).
4. **DealerRoute access-control gap (found via live testing, not initially planned)**: `DealerRoute.jsx` only checked `is_dealer===true` to grant `/dashboard` access — did NOT check `dealer_application_status`. A pending/under-review dealer could reach full `/dashboard` (bypassing the store banner entirely). **Fixed**: only `dealerApplicationStatus === 'none'` or `'approved'` reach `/dashboard`; `pending_details`/`under_review` redirect to `/store`.
5. **Dashboard hardcoded data (found, NOT fixed — lower priority)**: `Dashboard.jsx` has `const PENDING_ORDERS = [...]` hardcoded prototype array (ORD-10234 etc.) and `AppContext`'s `DEMO_PROFILE` fallback (credit_limit 500000, outstanding 125000) — this is why a brand-new dealer briefly saw fake-looking financial data before the access-control fix redirected them away. **No real data leak** — confirmed it's pure leftover prototype scaffolding, not another dealer's real data. Still needs replacing with real Supabase queries eventually (item #11 below).
6. **Restore_requests FK constraint**: deleting a soft-deleted test profile (`mteam01.embassyelectric@gmail.com`, used repeatedly for testing) required deleting its `restore_requests` row first (FK `restore_requests_profile_id_fkey`) before the profile delete would succeed. Pattern: always delete `restore_requests WHERE profile_id = ...` before `profiles WHERE email = ...` when cleaning up soft-deleted dealer test accounts.

### Hero banner redesign for logged-in dealers — COMPLETE ✅
The generic "Sign up & get 15% off" promo banner made no sense for a logged-in dealer. Built a dealer-specific version:
- Lighter purple gradient (`#8B3D9B → #B06DC8`) instead of flat/black-text
- White heading + light lavender subtitle, no discount CTA
- Fanman mascot added with a bounce animation, centered as a group with the text (not left-aligned with empty space)
- Mobile: stacks vertically (Fanman above, text below)
- Scoped entirely to `isDealer===true`; logged-out/customer banner untouched

**IN PROGRESS at session end**: adding an animated cape effect behind Fanman (flowing left, anchored at shoulder) for a "flying" feel. First code attempt looked bad (cape floating disconnected, not touching shoulder) — mockups iterated in chat to fix positioning (cape's right edge flush against Fanman's shoulder/neck, larger/more billowy fabric shape with multiple wave-folds, referencing a Superman-style cape flow without reproducing copyrighted art). **Final mockup approved in principle but the corresponding Claude Code prompt has NOT yet been sent/applied** — this is the next immediate task in a new chat.

---

## Outstanding / Pending Items (carry into new chat)

1. **[IMMEDIATE NEXT STEP]** Send the refined cape-animation prompt to Claude Code (shoulder-anchored, large flowing SVG path, multiple folds, leftward wave animation ~1.3-1.4s synced with Fanman's bounce) — mockup was approved in this chat's final message, just needs to be translated into a Login.jsx/Store.jsx code prompt and applied/tested/deployed.
2. **Dashboard hardcoded prototype data** (`PENDING_ORDERS` array, `DEMO_PROFILE` fallback in AppContext) — needs replacing with real Supabase queries. Not urgent, not a security issue (confirmed no data leakage), but cosmetically wrong for any real dealer.
3. **Non-dealer staff role login — UNTESTED end-to-end.** `staff` table is empty. Need to: insert a test row (`INSERT INTO staff (id, email, role) VALUES (<real auth.users UUID>, 'test@email.com', 'sales_executive')`), then verify OTP send + dashboard access works for a matching row, in addition to the already-confirmed no-match error path.
4. **Phase 2 — full dealer application form.** Currently "New Dealer Signup" only captures email (lightweight, `dealer_application_status='pending_details'`). The actual application form (business details, GSTIN, documents, etc.) that would transition status to `'under_review'` and eventually `'approved'` has NOT been built. The `/store` banner currently says "Application form coming soon" as a placeholder CTA.
5. Old ~₹599 test payment + accumulated small test payments — refund via Razorpay dashboard whenever convenient (not urgent, marked resolved/deferred by Sumaksh).

## Resolved / Closed items (no further action needed)
- CORS bug, Vercel auto-deploy, test product pricing, phone format inconsistency (marked done by Sumaksh), Excel export Source column, guest order tracking (Feature 2, fully built and tested), all responsive/mobile fixes, dealer/staff login access control and race-condition fixes, dealer hero banner base redesign.

---

## Key technical patterns/gotchas learned this session (for future work on this codebase)

- **Always capture Supabase call results** (`const {data,error} = await supabase...`) — silently discarding them (`await supabase...` with no destructure) lets RLS failures and other errors pass completely unnoticed, code proceeds as if it succeeded. This was the root cause of the dealer-signup insert bug.
- **`.single()` throws HTTP 406 on zero rows; `.maybeSingle()` returns `{data:null,error:null}`** — prefer `.maybeSingle()` for any "row may or may not exist yet" query.
- **`navigate()` should never fire before awaiting the state it depends on** — AppContext session/profile updates are async; don't assume a fire-and-forget refresh call has completed by the time the next line runs.
- **Vercel CLI re-auth (`vercel login`) can silently relink to the wrong project** if there are multiple similarly-named projects (`eltop-dealer-app` vs `eltop-dealer-app-v3`) — always explicitly verify via `vercel link`'s "Which project?" prompt before deploying after any fresh login.
- **Soft-deleted profiles retain a `restore_requests` FK reference** — must be deleted first when cleaning up test data.
- **CLAUDE.md self-check discipline is being followed well by Claude Code** (auth-touching flagged, file changes listed, edge cases noted) — keep enforcing "test yourself before reporting back, don't just say 'should work'" when auth/timing-sensitive changes are involved, since several rounds this session were needed because a fix was reported as done without being actually verified end-to-end first.
