---
name: hotfix
description: Emergency lane — production is broken NOW. Ships the smallest possible fix via an expedited PR/MR with a regression test and a rich log trail, then backfills the spec delta and /review. Use only for a live incident; everything else goes through the normal chain.
argument-hint: "what's broken (symptom, where, since when)"
user-invocable: true
disable-model-invocation: true
---

# Hotfix

## The deal
Production is broken and users are affected — speed wins, but three things are non-negotiable even now: the diff stays **minimal**, the fix carries a **regression test**, and everything is **logged** so the backfill can reconstruct what happened. `main` stays protected: the fix goes through an expedited PR/MR, never a force push (rewriting `main`'s history is how one incident becomes two).

## 1. Confirm it's an emergency (30 seconds, not a gate)
Live incident = users affected right now: down, data-corrupting, security hole, core flow dead. Annoying-but-workaround-exists → normal chain (`/build` + `/review`), not hotfix. Say which it is and move.

## 2. Diagnose before touching anything
Read the error/logs, find the breaking commit (`git log`, the diff of the last release), state the **root cause in one sentence**. No root cause → say what you know and what you'd try; never ship a guess silently.

## 3. Fix — minimal means minimal
- The user creates `hotfix/<slug>` from `main` (skills never create branches).
- Change **only** what the root cause requires. No refactoring, no cleanup, no drive-by improvements — every extra line is untested surface shipping without review.
- If the true fix is large or touches a guarded zone (money, credentials/auth, personal data): prefer the smallest safe mitigation now — **revert the breaking commit / re-release the last good version** — and route the real fix through the normal chain.

## 4. Test — the bug gets a name
Write a regression test that **reproduces the bug** (fails on the broken code, passes with the fix), named after the incident. Run the full test suite (`AGENTS.md → Build & Test Commands`) — the hotfix must not break anything else. No test infrastructure for this surface → verify manually against the reproduction steps and write exactly what you did into the PR/MR description.

## 5. Ship — expedited, not unguarded
Open the PR/MR with the incident story (see the log format below). Get the user's **explicit go-ahead** — going live is always their call, even at 2 a.m. — then merge, follow the release to actually-live, and **verify the fix on production** against the original symptom.

## 6. Log — the commit body is the incident record
```
fix(PROJ-X): hotfix — <symptom in five words>

Symptom:    what users saw, since when
Root cause: the one-sentence diagnosis
Fix:        what changed and why it's minimal
Verified:   regression test + what was checked on production
```
Also: one line in `features/INDEX.md → Operations` (`Last hotfix: <date> — <summary>`), and the affected feature's status stays honest.

## 7. Backfill — the hotfix isn't done until this is
Right after (same day, not "sometime"): spec delta on the affected feature (the bug was a false AC or a missing EC — record it), then `/review` of the shipped diff. Rule 4's emergency exception (`.claude/rules/general.md`) exists only because this step closes it.

## Checklist
- [ ] Real live incident confirmed; root cause stated in one sentence
- [ ] Diff minimal (or: reverted to last good); guarded zones untouched or explicitly approved
- [ ] Regression test written and red→green; full suite passes
- [ ] Explicit go-ahead → PR/MR merged, fix verified on production
- [ ] Incident logged (commit body + INDEX line); spec delta + `/review` backfilled
