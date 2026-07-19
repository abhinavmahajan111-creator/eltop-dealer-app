# 19/7/26 Eltop Dealer App — Chat Handoff

Reference document for continuing work in a new chat. This session was very long
(100+ screenshots) — this doc captures everything covered, current state, and
what's still pending. Continued from the 14/7/26 handoff.

---

## Session summary

Covered: admin dealer-application-status control (badge + dropdown + table
column), and a very large multi-part Products-page overhaul — Bulk Edit
feature build-out, mobile responsiveness fixes (sidebar drawer, landscape
orientation), a long scroll-indicator design iteration, a full product-image
system unification (real photos, duplicate, lightbox, carousel), column
reordering, and several smaller UX fixes. Also: two new CLAUDE.md rules were
added (orientation testing, mockup fidelity), and a personal "pending task
tracker" system was set up in Claude's memory (separate from CLAUDE.md).

**Read this first if picking up mid-thread:** this session had one serious
process failure — an entire batch of fixes (sidebar reset, auto-navigate,
edit-form thumbnail, hover-enlarge, BulkEditModal lightbox) was implemented
and verified in the LOCAL PREVIEW only, but never actually committed or
pushed to git. Live-site testing then showed all of them "not working,"
which caused a full debugging cycle before discovering `git status` had
uncommitted changes the whole time. **Always confirm `git status` is clean
and the correct commit is live on Vercel before reporting anything as done**
— this is now a standing expectation for Claude Code in this project.

---

## 1. Admin dealer_application_status control — DONE, live (commit `10772f0`)

Dealer detail view: badge cluster now has an "APP:" dropdown (colors:
amber=Pending, blue=Under Review, green=Approved, red=Rejected), writes
directly to `profiles.dealer_application_status` on change, no Edit-mode
gating required.

Main Dealers & Customers table: new "APP STATUS" column between Name and
Phone, shows the same colored pill for dealer rows, `—` for guests/
customers/deleted.

Pricing wiring confirmed already correct — no extra work needed, since
`isApprovedDealer` already reads live from the dealer's own `profiles` row.

**Still pending from this thread:** the interrupted pricing verification —
log in as `mteam01.embassyelectric@gmail.com` (already manually set to
`approved` via SQL) and confirm DLP+MRP dealer pricing displays correctly on
Store/Catalogue/ProductDetail. This was never actually completed — it kept
getting deferred as Products-page work consumed the rest of the session.

---

## 2. Products page — Bulk Edit feature — DONE, live

### 2.1 Core feature (commit `cf0c5f7`, overflow fix `37696e9`)

- Checkbox selection: per-row, per-category "select all", global "select
  all" — unlimited selection, IDs stored in a `Set` (filter-safe).
- Floating "Edit Selected (N)" button, bottom-right, appears when
  `selected.size > 0`.
- `BulkEditModal`: mini spreadsheet — Name | DLP | MRP | Stock | Packing,
  every cell pre-filled with current DB values (never blank).
- **Keyboard navigation (exact spec, fully implemented and verified):**
  - Focus a cell → entire value auto-selected.
  - `Enter` → commits current value (typed or unchanged), moves to **same
    column, next row** (not next column). Cell's value auto-selected again.
  - `Enter` with no typing = pure navigation (skip a row without changing
    it). Multiple Enters = multiple rows down.
  - `Enter` on the **last row** → focuses "Save All" button. `Enter` again
    → triggers save. Entire flow is keyboard-only from first cell to save.
  - `ArrowLeft`/`ArrowRight` → collapses auto-selection, moves cursor
    in-place inside the value (does NOT navigate rows).
  - Validation: name required, numeric fields ≥ 0, inline per-cell errors,
    save blocked until fixed.
  - Batch save: chunked 20-at-a-time via `Promise.allSettled`.
- Modal `overflow: hidden` + flex-column/flex-fill inner div (fix landed in
  commit `8f0258d`) — needed for vertical scroll to actually work; this was
  also a real mobile UX bug (content was bleeding past 90vh) fixed as a
  side effect.

### 2.2 Performance fix — DONE, live (commit `7f9f9cd`)

**Bug:** typing/deleting in the Name field was extremely slow (~516ms per
keystroke) with 80-90 products selected, because `drafts` was a single
`useState` object — every keystroke re-rendered all rows, compounded by the
Name column's `autoResize` textarea reflow.

**Fix:** converted to uncontrolled inputs (`inputRefs` + `useRef` for
initial drafts, no controlled `drafts` state). `autoResize` now runs once
per mount via `useEffect`, not per keystroke.

**Measured: 516ms → 5.5ms per keystroke (94× faster)** with 90 products
selected. Verify on a real device with a large selection if not already
done — this was measured in preview.

### 2.3 Name column wraps instead of truncating — DONE, live (part of
commit `c713a56`)

Long names (e.g. "Eltop Cooler Motor 127mm Aluminium") now wrap to 2-3
lines in a styled `<textarea>` (no visible textarea chrome) instead of
being cut off with ellipsis — critical for telling apart visually-similar
product variants while bulk-editing. Verified at 375/768/1280px.

### 2.4 Serial numbers + column reordering — DONE, live (commit `74eb5f3`)

- Fixed `#` column (row position, 1/2/3...) added before IMG, read-only,
  skipped by keyboard nav.
- **Column reordering:** Name/DLP/MRP/Stock/Packing headers are drag-
  reorderable. `#` and IMG stay fixed anchors at the left.
  - Desktop: native HTML5 drag-and-drop, purple left-border drop indicator.
  - Mobile: ◂ ▸ buttons in each header (HTML5 DnD doesn't work reliably on
    touch without a library — this was a deliberate, explained choice, not
    an oversight).
  - Order persists via `localStorage` key `eltop-bulk-col-order` — survives
    modal close/reopen and page refresh.
  - Keyboard nav and Save logic were already identity-based (`colKey`
    string, not positional index) — reordering required zero changes to
    either.

---

## 3. Products page — Image system unification — DONE, live

This was a long sub-thread; final state is a single consistent system
across the whole Products area.

### 3.1 Real product photos — DONE (commit `a54e8bf`)

Admin's main Products table IMG column was showing a generic camera-icon
placeholder for every row. Fixed by reusing Store.jsx's `getImages`/
`getFirstImage` fallback logic (added `image_url` to the admin's Supabase
`.select()` query, which had been missing it). BulkEditModal also got a
small read-only thumbnail column using the same logic (commit `c713a56`).

### 3.2 The `image_url` vs `image_urls` data-model discovery

**Root finding:** 83 of 84 products have their real photo in a **legacy**
`image_url` field pointing to a static repo asset (`/images/....jpg`), NOT
in the newer `image_urls` array (the gallery the Media section's "Images
(X/9)" counter actually reflects). Only 1 product (Cordless Electric Kettle
CI-185, id `74`) has real photos in the new Supabase-Storage-backed gallery
(`image_urls`, 9 images).

**Decision made:** do NOT backfill `image_url` into `image_urls[0]` (this
would make static/unmanaged legacy images look falsely "deletable" in the
gallery UI, since `handleImageDelete` expects a Supabase Storage path).
Instead: **display-only fix** — the Media section now shows a **"Current
image (legacy)"** read-only preview row (with explanatory text) when
`image_urls` is empty but `image_url` has a value (commit `47c9b9e`). This
row was later also made clickable (commit `b495ff5`), opening the same
lightbox as everything else.

### 3.3 Duplicate product action — DONE, live (commit `ea96158`, image-copy
fix in `661687d`)

"Duplicate" link added next to "Edit" on every product row. Clones ALL
fields (name gets " (Copy)" suffix, category, MRP, DLP, HSN, unit,
packing, images) into a new row, **Stock resets to 0** (deliberate — avoids
phantom inventory), opens immediately in the edit form. First version had a
bug where the image didn't copy (only `image_urls`, which was empty for
legacy products, was cloned) — fixed by also copying `image_url`.

### 3.4 ImageLightbox — unified click-to-view system — DONE, live

Built incrementally across several commits, final state:

- **One shared `ImageLightbox` component**, used at every thumbnail
  location: main table (both hover-preview *and* click — hover kept as a
  quick-glance feature, click added on top for the full lightbox, commit
  `648e073`), edit-form top-left thumbnail, BulkEditModal thumbnail, and
  the legacy-image preview row.
- **Download button** — downloads the current image file.
- **Share button** — uses Web Share API (native share sheet on mobile,
  clipboard-copy fallback on desktop).
- **Multi-image carousel** (commit `abe3912`): opens with that product's
  FULL image array via `getImages(p)`. Left/right chevron arrows + arrow-
  key support, "Pic X of N" counter (hidden entirely for single-image
  products — no clutter). No wrap-around (arrows hide at each end).
  Download/Share always act on whichever image is currently displayed.
- **Preload + no-stale-image fix** (commit `0d893e3`): all gallery images
  preload into browser cache on lightbox open; navigation uses a single
  batched `navigate(newIdx)` that clears the old image and shows a
  "Loading…" placeholder instantly rather than ever leaving a stale photo
  on screen with a mismatched counter. `key={idx}` on the `<img>` forces a
  fresh DOM node per navigation. Verified: 8/9 images instant (cache hit),
  1/9 showed the honest loading state — this is the expected/correct
  fallback behavior, not a bug.
- Backdrop-click and Escape both close the whole lightbox (Escape does NOT
  step back through images).

### 3.5 Hover-preview enlarged — DONE, live (one-line CSS, part of the
lightbox work)

Main table's hover-preview (separate, pre-existing feature, kept
alongside the click lightbox) enlarged from ~220px to ~400px.

### 3.6 Category dropdown uppercase display — PENDING VERIFICATION
(commit `10612a7`, prompt sent, not yet confirmed done)

Table's category-header rows show uppercase via CSS (e.g. "EXHAUST FANS")
even when the stored value is mixed-case (e.g. "EXHAUST Fans" — this
looked like a data bug but was purely a CSS-only display difference).
Fixed by adding `text-transform: uppercase` to the Category `<select>` and
its `<option>` children — display-only, stored values unchanged. **Needs
live verification**: open the dropdown, confirm all options show
uppercase, confirm saving still writes the original mixed-case value.

### 3.7 Post-save navigation fixes — DONE, live (commit `9add126`)

- **Auto-navigate after "Update Product"**: on successful save, now
  automatically returns to the Products list (previously stayed on the
  edit form). Only navigates on success — failures keep the form open
  with the error shown.
- **Sidebar "Products" link reset bug**: clicking "Products" in the
  sidebar while already inside the Products edit-form or BulkEditModal did
  nothing (same-route no-op) — previously required clicking "Dealers"
  first, then "Products," to actually get back to the list. Fixed by
  mirroring the existing `resetAt`/`location.state` pattern already used
  by AdminDealers — sidebar click now always resets to list view even
  without a route change.
- **Product photo added to single-edit form**: small clickable thumbnail
  top-left, next to Product Name, opens the same lightbox.

**Important note on this whole batch:** these five fixes were the ones that
got stuck as uncommitted local changes for a while (see the "read this
first" note at the top) — they are confirmed pushed and live as of commit
`9add126`, but this is exactly the kind of fix worth double-checking on the
live site if anything seems off.

---

## 4. Mobile/responsive infrastructure fixes — DONE, live

### 4.1 Hamburger-drawer sidebar — DONE (commit `36cd849`)

Admin sidebar was permanently visible and ate ~55-60% of the viewport on
mobile, squeezing all page content into a narrow strip. Converted to a
collapsible drawer below the existing `640px` breakpoint (matched to the
codebase's existing convention) — hamburger icon, slide-in with dark
overlay, closes on nav-link click / overlay click / X button. Desktop/
tablet unchanged (still permanently visible).

### 4.2 Landscape-orientation bug + fix — DONE (commit `d95c797`)

**Bug:** the `640px` breakpoint was width-only — a phone rotated to
landscape (e.g. 812×375) exceeds 640px width and incorrectly fell back to
the old permanent-sidebar desktop layout, even though it's still a phone.

**Fix:** breakpoint changed to
`@media (max-width: 639px), (max-height: 480px) and (max-width: 960px)` —
verified correct for portrait phones, landscape phones (including
high-end/wide ones), tablets (both orientations, intentionally kept on
permanent-sidebar), and desktop.

**New CLAUDE.md rule added** (same commit): mandatory portrait AND
landscape screenshot testing for every mobile-facing layout change — a
width-only breakpoint is explicitly called out as insufficient on its own.

---

## 5. Scroll-indicator design saga — DONE, live (final form: draggable
scroll thumb)

This went through several iterations before landing on the final design —
worth knowing the history if it comes up again, but only the final state
matters going forward:

1. Per-row gradient-fade + chevron (broke visually on colored rows, too
   faint to see) — replaced.
2. Single centered "pg" badge with chevron (fixed the visual bug, but had
   its own vertical-positioning bug — badge computed off a 9000px-tall
   unconstrained container and rendered off-screen; fixed via visible-
   center calculation).
3. Made badges clickable (tap = page one screen-width/height at a time).
4. **Final replacement (commit `46acddd`):** the badge/paging system was
   fully removed and replaced with a **draggable scrollbar thumb** — thin
   track + pill thumb on the relevant edge (right for vertical, bottom for
   horizontal), proportional thumb size/position (native-scrollbar math),
   drag-to-jump-anywhere via pointer events with `setPointerCapture`.
   Verified with real drag-and-measure testing (exact pixel scrollLeft/
   scrollTop values matching expected clamped targets) on both axes.

**New CLAUDE.md rule added during this saga:** "mockup fidelity" —
when the user has approved a specific mockup, that mockup is the spec;
DOM-presence checks alone are not sufficient evidence of "done," an actual
screenshot/interaction must be verified against the approved design before
reporting completion. This rule caught real gaps at least twice in this
session (once initially missing, once when it needed to be invoked to
justify a vertical-badge investigation) and is expected to keep applying
going forward.

**Known open, explicitly parked (not active):** pinch-to-zoom for the
admin panel — Sumaksh raised this, then explicitly said to drop it for
now. Not on the pending list unless he raises it again.

---

## 6. Fanman mascot idle-turn animation — PROMPT DRAFTED, NOT YET SENT

Sumaksh asked for a way to give the Fanman mascot a "360 view" — clarified
this doesn't make sense for a single flat PNG without real 3D reconstruction
tools (Meshy AI / Tripo3D suggested as free options for that path, with a
caveat that flat-cartoon-to-3D results are often distorted). Agreed to try
the cheaper CSS-only route first: a subtle `rotateY()` idle sway/turn loop
(±8-12deg, 4-6s cycle, ease-in-out, possibly combined with a slight
`scaleX()` squeeze) layered on top of the existing cape-billow animation,
with an explicit instruction to Claude Code to give an honest visual
assessment rather than oversell a mediocre result. **This prompt was
written but Sumaksh has not yet sent it / confirmed sending it** — check
before assuming it's in progress.

---

## 7. Pending-task tracking system — NEW, set up this session

Sumaksh asked Claude (this chat assistant, not Claude Code / not
CLAUDE.md) to track every suggested Claude Code prompt as **Pending** until
he explicitly says "done"/"mark done" or shares a confirming screenshot,
and to show a Done/Pending split list on request ("show pending list").

This is now stored in Claude's memory:
- `/preferences.md` — the standing rule.
- `/areas/eltop-pending-tasks.md` — the actual running Done/Pending list,
  updated as of this handoff.

**This is separate from CLAUDE.md** (which governs Claude Code's own
verification standards in the repo) — don't conflate the two when picking
this up in a new chat.

---

## Immediate next steps for the new chat

1. **Verify the category-dropdown uppercase fix** (`10612a7`) — still
   pending confirmation from Sumaksh, was the very last thing in progress
   when this chat ended.
2. **Complete the interrupted `mteam01` dealer pricing verification** —
   this has been pending since the 12/7 session and kept getting deferred.
   Should probably be prioritized early in the new chat since it's the
   oldest open item.
3. Decide whether to send the Fanman idle-turn animation prompt.
4. Resume the other long-pending items whenever there's bandwidth:
   Dashboard Phase 3 (trend chart + category breakdown), Hisaab Telegram
   bot (Groq edge function + redeploy + webhook), Pantone 4414C hex
   resolution for brand-color matching.
5. Check `/areas/eltop-pending-tasks.md` for the full current Done/Pending
   breakdown rather than re-deriving it from scratch.
