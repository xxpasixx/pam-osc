---
name: ship
description: Take approved features live — pre-flight checks, go-live merge, live verification incl. a security smoke test, and the operations handoff. Pass a feature (e.g. PROJ-2) or run bare to launch all approved features as one release.
argument-hint: "optional: PROJ-X — omit to launch all approved features"
user-invocable: true
disable-model-invocation: true
---

# Ship

## Goal

Get features live safely and deliberately. A broken release hurts users more than a delayed one — and going live is the one moment that always needs the user's explicit go-ahead.

## Resolve the scope — never silently mass-ship

- **`/ship PROJ-X`** → the launch set is that one feature.
- **`/ship` bare** → find every **Approved** feature in `features/INDEX.md` that isn't **Live**, then AskUserQuestion: 0 ready → say what's still open, stop. 1 ready → confirm it. 2+ → "launch all N as one release, or pick one?"
- A named feature that isn't Approved (or has open Critical/High bugs in `review.md`) → stop and list it. Reviewed-before-live is not negotiable: unreviewed work never ships. Let the user choose: review it first, or ship only the approved subset.

Everything below applies to the whole launch set: one state promotion, every branch merged, **one** release tag.

## Before Starting

Read `AGENTS.md` → Environments & Release. **First release or still TBD?** Work the release process out with the user now — where production lives, how a change is promoted, where production secrets are set, and the rollback path — and **record it there**. That conversation is the one-time hosting setup.

## Pre-flight

- [ ] Build and lint pass (`AGENTS.md` → Build & Test Commands)
- [ ] Every feature in the set is Approved in `review.md`, no Critical/High bugs
- [ ] Env variables documented in the `.env.example` variant; no secrets committed
- [ ] Persistent-state changes exist as versioned files, applied to test
- [ ] README answers the Tier-0 questions (`docs/readme-template.md`) — update its Status line (live since, URL) as part of this release
- [ ] Everything committed and pushed

## Promote persistent state (once for the set)

If the launch set changed schema, stored config, or other persistent state: **preview the change in plain language first** — what changes on live, anything destructive or surprising — get explicit confirmation, promote the versioned files per the environment strategy, then verify production carries the expected state. Nothing persistent in the set → skip.

## Go live

Merging into `main` is the go-live moment — and `main` is protected: every branch in the set merges via a **PR/MR**, never a direct push. Explain it and get an explicit go-ahead — this is the irreversible step. Then open (or reuse) the PR/MR per branch, merge them, and follow the release through to actually-live per the recorded process. Merge conflicts → never force; stop and resolve with the user.

## Verify live — including the security smoke

Production loads and behaves; every launched feature works live; no errors in the logs/monitoring the project has. Then the **read-only security smoke** (skip checks the project type has no surface for, never write, never load-test):

- HTTPS enforced, HSTS present; standard security headers on the live response (web apps)
- Protected routes/endpoints reject an anonymous request — 401/403/redirect, never data
- No **server** secrets in client artifacts or responses (public/anon keys are fine)
- With only anonymous-client credentials, attempt to **read** data that should be private → must come back denied/empty; other users' data = **CRITICAL**, fix via `/build` before announcing the release
- No credentials/PII in any URL

**First release extras:** error tracking wired (errors land somewhere someone looks) and a performance sanity check against the project's expectations.

## Bookkeeping & the operations handoff

- `features/INDEX.md`: every launched feature → **Live**, with URL, date, and tag
- One release tag for the set (`v1.X.0-PROJ-X` or `v1.0.0` for a multi-feature launch), pushed
- **Operations handoff, first release only:** ask two questions and record them in INDEX → Operations — who owns this in operations, and the review cadence (default ~30 min every 3–6 months, key stakeholder + maintainer; the owner makes sure it happens). Later releases: confirm the owner line, update `Last release:`. A name, a cadence, a date — not a process document.
- **Temporary product** (event site, campaign — it has an end date)? Record a **sunset** instead of a review cadence: who takes it down, when, and what happens to collected data (personal data especially: delete, or export-then-delete). At sunset the INDEX status goes to **Retired**.

## Rollback

Fastest fix is re-releasing the last good version — know how _before_ you need it (it's part of the Environments & Release record): re-promote the previous build, revert the merge commit, or restore the previous package. Then fix forward on a branch.

## Checklist

- [ ] Scope confirmed with the user; only Approved features in the set
- [ ] Pre-flight green; persistent state promoted once, previewed and confirmed
- [ ] Explicit go-ahead → merged, pushed once, release followed through to live
- [ ] Live verification + security smoke passed (or findings routed through `/build`)
- [ ] INDEX → Live with URL/date/tag; one release tag pushed; ops owner recorded (first release) or confirmed
- [ ] User has seen it live

## Git Commit

```
ship(PROJ-X): [feature name] live   ·   or:   ship: v1.0.0 — PROJ-A, PROJ-B live
```
