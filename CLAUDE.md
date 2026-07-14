# Eltop Dealer App — Project Instructions for Claude Code

This file is read automatically at the start of every Claude Code session in this project.
Follow these rules on every change, without being asked.

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
