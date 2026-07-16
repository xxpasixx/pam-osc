# icf-ai-dev-template

> Spec-driven template — artifacts over ceremony. Stack chosen per project at `/init`.

**Any agent.** This file follows the [AGENTS.md standard](https://agents.md) — Codex, Cursor, Copilot, Gemini CLI and others read it natively; Claude Code loads it via the one-line import in `CLAUDE.md`. The `/commands` below are Claude Code skills (`.claude/skills/`); with other agents, follow the same artifact rules by hand — the guarantees in this file hold regardless of tool.

## The Workflow (artifacts, not a pipeline)

Ten skills, usable in any order: `/init` (once) · `/spec` · `/design` (when it helps) · `/build` · `/review` · `/ship` · `/maintenance` (upkeep between features) · `/hotfix` (production emergency) · `/autopilot` · `/help`.

This template governs code repos with real behavior. Don't install it for declarative Salesforce work, pure docs/infra repos, or other templates — the documentation ladder in `docs/icf-context.md` still applies there.

Ship-fast path: `/build` (it writes a lite spec inline) → `/review` → `/ship`. Process path: `/spec → /design → /build → /review → /ship`. Quality autopilot: `/autopilot` — asks everything upfront, then runs the whole chain unattended until everything passes (it never ships on its own). All paths end with the same artifacts — nobody is forced through phases.

- **Feature folders** `features/PROJ-X-name/`: `spec.md` (the contract — always), `design.md` (the technical design — when it helps), `review.md` (the verdict). Acceptance criteria carry stable IDs (`AC-1`, …); the chain is **AC → Test**. Spec updates are deltas; IDs are never renumbered. `spec.md` is read-only during `/build`.
- **The one hard gate:** money, credentials/auth, or personal data → full `/spec` + `/design` + `/review` before live. Everything else may fast-lane.
- **Status** lives in `features/INDEX.md`: Roadmap → Spec'd → Building → In Review → Approved → Live — plus two terminal states: Cancelled (stopped before Live) and Retired (was Live, taken down).
- **Ideas** go to `docs/ideas.md` the moment they surface — one line each, triaged at `/init` and `/spec`, pruned aggressively.
- **Stack facts live in this file's per-project sections** below, filled by `/init`. Skills read them here instead of assuming a stack.

## Tech Stack

_Set by `/init`. Languages, frameworks, platform, key services._

## Project Structure

_Set by `/init`. Where code, tests, and config live._

## Build & Test Commands

_Set by `/init`. How to build, lint, run tests, and run the app. Skills run these commands — if a command is missing here, they ask and offer to record the answer._

## Environments & Release

_Set by `/init`. Where you test before something is live, how a change gets promoted, what go-live means, and the rollback path._

## Spec Language

_Set by `/init`. The language specs and acceptance criteria are written in._

## Key Conventions

- **Feature IDs:** `PROJ` is a placeholder — `/init` picks this project's own prefix: 3–5 uppercase letters, memorable, ideally with a wink (Prayer App → `PRAY`, event site → `FEST`), unique among ICF repos. IDs are sequential: `PRAY-1`, `PRAY-2`, … Record the prefix here at `/init`.
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description` (with the project's prefix)
- **Protected `main`:** nothing lands on `main` directly — every change merges via a PR/MR, including `/ship` (go-live) and `/hotfix` (expedited). You create `feat/PROJ-X-name` before `/build`; `main` stays releasable.
- **Parallel build:** `/build` fans out file-disjoint tasks as isolated subagents
- **Human-in-the-loop:** approval before artifacts are finalized and always before go-live
- **Secrets / env files:** Never read, edit, or create real env files (they hold private keys). To document a variable, add a placeholder to the project's `.env.example` variant — the one kind of env file an agent may edit. When a real value is needed, ask the user in chat what to paste — never write it yourself.

## Context Files

Read these alongside this file (Claude Code auto-imports them; other agents: open them):

- Company context: @docs/icf-context.md
- Product context: @docs/PRD.md
- Data model: @docs/data-model.md
- Feature overview: @features/INDEX.md
