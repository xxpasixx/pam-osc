# General Project Rules

## Artifact Guarantees (the core rule — artifacts, not ceremony)
The skills work in any order; nobody is forced through a pipeline. Whatever path the user takes — full chain or straight to `/build` — these stay true:

1. **Every behavior change has a spec** — `features/PROJ-X-*/spec.md` with stable AC-IDs. A lite spec (Why + 3–7 ACs + Out of Scope; fewer ACs is fine for something truly trivial — never pad to hit a number) is fine; `/build` writes it inline when none exists. Spec updates are **deltas** — append/edit/move-to-out-of-scope, never rewrite, never renumber existing AC/EC-IDs. Maintenance (dependency bumps, refactors, content/copy tweaks that change no observable behavior) is not a behavior change — no spec delta needed; it runs through `/maintenance`. Guarded-zone code (see `docs/icf-context.md`) always counts as behavior.
2. **The one hard gate: money, credentials/auth, or personal data → full `/spec` + `/design` + `/review` before it goes live.** Size never matters; risk does. This is the only rule that never bends.
3. **`design.md` exists when the work has integrations, a shared data model, or moving parts** (queues, webhooks, syncs) — otherwise it's optional.
4. **Nothing reaches live unreviewed** — `/review` renders the verdict in `review.md` before `/ship` merges. **One exception — a production emergency:** `/hotfix` ships a minimal fix immediately with the user's explicit go-ahead, then backfills the spec delta and `/review` right after; the hotfix isn't done until the backfill is.
5. **`features/INDEX.md` stays honest** — the status column matches reality.
6. **Stray ideas go to `docs/ideas.md`** — one line each, the moment they surface, then keep working. Triage at `/init` and `/spec`; prune aggressively (a parked list where ideas go to die helps nobody).

**When the user says to keep it light**, respect it: lite spec + build + review is a complete, respectable path — don't suggest `/design`, extra process, or fuller specs unless the risk gate (rule 2) forces it. No nagging.

**If the project isn't initialized** (PRD still the raw template): recommend `/init` for a real product. For a small tool the user can go straight to `/build` — it bootstraps the minimal artifacts itself.

## Feature Tracking
- One folder per feature: `features/PROJ-X-feature-name/` with `spec.md` (always), `design.md` (when it helps), `review.md` (after review)
- `PROJ` stands for the project's own feature prefix, chosen at `/init` and recorded in `AGENTS.md → Key Conventions` — use that prefix, never the literal `PROJ`
- Feature IDs sequential — check INDEX.md for the next number; read INDEX before starting any work
- One feature per folder (Single Responsibility); never combine independent functionalities in one spec

## Git Conventions
- Commit format: `type(PROJ-X): description` — types: feat, fix, refactor, test, docs, ship, chore
- **Protected `main`:** nothing lands on `main` directly — every change merges via a PR/MR. Features are built on `feat/PROJ-X-name`; the **user creates the branch** — skills never create or switch branches. `/ship` merges the PR/MR (go-live) after the user's explicit go-ahead; `/hotfix` is the expedited lane for emergencies. `main` stays releasable.
- Check the existing code surface before building: `git ls-files` scoped to the directories in `AGENTS.md` → Project Structure

## Human-in-the-Loop
- User approval before finalizing artifacts (spec, design, PRD) and always before go-live
- Present options as clear choices, not open-ended questions

## Interview Discipline (canonical — used by /init, /spec, /build)
When a skill interviews the user: **one question at a time** (never a list); **always offer a recommended answer** the user confirms or corrects; **follow the conversation**, not a fixed script; **read files first** when they already answer a question; **no fixed question limit** — stop at real understanding. Every interview turn ends on **exactly one question as the very last line**, then stop and wait — never end on a summary or status note.

## Status Updates (Write-Then-Verify)
Statuses in `features/INDEX.md`: **Roadmap → Spec'd → Building → In Review → Approved → Live**
(Roadmap: on the map, no spec · Spec'd: spec.md exists · Building: /build active · In Review: /review active · Approved: review passed, no Critical/High · Live: shipped)
Two terminal states: **Cancelled** (stopped on purpose before Live — keep the row with a one-line reason) and **Retired** (was Live, taken down — note the date and what happened to collected data).

After completing work on a feature: **read** the tracking files, **write** the status change with the Edit tool (never just describe it), **re-read** to verify it landed. `spec.md` is read-only during `/build` — implementation notes go to the end of `design.md` or the commit message; `/review` writes `review.md`.

## File Handling
- ALWAYS read a file before modifying it — never assume contents from memory
- **Context recovery (canonical):** after context compaction, re-read the feature folder (whichever of `spec.md`, `design.md`, `review.md` exist) and `features/INDEX.md`, run `git diff`, continue from the first unchecked/unverified item — never redo finished work
- Never guess at import paths, component names, or endpoints — verify by reading

## Handoffs Between Skills
After completing a skill, **suggest** a sensible next step ("Next: run `/review` to verify against the ACs") — the user decides. Handoffs are never automatic and never enforced.
