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

---

## Still requires human testing (Claude Code cannot verify these itself)

Always end a non-trivial change with a short "please verify in browser" checklist covering:
- Does it look right on mobile width, not just desktop?
- Does a real end-to-end click-through work (not just "the code should do X")?
- For payment changes: a real small-amount transaction, including the cancel/abandon path

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
