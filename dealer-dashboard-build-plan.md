# Eltop Dealer Dashboard — Build plan

Reference design: `dealer-dashboard-design-reference.html` (visual target for the finished dashboard).

Data landscape confirmed by Claude Code on 14/7/26:
- `orders`, `order_items` — fully structured, ready to query by `dealer_id`
- `profiles.credit_limit` — ready
- `dealer_ledger` — admin-maintained ledger (type: order/payment), now readable by dealers via RLS policy `dealers_read_own_ledger`
- `products.category` — ready, values: Cooler motors, Fans, Geysers, Heaters, Kitchen, Submersible Pumps
- Outstanding balance = SUM(dealer_ledger where type='order') - SUM(dealer_ledger where type='payment')

## Phase 1 — Real core data (COMPLETE, 14/7/26)
- Outstanding balance (from dealer_ledger via RLS policy)
- Credit limit (from profiles)
- Turnover this year (from orders)
- Recent orders list with real status
- Empty states for zero-order dealers
- Commit: `0211f35`

## Phase 2 — Achievements and tier badges
- Define turnover-based tiers (starting point, to revisit once real data accumulates):
  - Silver: Rs 0 - 5L
  - Gold: Rs 5L - 10L
  - Platinum: Rs 10L+
- Badge logic: Rs X club, N orders completed, top category ("X champion"), order streak (consecutive months with an order)
- "Distance to next tier" progress bar
- Store/compute: can be calculated live from orders (no new table needed) or cached in a new `dealer_achievements` table for performance — decide based on order volume

### Future refinement (once real order data accumulates over a few months)
Fixed global tiers treat every dealer the same, but dealers have very different 
natural buying patterns — one might order Rs 10k worth every 6 months, another 
Rs 10k every day. A flat Rs 5L/10L threshold doesn't reflect or reward either 
dealer's actual behavior change.

Once there's enough real order history (suggest waiting 3-6 months post-launch), 
add a second, personalized badge layer on top of the global tiers:
- Calculate each dealer's own baseline: average order frequency and average 
  order value over their own order history
- Badges that reward IMPROVING against their own baseline, not a fixed company 
  number — e.g. a dealer who normally orders every 6 months getting a nudge 
  and badge for ordering monthly ("Consistency booster"), regardless of the 
  absolute Rs amount
- This becomes a "push toward more frequent/larger orders relative to their 
  own history" system, layered alongside (not replacing) the global Silver/
  Gold/Platinum tiers
- Needs a baseline-calculation job (e.g. monthly cron or on-demand calculation 
  from order history) since it depends on statistical averages per dealer, 
  not a simple lookup
- Revisit this once there's real usage data to define the actual thresholds 
  and badge names

## Phase 3 — Trend chart and category breakdown
- Monthly turnover trend (last 6 months) — aggregate orders by month
- Orders by category (donut) — join order_items to products.category
- Both scoped to the logged-in dealer only

## Phase 4 — Leaderboard
- Anonymous rank only — dealer sees their own position (e.g. "#12 of 340") and optionally a regional comparison ("top 5% in Delhi")
- Never expose other dealers' names, addresses, or identifying data
- Needs a ranking calculation (e.g. rank by yearly turnover across all dealers) — likely a scheduled/cached calculation rather than live query for performance

## Phase 5 — Ask AI
- Natural language queries against the dealer's own order/ledger data
- Likely pattern: Claude API call with a system prompt scoped to that dealer's Supabase data (similar approach to the Hisaab Telegram bot's AI extraction)
- Needs: query interface (chat-style input), backend function to fetch relevant data + call Claude API, response formatting
- Security: must only ever query the logged-in dealer's own data, never cross-dealer

## Phase 6 — Notifications, documents, polish
- Payment due reminders (from dealer_ledger due dates, if tracked)
- New scheme launch banners
- Price list PDF download
- Monthly statement PDF/export
- WhatsApp support quick link

## Fanman mascot and Eltop logo placement
Positions marked in the reference HTML with pink dashed [ASSET TAG] boxes:
- Eltop logo — small, top-left of the dashboard header
- Fanman icon — small, inside the Ask AI banner (Phase 5)
- Fanman climbing/pushing pose — next to the "distance to next tier" progress bar
- Fanman celebrating pose — briefly shown when a new achievement unlocks (Phase 2)
- Fanman friendly wave pose — replaces the empty grey space when a dealer has zero orders

Actual Fanman/Eltop logo image assets are not available in this chat (originally sourced from packaging PDFs) — Claude Code should pull the same asset files already used in Store.jsx and Login.jsx for consistency, not new artwork. Confirmed: `fanman.png` exists directly in the project root (`eltop-dealer-app/fanman.png`) — Claude Code should check how it's currently imported/referenced in Store.jsx and reuse the same import pattern for the Dashboard.

## Design notes carried through all phases
- Empty states must be honest, not broken (no NaN, no infinite %, no crashes)
- Every phase: verify with dev OTP bypass account before reporting done
- Every phase: screenshot at 375px / 768px / 1280px per CLAUDE.md responsive rule
- Brand colors: purple `#7B2D8B`, lavender `#E8D5F0` (or updated Pantone-matched hex once confirmed)
