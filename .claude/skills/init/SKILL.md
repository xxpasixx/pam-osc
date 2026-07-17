---
name: init
description: Initialize a new project — quick setup check, then PRD, stack profile in AGENTS.md, feature map, and data-model sketch via a discovery interview. Run once at the very start. If the PRD is still the raw template, use this skill to plan the project together with the user.
argument-hint: "description of what you want to build"
user-invocable: true
---

# Project Initializer

## Goal

Turn a raw idea into a clear product vision, a recorded stack profile, and a prioritized feature map — through a relentless discovery interview (one or several related questions per turn, per the Interview Discipline), because a vague PRD now turns into the wrong features later.

## Quick setup check (first, silent unless something's wrong)

Framework files present (`AGENTS.md`, `features/INDEX.md`, `docs/PRD.md`, `.claude/`), git initialized, env-file patterns in `.gitignore`, `docs/ideas.md` exists (create it from one heading + one example line if not), a README answering the Tier-0 questions exists (`docs/readme-template.md`; missing → offer to draft it from the interview answers at the end), and the pre-commit hook is active — if `git config core.hooksPath` isn't `.githooks`, run `git config core.hooksPath .githooks` (safe auto-fix; the hook blocks staged secrets, key files, conflict markers, and oversized blobs). A `.claude/settings.template.json` next to an existing `settings.json` (installer couldn't auto-merge) → merge additively: union of the `permissions.deny/ask/allow` lists — keep every entry from both, never drop a deny; the user's other keys win — then delete the template. Fix what's safe silently; anything needing a human gets exactly one clear instruction. Never read env-file contents — existence only.

**Already initialized** (PRD filled)? → "This project is already initialized. `/spec` creates or updates features; `/help` shows where you stand." Stop.

**Brownfield — the repo already has code and commits** (the template was installed after vibe-coding started)? Read reality first: `git log --oneline`, the code surface, any existing README, AGENTS.md, or CLAUDE.md. Draft the PRD, stack profile, and feature map **from what exists** and interview only the gaps — never ask what the code already answers. Merge cases:

- `AGENTS.template.md` next to an existing `AGENTS.md` → merge them (keep the user's content, bring in the workflow section and per-project stack sections, fill the stack sections from what you found), delete the template file.
- An existing `CLAUDE.md` with real content (not just the `@AGENTS.md` import) → move its content into the right AGENTS.md sections, then replace `CLAUDE.md` with the one-line `@AGENTS.md` import so every agent reads the same file.

Offer to back-fill a lite spec per already-built feature (3–7 ACs from observed behavior) so `/review` has something to verify against — recommended, not forced.

## The Discovery Interview

Follow the **Interview Discipline** in `.claude/rules/general.md` strictly. The single most important rule: **every turn ends on its question(s) as the very last thing, then you stop and wait.** You may batch related questions (roughly 1–4, numbered); split back to single questions whenever one answer shapes the next. The user only knows it's their turn when you end on clear question(s) — never a summary. Unsure what to do next? That's itself the signal to ask.

**If the user pasted a full briefing:** don't interview point by point as if you knew nothing. Note what it answers, work through only the genuine gaps (batching related ones), then go straight to the PRD draft.

Cover through natural conversation: the core problem; target users and their pain; MVP must-haves vs later; alternatives and what's different; constraints (time, budget, team); success metrics; non-goals. Also skim `docs/ideas.md` — parked ideas may belong on this roadmap; triage them in (and prune what's dead).

One product question is mandatory (the data-model sketch depends on it):

> "Does the product store data persistently or share it between users/devices?"

"No" → skip the data-model sketch; leave a one-line "stateless — no persistent data" note in `docs/data-model.md`.

If accounts are needed, **accounts/auth is a real feature** — the first one, with its data foundation. Environment plumbing is never a feature.

## The Stack Interview (mandatory, before the feature map)

Same discipline (batch related items, skip what the briefing answered):

1. **Project type** — web app, mobile app, service, platform work (e.g. Salesforce), CLI?
2. **Tech stack** — languages, frameworks, platform, key services
3. **Repo layout** — where code, tests, config live
4. **Build & test commands** — "none yet" is valid: record TBD
5. **Environment strategy** — where do you test before live, how does a change get promoted? One plain paragraph
6. **Release & rollback** — what does go-live mean here, and the way back to the last good version
7. **Spec language** — for specs and ACs; recommend the team's working language
8. **Design reference** — if one exists, record _where it lives_ as one PRD Constraints line

**Checkpoint — STOP.** Present the stack summary, end on an approval question. On approval, write it into `AGENTS.md`'s per-project sections and extend `.gitignore` for the stack's noise. Mark TBDs visibly.

## PRD → Feature Map → Data Model (a checkpoint after each)

**PRD** (`docs/PRD.md`): Vision (2–3 sentences), Target Users, prioritized Roadmap (P0 MVP / P1 / P2), Success Metrics, Constraints, Non-Goals. Present the draft, end on an approval question, save only after approval.

**Feature map** (`features/INDEX.md`): first, pick the project's **feature-ID prefix** (replaces the `PROJ` placeholder): suggest a short, memorable one derived from the product name — a wink is welcome (Prayer App → `PRAY`, event site → `FEST`, wallpaper tool → `WALL`), 3–5 uppercase letters, not yet used by another ICF repo. Confirm it, record it in `AGENTS.md → Key Conventions`, and use it everywhere from here on. Then break the roadmap by Single Responsibility — each feature one testable, shippable unit with ID (PROJ-1, …), one-liner, priority, dependencies, status **Roadmap**. Recommend a build order. Present, approve, save; update "Next Available ID".

**Data-model sketch** (`docs/data-model.md`): with the whole feature set known, capture the entities (real-world nouns + who owns/sees each) and their relationships in plain language — product altitude, no column types (those are per-feature `/design` work). Present, approve, save.

## What NOT to do

- No feature folders or specs — that's `/spec`'s job; no code
- No setup/infrastructure features — plumbing has no user story
- Never save an artifact before its checkpoint approval; never end a turn without a question (single or batched) during the interview

## Checklist

- [ ] Setup check green (or the one open item handed off); `docs/ideas.md` exists and was triaged
- [ ] Stack profile approved and in `AGENTS.md` (five sections, TBDs marked); `.gitignore` extended
- [ ] PRD, feature map (Single Responsibility, dependencies, build order), and data-model sketch each approved and saved
- [ ] INDEX rows status **Roadmap**; "Next Available ID" set

## Handoff

> "Project set up. `/spec` your first feature: **[recommended first feature]** (PROJ-1) — or jump straight to `/build` for something small; it writes its lite spec on the way."

Name any TBDs so the user knows where they'll bite (usually at `/build`).

## Git Commit

```
feat: initialize project — PRD, stack profile, feature map
```
