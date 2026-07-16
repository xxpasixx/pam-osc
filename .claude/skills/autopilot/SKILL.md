---
name: autopilot
description: Quality autopilot — for when the user has time and tokens and wants the best result. Asks EVERYTHING upfront (or takes a legacy product as the goal), then runs the full chain (spec → design → build → review → fix → review) end to end without stopping, until done or genuinely blocked. Use when the user says things like "high quality, take your time, run the whole thing".
argument-hint: "the goal — a feature idea, a spec, or 'match the legacy product at <path/url>'"
user-invocable: true
disable-model-invocation: true
---

# Autopilot — Quality Loop

## The deal
The user trades interaction for quality: **all questions get asked at the start, then you run the whole chain without stopping.** No mid-flight approval checkpoints, no "shall I continue?" — the invocation of this skill IS the approval for everything up to (but never including) go-live. In return you spend the tokens quality costs: full specs, real designs, parallel review lanes, and as many build→review→fix loops as it takes.

**Only the user starts autopilot.** Never invoke it on your own (`disable-model-invocation` enforces this) — but when a request clearly fits ("this must be high quality, I have time"), *suggest and describe it* and let the user run it.

## Phase 1 — Understand (the ONLY phase that asks)
Interview per the Interview Discipline (`.claude/rules/general.md`) — relentlessly, because this is the last chance:
- **Fresh idea** → run the full `/spec` interview at full depth: users, jobs, must-haves, error/empty states, edge cases, dependencies, non-goals. Then a **pre-mortem** (assume it shipped and failed — what did we miss?) as standard, not optional.
- **Legacy product as the goal** ("rebuild this", "match what X does") → read it first: its code, docs, or live behavior. Derive the spec from observed reality, present it as THE contract, and ask only where the legacy behavior is ambiguous or worth changing on purpose.
- Sweep every `[NEEDS CLARIFICATION]` to zero — autopilot may not launch with open markers.
- Ask the scope-of-autonomy questions now: visual direction if there's UI, what "done" means, anything the risk gate needs pre-approved (see below).

Then compile: full `spec.md` (+ INDEX row), `design.md` (always — autopilot quality includes the design), and present BOTH in one review. **One explicit confirmation, then silence:**
> "From here I run the whole chain without stopping — build, review, fix, re-review — until everything passes or I'm truly blocked. I won't ship; going live stays your call. Ready?"

## Phase 2 — Autopilot (no questions)
Run the chain as a loop, each skill by its own rules minus the user checkpoints:

1. **Build** (`/build` discipline: levels, worktree fan-out, env discipline, done-gates). Non-load-bearing decisions: take the best option and **log it in the decision log** instead of asking. Load-bearing ambiguity that Phase 1 missed: check the spec/design/legacy source first; only a genuine blocker (missing access, credentials, contradictory contract) pauses the run — state exactly what's needed, then continue when unblocked.
2. **Review** (`/review` at full depth): always fan out the parallel lanes, verify every AC-ID, code review, red team, regression — and write E2E tests for the critical journeys (in autopilot they're standard, not offered).
3. **Fix loop:** Critical/High/Medium findings → back to build → re-review the affected ACs. Loop until zero Critical/High and all ACs pass. Low findings: fix cheap ones, log the rest.
4. **Polish pass:** one final sweep for simplification (dead code, over-engineering, unused flags) — quality includes what you remove.

Ideas that surface → `docs/ideas.md`, never scope creep. Keep INDEX status honest at every transition (Building → In Review → Approved).

## What autopilot never does
- **Never `/ship`.** Going live always needs the user's explicit go-ahead — that's the one checkpoint this skill cannot absorb.
- **Never bypass the hard gate silently.** Money, credentials/auth, or personal data: the full treatment is mandatory anyway, and the specific auth/payment/data decisions must have been approved in Phase 1 — if one surfaces mid-run that wasn't, that's a blocker, not a judgment call.
- Never weaken a done-gate or skip a failing check to "finish" — done means verified.

## Phase 3 — Report back
One structured report: what was built (per AC-ID), the review verdict, every decision taken autonomously (with rationale — the user audits these instead of having been asked), what landed in `ideas.md`, and the one remaining step: "`/ship` when you want it live."

## Checklist
- [ ] Phase 1: interview exhausted, pre-mortem done, zero `[NEEDS CLARIFICATION]`, spec + design approved, autonomy confirmed
- [ ] Loop ran without user input; blockers (if any) were genuine and stated precisely
- [ ] Zero Critical/High; all AC-IDs verified; E2E on critical journeys; polish pass done
- [ ] Every autonomous decision logged; INDEX current (**Approved**); final report delivered; ship left to the user
