---
name: review
description: Review a built feature — verify every AC-ID, review the code, red-team the security, run regression — and write review.md with a ship/no-ship verdict. Optionally locks critical journeys in as E2E tests. Use after /build, before /ship.
argument-hint: "PROJ-X — optionally 'as:<name>' for a team-perspective lens pass (docs/team/)"
user-invocable: true
---

# Review

## Goal
Verify the built feature against its contract and make the ship call. Three stances in one pass: a **reviewer** who checks every AC-ID and reads the code, a **red-team attacker** who assumes the build-time gates have gaps, and a **regression tester** who makes sure nothing that already shipped broke. Stay adversarial — a bug you don't catch here ships to users.

You find, document, and prioritize. You NEVER fix — fixes go back through `/build`.

## Before Starting
1. Read `features/PROJ-X-<slug>/spec.md` (all AC/EC-IDs) and `design.md` if it exists
2. Read `features/INDEX.md`; set the feature's status to **In Review**
3. `git log --oneline -10` and the feature's diff — know what you're reviewing

**Quick drift scan (30 seconds):** does INDEX match reality for this feature — folder exists, spec has ACs, status is honest? Fix the status line if it's stale; flag anything bigger.

## The pass

### 1. Verify every AC
Test each AC-ID and EC-ID pass/fail on the surfaces this project targets (`AGENTS.md` → Tech Stack): browsers/viewports for a web app, API consumers for a service, the target org for platform work. Probe undocumented edge cases you spot. Run the project's test suites (`AGENTS.md` → Build & Test Commands) — failures are regressions, automatically High.

### 2. Review the code
Read the diff like a senior reviewer: correctness against the ACs, matches `design.md` where one exists, input validation on every write path, no leftover mocks or dead code, simplicity (flag over-engineering — it's a finding too), no secrets in source.

### 3. Red-team the security
Independent of `/build`'s gates — assume they have gaps: auth bypass attempts; authorization across users (can X read Y's data?); injection via user inputs; exposed secrets in client artifacts and responses; sensitive data where it doesn't belong; **credentials/PII in any URL or query string → High, always**; rate limiting on auth endpoints.

### 4. Regression
Exercise the core flows of features already **Live** in `features/INDEX.md` that share code or data with this one.

**Fan out where it pays:** spawn the security and regression lanes as parallel subagents using the **reviewer** agent (`.claude/agents/reviewer.md`) — each reports raw findings back; you remain the one owner who merges, keys findings to AC-IDs, and renders the verdict. Tiny feature (1–2 ACs, no live neighbors) → just run inline.

**Perspective lens (optional):** `/review PROJ-X as:<name>` → read `docs/team/<name>.md` and run **one extra pass through that person's eyes** — what they always check, their pet peeves, the questions they'd ask. Their perspective only, nothing added on top. Every finding is labeled **[<Name>-Lens]** in `review.md` and in the presented summary, always marked as *simulated from their written profile — not the real person's opinion*. No profile file → say so and skip the pass. The lens is an extra pair of eyes, never a substitute for the human review the hard gate requires.

### 5. Unit tests for isolated logic
Add unit tests for non-trivial isolated logic per the project's test conventions — happy path plus failure paths, mock only external dependencies. Skip pure presentation and anything E2E already covers.

### 6. Critical journeys (optional but recommended for flows that must never break)
For the feature's 1–3 truly critical journeys — sign-in, checkout, the primary path — offer to lock them in as **E2E tests**: few by design (the testing pyramid), only for ACs that passed, journey named after what the user does, AC-IDs in the title. First time in a project: recommend an E2E tool for the stack, set it up minimally, and **record the command in `AGENTS.md` → Build & Test Commands**; warn before big one-time downloads. A failing E2E against a previously-passing flow is a regression → High.

## Document and decide
Write `features/PROJ-X-<slug>/review.md` (standalone file, shape in [template.md](template.md)): pass/fail per AC-ID, code-review findings, security results, bugs with severity + steps to reproduce.

Severity: **Critical** (security hole, data loss, feature dead) · **High** (core broken, credential leaks) · **Medium** (workaround exists) · **Low** (cosmetic).

**Verdict:** READY (no Critical/High) → INDEX status **Approved**. NOT READY → stays **In Review**; list the bugs most-severe first: "Run `/build` to fix, then `/review` again."

Present the summary: X/Y ACs passed, bugs by severity, security findings, verdict — then ask which bugs to fix first.

## Checklist
- [ ] Every AC/EC-ID verified pass/fail on the project's target surfaces; suites run
- [ ] Code reviewed (correctness, design-match, validation, simplicity); security red-teamed; regression on live neighbors
- [ ] Unit tests added for isolated logic; critical journeys offered as E2E
- [ ] `review.md` written, keyed by AC-ID; every bug has severity + repro steps
- [ ] Verdict rendered; INDEX status updated (Approved / In Review); user prioritized the bugs

## Handoff
READY → "All ACs pass, no Critical/High. **Approved.** Run `/ship` to go live." NOT READY → the bug list, most severe first.

## Git Commit
```
test(PROJ-X): review [feature name]
```
