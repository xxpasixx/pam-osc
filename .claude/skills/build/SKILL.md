---
name: build
description: Implement a feature with the project's stack (see AGENTS.md), working from whatever artifacts exist — a design, a spec, or just an idea (then it writes the lite spec inline first). Plans its own levels; fans out file-disjoint parallel tasks as isolated sub-agents.
argument-hint: "PROJ-X, or a short description of what to build"
user-invocable: true
---

# Build

## Goal
Implement one feature as a complete vertical slice — data layer, logic, interface — building what the contract asks for, not invented scope. Works for shippers and process-people alike: start from whatever exists, create what's missing, never demand ceremony.

## Start from whatever exists
1. **`design.md` exists** → it's the HOW; follow it. If it has a Build Plan section, that's your plan.
2. **Only `spec.md` exists** → build straight from the ACs; make the obvious technical choices and record any non-obvious one in a short note at the end of a new `design.md` (a decisions log, not a ceremony).
3. **Nothing exists** (the user described what to build) → write the **lite spec first, inline**: `features/PROJ-X-<slug>/spec.md` with Why + 3–7 ACs with stable IDs (fewer for something truly trivial — never pad) + Out of Scope, add the INDEX row, get a quick nod from the user, then build. Five minutes of contract makes the review verifiable — it is the floor, not ceremony.

**The one hard gate:** work touching **money, credentials/auth, or personal data** doesn't fast-lane. Stop and say so: it needs a full `/spec`, a `/design`, and `/review` before it ever goes live. Everything else: build.

Also read `features/INDEX.md`, `docs/data-model.md` (reuse the agreed entities; if design and map disagree, flag it), and `AGENTS.md` — Tech Stack, Project Structure, Build & Test Commands, Environments & Release. Commands still TBD → resolve with the user now and record them.

`spec.md` is READ-ONLY during build. If reality forces a deviation, stop and flag it — never silently redesign. An unresolved `[NEEDS CLARIFICATION]` marker is a stop sign for that part.

## Branch
Per `.claude/rules/general.md`: check `git branch --show-current`. On `main`, stop and hand off — the user creates `feat/PROJ-X-name`; you never create or switch branches. `main` is protected: everything lands via a PR/MR (`/ship` merges it; `/hotfix` is the emergency lane).

## Plan the build, then work level by level
Derive the plan from the design (or spec): group the work into **levels by dependency** — typically data/schema → logic/API → interface → polish, adapted to the project type. Levels run sequentially; "data contract before UI" falls out of the order. Track the plan inline (task list) for normal features; write it into `design.md` → Build Plan only when it's big enough for parallel fan-out or multiple sessions.

Within a level:
- Tasks that touch **disjoint file sets** may run in parallel: fan each out as a sub-agent with **git-worktree isolation** — parallel writers sharing a tree collide. Never parallelize two tasks that touch the same file.
- A forked sub-agent doesn't inherit domain skills — name the skill in the fork's instructions when its part needs one.
- After each level, the **main agent** — never the sub-agents — integrates, verifies against the AC-IDs that level serves, and moves on. One verification owner; sub-agents never declare themselves done.
- One or two trivial tasks → build inline; don't fork for the sake of fan-out.

## Use available domain skills
A feature that touches a domain with a vetted skill installed follows that skill, not memory. The domain skill governs *how* to integrate; the spec governs *what*; the gates below still apply.

## Live docs & dependency versions (first dependency install in a project)
The first time this project adds dependencies, check whether a live-docs MCP (e.g. **Context7**) is connected (`claude mcp list` via Bash, or its tools being available). If yes, use it for current APIs — memorized knowledge goes stale. If not, **ask the user once**:
> "Want to connect Context7? It feeds `/design` and `/build` today's library docs instead of memory. Setup: `claude mcp add --transport http context7 https://mcp.context7.com`, then `/mcp` to authenticate — or say no and I'll verify versions by hand."

If they decline or don't know how: **verify the latest stable version of every dependency you add via the ecosystem's registry** (e.g. `npm view <pkg> version`, `pip index versions <pkg>`, or the stack's equivalent) before pinning — never pin from memory. Record the outcome as one line in `AGENTS.md` → Tech Stack (e.g. "Live docs: Context7 connected" or "Live docs: declined — verify versions via registry") so later runs don't re-ask.

## Environment discipline
Per `AGENTS.md` → Environments & Release: build against the **test environment, never live** — promotion is `/ship`'s job. Capture every persistent-state change as a **versioned file in the repo** (never only clicks in an admin UI). Test environment missing → stop and hand off; don't touch live data.

## Asking vs. assuming
Ask when an assumption is **load-bearing** AND the spec doesn't settle it — security, data model, data loss, hard-to-reverse choices. Don't ask when the spec/PRD/design reference answers it or the choice is trivially reversible: take the obvious default and note it. Before committing, **surface your assumptions**:
> **Assumptions**
> - Tasks are private to their creator (spec implied it) — confident
> - Archive is a soft-delete — ⚠️ unsure, please confirm

Ideas that surface mid-build → one line in `docs/ideas.md`, keep building.

## Keep it minimal
The ACs define the exact scope — build precisely to them, then stop. No abstraction until there are two real callers; no speculative options or flags; don't hand-roll what the framework does; don't defend against cases the spec rules out. This governs structure, never safeguards: access rules, input validation, auth checks, and loading/error/empty states are required no matter how simple the feature. If the simple approach looks genuinely insufficient, that's a load-bearing assumption — surface it.

## What "done" means — verify, don't assert
Security items are hard gates: a slice with a missing access rule or unauthenticated write path is not done, even if it builds.

Data & logic (when there's a data layer): the data layer enforces the access/ownership rules — not only the UI; every write path validates input and rejects unauthenticated/unauthorized calls; performance-relevant lookups indexed, no N+1; persistent-state changes as versioned files, applied to test only; integration tests per entry point (happy + failure paths); no secrets in source.

Interface (when there is one): loading/error/empty states handled; works on the surfaces the project targets; accessible; **credentials or sensitive data never travel in a URL or query string (hard gate)** — request body, always.

Whole slice: the project's build and test commands pass — run them; "should pass" is not "passes". The interface talks to real endpoints, no leftover mocks. Every AC addressed (`/review` independently verifies — that's its job, not your box to tick).

## When you're done
- Status in `features/INDEX.md`: **Building** while you work; leave it Building when you hand off.
- Implementation notes and deviations → end of `design.md` or the commit message, never into `spec.md`.
- Report: what you built, the assumptions you surfaced, verification results.
- Suggest: "Built. `/review` verifies it against the ACs whenever you're ready."

## Git Commit
```
feat(PROJ-X): implement [feature name]
```
