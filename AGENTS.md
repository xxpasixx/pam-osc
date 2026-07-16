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

**pam-osc v2** — cross-platform desktop app (macOS, Windows, Linux) bridging MIDI controllers and GrandMA3 over OSC. Replaces the Open Stage Control dependency of v1.

- **Shell:** Electron; packaging with `electron-builder` (dmg / exe / AppImage), unsigned for the MVP
- **Main process (Node.js):** `easymidi` (MIDI I/O), `osc` (UDP/OSC); ported v1 core (`midiUtils`, `oscUtils`, `routingUtils`, `colorUtils`, `portUtils`, module logic)
- **Renderer (UI):** React + TypeScript + Vite
- **Console side:** GrandMA3 Lua plugin (`pam-OSC.lua`) — unchanged from v1, lives in this repo
- **Tests:** Vitest; integration tests via virtual MIDI ports (easymidi; Windows needs loopMIDI → CI on macOS/Linux) and a fake-MA3 OSC emulator (UDP socket that records messages and replays feedback)

## Project Structure

v2 is developed on the long-lived **`v2` branch**; `main` stays the stable v1.4 for existing users until v2.0 ships.

- `app/` — the Electron app: `app/src/main` (Electron main process, MIDI/OSC), `app/src/renderer` (React UI), `app/src/core` (ported v1 core, pure JS/TS, unit-testable)
- `features/` — feature specs; `docs/` — PRD, data model, ideas
- v1 files (root-level `*.js`, `mappings/`, `OpenStageControlConfig.config`) remain untouched on `main`; on the `v2` branch they may be moved to `legacy/` during cleanup
- `gma3_library/` — the MA3 Lua plugin release files

## Build & Test Commands

All app commands run inside `app/`:

- `cd app && npm test` — Vitest (unit + bundled-content validation)
- `cd app && npm run test:watch` — Vitest watch mode
- `cd app && npm run typecheck` — `tsc --noEmit`
- `npm run format` — Prettier (repo root, whole repo)
- `npm run dev` / `npm run build` (Vite + Electron / electron-builder) — TBD, arrive with PAM-2/PAM-3

Live docs: Context7 connected — verify dependency versions via `npm view <pkg> version` before pinning.

## Environments & Release

No staging environment. Development and testing happen locally against **GrandMA3 onPC** plus real MIDI hardware; a change is release-ready when it has been verified locally with onPC and at least one real device — the MIDI/OSC emulator test suite is the safety net in CI.

- **Branching:** `main` = stable v1 (bugfixes still possible) · `v2` = integration branch for v2.0 · feature branches `feat/PAM-X-name` fork from and PR back into `v2` · go-live of v2.0 = merge `v2` → `main`
- **Release:** GitHub Releases with versioned installers (dmg / exe / AppImage); beta pre-releases for Discord testers
- **Rollback:** users install the previous release; v1.4 stays available and functional in parallel
- **Code signing:** none in the MVP (documented Gatekeeper/SmartScreen workarounds in README); planned as its own P2 item (Apple Developer + Azure Trusted Signing)

## Spec Language

English for all artifacts (PRD, specs, ACs, designs, reviews) — the repo is public with an international community. Chat with the maintainer happens in German.

## Key Conventions

- **Feature IDs:** this project's prefix is **`PAM`** — IDs are sequential: `PAM-1`, `PAM-2`, … (next free ID in `features/INDEX.md`)
- **Commits:** `feat(PAM-X): description`, `fix(PAM-X): description`
- **Protected branches:** nothing lands on `main` or `v2` directly — every change merges via a PR/MR, including `/ship` (go-live) and `/hotfix` (expedited). You create `feat/PAM-X-name` from `v2` before `/build`; `main` stays releasable (stable v1).
- **Parallel build:** `/build` fans out file-disjoint tasks as isolated subagents
- **Human-in-the-loop:** approval before artifacts are finalized and always before go-live
- **Secrets / env files:** Never read, edit, or create real env files (they hold private keys). To document a variable, add a placeholder to the project's `.env.example` variant — the one kind of env file an agent may edit. When a real value is needed, ask the user in chat what to paste — never write it yourself.

## Context Files

Read these alongside this file (Claude Code auto-imports them; other agents: open them):

- Company context: @docs/icf-context.md
- Product context: @docs/PRD.md
- Data model: @docs/data-model.md
- Feature overview: @features/INDEX.md
