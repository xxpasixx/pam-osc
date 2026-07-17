---
name: help
description: Context-aware guide — shows where the project stands and suggests a sensible next step. Use anytime you're unsure what to do next.
argument-hint: "optional question"
user-invocable: true
---

# Help

## Goal

Read the project state and tell the user where they stand and what a sensible next step would be — in plain, actionable language. Suggest, never enforce: the skills work in any order; what matters is the artifacts (see `.claude/rules/general.md` → Artifact Guarantees).

## Read the state

1. `docs/PRD.md` — raw template → not initialized
2. `features/INDEX.md` — features and their statuses
3. Per feature folder: which of `spec.md`, `design.md`, `review.md` exist
4. `AGENTS.md` per-project sections — PRD filled but stack sections empty → the stack interview was skipped; recommend re-running that part of `/init`
5. Code surface: `git ls-files` per `AGENTS.md` → Project Structure
6. `docs/ideas.md` — anything parked worth mentioning

## Suggest the next step

- **Not initialized** → `/init` with a one-line description of the idea
- **Initialized, no specs** → `/spec` for the first roadmap feature — or `/build` directly for something small (it writes its lite spec inline)
- **Spec'd** → `/build` — or `/design` first when the feature has integrations, a shared data model, moving parts, or risk (money/credentials/personal data → design is required)
- **Building** → continue `/build`; when it's done, `/review`
- **In Review** → finish `/review`; bugs go back through `/build`
- **Approved** → `/ship` (single feature or all approved as one release)
- **Live** → `/spec` the next thing; `/maintenance` for upkeep (deps, health check); ideas live in `docs/ideas.md`
- **Production broken right now** → `/hotfix` — minimal fix, expedited PR/MR, backfill after

Remind when relevant: the one hard gate — money, credentials/auth, or personal data → full spec + design + review before live. Everything else may fast-lane.

## Answer questions

If the user asked something specific, answer that FIRST, then the status. Common ones:

- "What skills exist?" → `/init` once · `/spec` · `/design` (when it helps) · `/build` · `/review` · `/ship` · `/maintenance` (upkeep between features) · `/hotfix` (production emergency) · `/autopilot` (quality loop, asks everything upfront then runs unattended) · `/help`
- "How do I add a feature?" → `/spec` (or `/build` for something small)
- "How do I change an existing feature?" → `/spec PROJ-X` — updates are deltas, AC-IDs stay stable
- "Where do ideas go?" → one line in `docs/ideas.md`; triaged at `/init` and `/spec`
- "How do I go live?" → `/review` must pass first, then `/ship`

## Output shape

**Current status** (one short paragraph) → **Features** (table from INDEX) → **Recommended next step** (one command) → **Also possible** (one line). Concise, exact commands, real paths.
