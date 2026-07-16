---
name: spec
description: Create or update a feature spec (spec.md) — the contract with AC-IDs. Lite by default (3–7 ACs), full for risk work. Use for any new feature idea, and whenever an existing feature's behavior or scope changes (updates are deltas, never rewrites).
argument-hint: "feature name or PROJ-X"
user-invocable: true
---

# Spec

## Goal
Produce or evolve the **contract**: what the feature does, testable, with stable AC-IDs. Lite by default — a page, not a novel. The spec is the one artifact every feature has, however the user works; everything else is optional.

You own ONLY `spec.md`. Technical design lives in `design.md` (`/design`), verification in `review.md` (`/review`).

## Size to risk, not to ceremony
- **Lite spec (default):** Why (2–3 sentences), 3–7 ACs with stable IDs (fewer is fine for something truly trivial — never pad to hit a number), Out of Scope (1–3 bullets), edge cases only if real. One page.
- **Full spec:** user stories, 3–5 edge cases with EC-IDs, product-decision log — for features where getting it wrong is expensive.
- **The hard gate:** anything touching **money, credentials/auth, or personal data** always gets the full spec, and later `/design` and `/review` before it goes live. This is the one rule that never bends; size never matters, risk does.

Setup is not a feature — environment plumbing has no user story. Accounts/auth IS a feature (including its data foundation).

## Before Starting
1. Read `features/INDEX.md` — existing features, next PROJ-X ID, duplicates
2. Read `docs/PRD.md` and skim `docs/ideas.md` — is this idea (or a related one) already parked there? Pull it in if so
3. Skim the code surface (`git ls-files` per `AGENTS.md` → Project Structure)

## Three entry points

**A — New feature.** Interview per the Interview Discipline (`.claude/rules/general.md`) until you truly understand it: who uses it, the core job, must-haves, error/empty states, dependencies. For a lite spec that's often 2–4 questions — don't manufacture depth. Create `features/PROJ-X-<slug>/spec.md` from [template.md](template.md), add the INDEX row (status **Spec'd**), update the PRD roadmap if it's listed there.

**B — Update an existing feature.** Open with: *"What brought you back to this spec?"* Then write the update as a **delta**, never a rewrite:
- New behavior → append ACs with the next free IDs. Changed behavior → edit those ACs in place. Dropped behavior → move to Out of Scope with a one-line reason.
- **Never renumber existing AC/EC-IDs** — `review.md` and tests reference them.
- Close answered Open Questions (`- [x]` + resolution), log decisions with rationale, note the date.
- If the change invalidates `design.md`, say so and recommend `/design` before rebuilding. If the feature is already live, its INDEX status goes back to **Building** once someone acts on the new ACs.

**C — Fundamental challenge** ("is this feature even right?"). Question it from first principles: is the framing right, should it split or merge, what's the minimal version? A split produces a new folder + INDEX row; what's cut moves to Out of Scope or `docs/ideas.md`.

## While writing
- ACs are Given/When/Then in the project's spec language (`AGENTS.md` → Spec Language; if unset, ask once and record it).
- **Never guess silently** — unresolved ambiguity becomes an inline `[NEEDS CLARIFICATION: exact question]` marker. `/design` and `/build` treat markers as a stop sign for the affected part.
- Ideas that surface but don't belong in this feature → one line each in `docs/ideas.md`, keep moving.
- Present the draft before saving. Offer once: "Want a quick **pre-mortem** — assume it shipped and failed, work backwards to what we missed?" Apply feedback, save, verify.

## Checklist
- [ ] Sized right: lite by default; full (and flagged for `/design` + `/review`) if money/credentials/personal data
- [ ] Every AC in Given/When/Then with a stable ID; ambiguity marked `[NEEDS CLARIFICATION]`, not guessed
- [ ] Updates were deltas; no existing IDs renumbered; decisions logged
- [ ] INDEX row current (new: **Spec'd**); stray ideas parked in `docs/ideas.md`
- [ ] User approved the spec

## Handoff
Suggest, never enforce: for risk work or real integrations → "`/design` next." Otherwise → "`/build` whenever you're ready — or `/design` first if you want the technical decisions on paper."

## Git Commit
```
feat(PROJ-X): spec [feature name]
```
