# Price/MRP/DLP Change History — how to apply

Two pieces. Do them in this order.

## 1. Database (do this now, in Supabase — takes 1 minute, zero risk)

Open **Supabase → SQL Editor → New query**, paste the full contents of
`product_price_history_migration.sql`, and click **Run**.

This creates a `product_price_history` table and a trigger that automatically
logs the old value, new value, who changed it, and when — every time anyone
edits `price`, `mrp`, or `dlp` on any product. No app code needs to change for
logging to start working; it happens at the database level the moment this
runs.

You can immediately check it's working from Supabase's own Table Editor: open
the `product_price_history` table after your next product edit and you should
see a new row.

You can also query it directly any time without waiting for the UI piece below:

```sql
select * from product_price_history
where product_id = 6   -- Cabin Fan 300mm's id
order by changed_at desc
limit 10;
```

## 2. Frontend panel (hand this to your Claude Code CLI session)

`AdminProducts_price_history.patch` is a git diff against
`src/admin/AdminProducts.jsx` that adds a collapsible **"🕒 Price History"**
section to the product edit form, showing the last 10 changes (date, who,
old → new for MRP/DLP/Price).

Paste this into your other Claude Code session along with an instruction like:

> Apply this patch to `src/admin/AdminProducts.jsx`, then commit and let it
> deploy. It adds a Price History panel to the product edit form, reading from
> the new `product_price_history` table (migration already run in Supabase).
> Confirm live with a screenshot before marking done, per standing rules.

That keeps this change going through your normal diagnostic-first / live-verified
workflow instead of being hand-pasted here.

## Also worth knowing (found while fixing today's Cabin Fan issue)

The "DLP edit doesn't show up on the Store page in real time" item in your
backlog may not actually be a bug. `Store.jsx`'s `getPrice()` function only
uses `dlp` for **approved dealers who are logged in** (`p.dlp` with their
discount1/discount2 applied). Anyone browsing the Store logged out or as a
non-approved-dealer sees `mrp` directly, with `dlp` never entering the
calculation at all. If today's test was done while logged out (which matches
the screenshots — "Login / Sign Up" was visible), the price simply wouldn't
change regardless of caching, and that's expected behavior, not a bug. Worth
re-testing that backlog item specifically while logged in as the approved
dealer account before spending more time on it.
