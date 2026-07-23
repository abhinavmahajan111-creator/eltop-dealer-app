# Eltop Dealer App — Project Instructions for Claude Code

This file is read automatically at the start of every Claude Code session in this project.
Follow these rules on every change, without being asked.

---

## STEP-BY-STEP EXECUTION RULE

Kisi bhi multi-step/complex feature ke liye, har step ko implement karne ke baad us step ko THOROUGHLY self-check karo — build check, relevant eval/measurement, aur logic-correctness verify karo — TABHI agle step par jao. Koi shortcut nahi, koi assumption nahi. Agar ek step mein zaroorat se zyada complexity ya ambiguity mile, ruk jao aur clarify karo before proceeding. Goal: zero bugs slip through mid-implementation.

---

## BEFORE marking any task "done" — self-check this list

### 1. New Supabase table created?
Do NOT just create the table. In the SAME response, also provide:
- `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;`
- At minimum an INSERT and SELECT policy for `authenticated` role (add UPDATE/DELETE policies too
  if the feature needs them)
- State clearly in your summary: "RLS + policies included — safe to run as one block"

Never hand back a bare `CREATE TABLE` without RLS policies. This has caused live bugs before
(`restore_requests`, `deleted_guests` both hit "row-level security policy violated" because policies
were missing on first pass).

### 2. Changed or added filtering/list-view logic?
Before finishing, re-read the analogous EXISTING filter condition elsewhere in the same file (e.g.
if adding a "deleted" filter case for guests, find how dealers already do it) and confirm your new
condition matches that pattern exactly. State in your summary which existing pattern you mirrored.

This has caused a live bug before: a guest "deleted" filter used `typeFilter === 'all' ||
typeFilter === 'deleted'` when the working dealer pattern was just `typeFilter === 'deleted'`
— the extra `'all'` clause let deleted items leak into the default view.

### 3. Added a delete/soft-delete/restore flow?
Confirm in your own review (read the code back, don't just write it) that:
- The delete action does NOT touch related records that should survive (e.g. orders must never be
  deleted when a dealer/guest is soft-deleted — only visibility/flag changes)
- The item disappears from the default list view after delete
- The item appears when the "Deleted" filter is applied
- A restore path exists and reverses the delete cleanly

### 4. Touched payment/OTP/auth code?
Flag explicitly in your summary: "This touches [payment/auth] — please test with a real transaction
before considering this done." Do not describe payment or auth changes as complete without this note.

### 5. Multiple files touched in one change?
Before pushing, run `git status` and `git diff --stat` yourself and list every changed file in your
summary — don't let the person discover a file changed that wasn't mentioned.

### 6. Added logic that infers state from an API/query result (auth, roles, permissions, matching)?
Before finishing, explicitly check: does this code treat DIFFERENT failure/edge cases the SAME way
when they shouldn't be? Common patterns to check for:
- **Error-type conflation**: does a `.single()` / query error handler treat "no row found" (a real,
  expected outcome) the same as "the query itself failed" (network/timeout/permissions issue)? These
  need different handling — e.g. Supabase's `.single()` returns error code `PGRST116` specifically
  for "no rows found"; any OTHER error code means something actually broke and should NOT be treated
  as a confirmed negative result. Don't let a transient failure get silently interpreted as "user is
  not X" when the honest answer is "we don't know yet."
- **Race conditions**: if a state depends on an async fetch completing (e.g. "is this a dealer?"),
  is there a distinct "not yet loaded" state, separate from "loaded and the answer is no"? Code that
  can't tell "still loading" from "confirmed false" will misfire during the loading window.
- **Assumed-binary states that are actually ternary+**: before writing `if (session) → dealer`, check
  whether "session exists" actually implies just ONE identity, or whether multiple identity types
  (dealer / customer / admin / deleted / pending) can all produce a truthy session. Grep the codebase
  for other places that make the same assumption — they need the same fix.
- **What happens on retry/refresh**: if a user reloads mid-flow (OTP verification, checkout, payment),
  does the app end up in a consistent state, or can it get stuck between two assumptions?

State explicitly in your summary which of these you checked and what you found — "no edge cases of
this type apply here" is a fine answer, but don't skip stating it.

### 7. Wrapped a function in useCallback/useMemo/useRef, or otherwise added a new React hook?
Check the import line at the top of the file — confirm the hook you just used is actually imported
from `"react"`. This has caused a live bug before: `getPrice` was wrapped in `useCallback` during
the pricing overhaul, but `useCallback` was never added to the import line, so the build succeeded
(Vite didn't catch it) while the page crashed at runtime with "Uncaught ReferenceError: useCallback
is not defined" — a completely blank/black screen on `/store`, only visible in the browser console,
not in the build log.

**A passing `npm run build` does NOT prove the page actually works.** Build success only means the
code compiled/bundled — it does not execute the code path that would trigger a runtime
ReferenceError like this. After any change that touches hooks, imports, or conditionally-executed
code, say so explicitly and ask the person to actually load the affected page and check the browser
console (F12 → Console tab) for red errors — not just confirm the build was green.

---

## Store page consistent scale across entry paths

`/store` page must always render at a consistent, predictable zoom/scale level regardless of entry path (direct navigation, post-login redirect, guest checkout flow, or any other route). If any future change causes scale/zoom inconsistency across entry paths — even subtle width shifts from scrollbar layout shift — treat it as a regression and fix immediately.

**Root cause on record:** `scrollbar-gutter: stable` on `html` in `index.css` is what prevents the 15px content-width shift between pages with/without scrollbars. Do NOT remove this rule.

---

## Responsive testing — MANDATORY for every UI change

Before reporting any UI change as done, screenshot it at all three breakpoints yourself using
the browser preview tool (or computer use). Do NOT ask the user to verify responsive behaviour
manually — that is Claude Code's job.

**Required breakpoints for every header/layout/component change:**
- **375 px** — mobile (iPhone SE / most Android phones)
- **768 px** — tablet / narrow desktop
- **1280 px** — standard desktop

**What to confirm at each breakpoint:**
- No text overflow or clipping (elements stay inside their containers)
- All interactive controls (buttons, dropdowns, nav items) are fully visible and tappable
- Dropdown panels don't overflow off the right or bottom edge of the viewport
- The change looks intentional, not broken

**How to do it:**
1. Start the preview server if not already running.
2. Resize the preview pane (or use `preview_resize`) to each width in turn.
3. Take a screenshot at each width with `preview_screenshot`.
4. Include all three screenshots directly in your response before marking the task done.

Saying "should work on mobile" or "please verify on mobile" without supplying screenshots is
not acceptable. If the browser preview tool or computer use is unavailable, say so explicitly
and explain why — do not silently skip this step.

### Orientation testing — MANDATORY for every mobile-facing change

MANDATORY — test both portrait AND landscape orientation for every mobile-facing change, not just
the standard width-only breakpoints. A width-only CSS breakpoint (e.g. `max-width: 639px`) is NOT
sufficient on its own — a phone rotated to landscape can exceed that width and incorrectly fall into
desktop-style/tablet-style layout, even though it's still a phone. For any layout, sidebar,
navigation, or responsive change: explicitly capture and verify screenshots in BOTH portrait AND
landscape orientation before reporting the work as done. Do not assume orientation-safety just
because standard width breakpoints were checked.

Landscape phone dimensions to test: width ~812px, height ~375px (e.g. `preview_resize` with
`width:812, height:375`).

### Desktop content-width check — MANDATORY at 1280px

A screenshot at 1280px is necessary but NOT sufficient. A page can technically render inside a
1280px frame while the content is squeezed into a narrow left column with a large empty gray
area — this looks "fine" in a screenshot because nothing is broken, just badly proportioned.

**After taking the 1280px screenshot, ALSO run this `preview_eval` check:**

```js
(() => {
  const el = document.querySelector('#phone') || document.querySelector('.screen') || document.body.firstElementChild;
  const rect = el.getBoundingClientRect();
  return { contentWidth: rect.width, viewportWidth: window.innerWidth, pct: Math.round(rect.width / window.innerWidth * 100) };
})()
```

Report the result explicitly (e.g. "content is 390px / 1280px = 30% of viewport"). The content
width must be **at least 60% of viewport width** for a centered or contained layout, OR must
match the explicit design intent (e.g. a sidebar layout where a narrow column is correct).
If it's under 60%, investigate why and fix — do not declare the desktop layout done.

### Mockup fidelity — MANDATORY when an approved mockup exists

When the user has approved a visual mockup (screenshot, description with specific layout/color/size
details, or an annotated design), that mockup is the specification. Meeting it is not optional.

**"DOM presence" is not the same as "visually correct."** A component can exist in the DOM, be
positioned at the right coordinates, and still be invisible, wrong-colored, clipped, or the wrong
size. Before marking any UI task done:
1. Take an actual screenshot and compare it against what was described/approved.
2. Confirm each visual property that was specified (color, size, position, visibility, animation).
3. If any property doesn't match, fix it — do not say "it should work" or ask the user to verify
   something Claude Code could have verified itself with a screenshot.

Saying "the element is in the DOM at position X" without a screenshot is not acceptable as
evidence of visual correctness. This rule applies to every change that touches a component whose
appearance was explicitly specified or approved by the user.

### Reuse existing container patterns when building new pages

When building a new page that should match an existing page's responsive behaviour (e.g. a new
dealer screen that should look like Dashboard or Store), read the EXISTING page's outermost
wrapper/container JSX and CSS FIRST — before writing the new page — and reuse the same
container pattern. Do not build a new wrapper from scratch that might diverge in width or
alignment.

Specifically: grep for the outermost element's className or id on the reference page, read how
it's styled (inline or in index.css), and use the identical pattern. State in your summary
which existing page/pattern you mirrored, e.g. "used same `.screen` wrapper as Dashboard.jsx".

### 8. Changed PDF generation or page layout in `generatePriceListPDF.js`?
PDFs for print MUST have a total page count that is a multiple of 4 (so booklets fold correctly —
one sheet = 4 pages). The current formula at the end of the function handles this automatically:
```
blankNeeded = (4 - (afterContent + 1) % 4) % 4
```
where `afterContent = doc.internal.getNumberOfPages()` BEFORE adding blank and back pages.
The back page is ALWAYS the absolute last page; blank "Notes" pages are inserted before it.
Never change this ordering or remove this logic without re-checking the multiple-of-4 constraint.

### 9. Added a UI element that needs a brand asset (logo, mascot, icon)?
ALWAYS search the repo's `public/assets/` folder first for an existing file before creating one
with typed text, CSS shapes, or drawn SVG. Sumaksh has explicitly stated brand assets (like the
Eltop logo and Fanman mascot) already exist as saved files in the project and MUST be used as-is
— recreating them with text or shapes is not acceptable, even as a placeholder.

Concrete examples of files that already exist and must be used:
- `public/assets/ELTOP LOGO.png` — the Eltop "ELTOP / BY EMBASSY" logotype
- `public/assets/EMBASSY LOGO.png` — the Embassy Electricals logo
- `public/assets/fan man eltop.png` — the Fanman mascot character

If a brand asset is needed and is NOT found in `public/assets/`, stop and ask the user to provide
it — do not create a substitute.

### 10. Token efficiency — MANDATORY during every task
Actively minimize token usage while working:
1. **No redundant re-reads** — if a file's content is already in context, do NOT read it again. Use the existing content.
2. **Targeted search only** — when the exact function/class name is known, grep/read directly. Do NOT do broad exploratory searches.
3. **Batch related edits** — combine multiple small changes to the same file into one Edit call. Do not make 3 sequential single-line edits when one Edit with more context would cover all three.
4. **Plan before coding** — spend a moment identifying the correct approach before writing code. A bad approach that requires backtracking costs 2–3x the tokens of a good first pass.
5. **Screenshots/reloads only when necessary** — take a preview screenshot only when the change is visually observable AND you genuinely need to confirm it. Do NOT screenshot after every small step.

### 11. Usage breakdown — required at end of every non-trivial session
After completing a task (or at end of session), provide a brief token-usage breakdown:
- **(a) File exploration/reads** — % of effort spent reading files
- **(b) Code edits** — % of effort spent writing/editing code
- **(c) Build checks / preview reloads** — % of effort on builds, server checks, reloads
- **(d) Screenshot/verification steps** — % of effort on screenshots and eval checks
- **(e) Retry/backtrack** — % wasted on wrong approaches that had to be redone

If any single category exceeds 30% of the session, identify the specific cause and flag it.
Goal: surface inefficiencies so future sessions stay leaner.

---

## Rule: Payment-Order Integrity (mandatory, zero tolerance)

**Background:** On 23 July 2026, a bug caused 2 out of 4 real Razorpay payments to be captured
(money taken from the customer) while the corresponding order record silently failed to save, due
to a database foreign key violation that was never surfaced to the user, to Sumaksh, or to any log
Claude Code checked. Both were only discovered hours later via manual cross-checking of the Razorpay
dashboard against the Admin Orders list. This is the single most serious class of bug possible in
this app — it means a real customer can pay real money and receive nothing, with no automatic way
to know.

**The following applies unconditionally from this point forward:**

### 12. Touched payment/checkout code? Self-check ALL three user types.
Whenever ANY code in the payment/checkout path is touched — `Store.jsx`'s `handlePayment`,
`handleSubmit`, `CheckoutModal`, the Razorpay success callback, or any order-insert logic — Claude
Code must explicitly verify, as part of self-check before reporting done, that every successful
payment path actually results in a saved order. This includes testing the specific user-type
combinations that could behave differently: **Guest, Customer, and Dealer**. Today's bug was
Customer-specific and was missed because only one user type was tested.

State in your summary: "Verified order-save path for: Guest / Customer / Dealer" — do not skip.

### 13. Order-save errors must NEVER be swallowed silently.
Any `insert` into `orders` or `order_items` that can fail must have its error explicitly checked
and surfaced. The pattern `if (!error && data) { ... }` with no `else` is **forbidden** in the
payment success callback — it silently drops the failure. Required pattern:

```js
if (error) {
  console.error('[order-save] FAILED after payment', razorpay_payment_id, error);
  alert('Payment done but order save failed.\nPayment ID: ' + razorpay_payment_id + '\nError: ' + error.message);
  return;
}
```

Additionally: whenever `orders` insert fails after a successful payment, log the failure to the
`payment_failures` table (if it exists) or at minimum ensure `console.error` is called with the
Payment ID so it appears in any connected error monitoring.

### 14. Periodic reconciliation — run unprompted when relevant.
Whenever significant payment-related code has shipped recently, or when asked to do a periodic
check, proactively compare all Razorpay Captured payments (by asking Sumaksh to paste a Razorpay
dashboard export, or via any available API) against the `orders` table by `payment_id`. The query:

```sql
-- Paste Razorpay payment IDs here to find any with no saved order:
SELECT p.payment_id
FROM (VALUES ('pay_XXXX'), ('pay_YYYY')) AS p(payment_id)
LEFT JOIN orders o ON o.payment_id = p.payment_id
WHERE o.id IS NULL;
```

Any Captured payment with no matching order row is a **P0 issue** — flag it immediately, do not
wait to be asked. Propose the manual recovery SQL (INSERT into orders + order_items) on the spot.

---

## Still requires human testing (Claude Code cannot verify these itself)

Always end a non-trivial change with a short "please verify in browser" checklist covering:
- Does a real end-to-end click-through work on the LIVE site (not just local preview)?
- For payment changes: a real small-amount transaction, including the cancel/abandon path

---

## Deployment verification — MANDATORY after every push

A push succeeding (`git push` showing "master -> master") only means the CODE reached GitHub —
it does NOT mean the site actually updated. Vercel builds can fail silently after a successful push,
and if nobody checks, the site keeps serving an OLD build indefinitely while everyone believes the
new change is live. This has already happened once (4 consecutive deployments failed and went
unnoticed for ~19 hours while testing continued against stale code).

**After every push, before considering any task "done":**
1. Tell the person explicitly: "Please check the Vercel deployments page and confirm this build
   shows 'Ready', not 'Error' — https://vercel.com/[project]/deployments"
2. Do NOT assume the push succeeding means the deploy succeeded. Do NOT mark a task complete
   based on `git push` output alone.
3. If the person reports "Error" status, ask them to open that deployment and share the build log
   /error message — diagnose from that, don't guess.
4. If several changes have been pushed in a row without checking Vercel in between, explicitly flag
   this to the person: "We've pushed N changes since the last confirmed 'Ready' deploy — let's check
   Vercel before continuing, so we know which changes are actually live."

**One-time setup recommended (not a per-session task, just flag it once if it doesn't seem to be
set up yet):** Vercel has built-in deployment failure notifications (Settings → Notifications →
email or Slack on failed deployment). This is the real fix for catching failures immediately without
relying on someone remembering to check — suggest the person enable it if they haven't already.

---

## Git hygiene

- Never leave uncommitted changes at the end of a session unless explicitly asked to leave them staged.
- Default commit message style: short, present-tense, prefixed with what changed
  (e.g. `fix: guest deleted-filter leak`, `feat: repeat-guest OTP verification`).
- If a push fails or is interrupted (network errors, large files), confirm with `git status` and
  `git log -1` that it actually landed on `origin/master` before reporting success — don't rely on
  the last printed line alone, some failure modes print misleading "up to date" messages.

---

## Project context (for reference)

- Stack: React + Vite + Tailwind, Supabase (Postgres + Auth), Razorpay (LIVE mode), hosted on Vercel
- Repo: abhinavmahajan111-creator/eltop-dealer-app (branch: master)
- SQL changes are run manually by the business owner in the Supabase SQL Editor — Claude Code does
  not have direct DB access, so always output SQL as a copy-pasteable block, don't assume it ran
  automatically.
- Always show diffs before applying changes; wait for explicit go-ahead unless told otherwise.
