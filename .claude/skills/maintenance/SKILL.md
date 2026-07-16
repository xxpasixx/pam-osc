---
name: maintenance
description: Routine upkeep between features — dependency updates, small refactors, content/config tweaks, and a product health check (INDEX honest, sunset dates due, README current). No feature folder, no spec — because nothing observable changes. The risk gate still applies.
argument-hint: "optional: what to maintain (e.g. 'update dependencies', 'health check') — omit to run the full pass"
user-invocable: true
---

# Maintenance

## Goal
Keep a product healthy without feature ceremony. Maintenance is work that changes **no observable behavior**: dependency and security updates, small refactors, content/copy/config tweaks in the free zone, doc updates. That's why it needs no spec delta — and also the line you must hold.

## The scope guard (check first, every time)
- Would a user notice the change? → It's a feature or a spec delta. Route to `/spec` or `/build` and stop.
- Does it touch **money, credentials/auth, or personal data** code paths, or any guarded zone (`docs/icf-context.md`)? → The hard gate applies; route to the full chain and stop.
- Is production broken right now? → That's `/hotfix`, not maintenance.

## The pass (run what was asked; bare `/maintenance` runs all of it)

### 1. Health check (read-only, report findings)
- `features/INDEX.md` honest? Statuses match reality; **sunset dates due or past** → flag for takedown (status → Retired, data handled as recorded); ops review overdue → remind the owner line.
- README Tier-0 answers still true (live status, URL, owner)? `AGENTS.md` TBDs still open?
- Anything in `docs/ideas.md` worth pruning or promoting? (Suggest, don't triage — that's `/init`/`/spec`'s job.)

### 2. Dependencies
List outdated packages via the stack's tooling (`AGENTS.md → Tech Stack`; e.g. `npm outdated`). Then:
- **Patch + minor:** update as one batch. Verify versions against the registry or live docs (per `/build`'s rule) — never from memory.
- **Major:** never silently. List each with its breaking changes and let the user pick — a major that changes behavior is not maintenance.

### 3. Small fixes
Free-zone churn the user asked for (copy, styling, config, dead-code removal, small refactors). Keep each change minimal and separate — no drive-by improvements beyond the ask.

### 4. Verify — behavior-neutral or it doesn't ship
Build, lint, and tests pass (`AGENTS.md → Build & Test Commands`); existing E2E tests still green. A failing test after a dep bump is a stop sign, not something to patch around. Spot-check the core flow: same behavior as before.

### 5. Land it
Maintenance merges via a PR/MR like everything else (`main` is protected). One line in `features/INDEX.md → Operations`: `Last maintenance: <date> — <one-line summary>`. Suggest `/ship`-style live verification only when the merge deploys automatically.

## Never
- Bump a major version, change an API contract, or touch a guarded zone without explicit user approval
- "Fix" a behavior difference by updating the test — that's a behavior change wearing a disguise
- Let the pass balloon: maintenance is small by definition; anything big gets a feature folder

## Git Commit
```
chore(deps): update dependencies — <summary>   ·   chore: <what> — no behavior change
```
