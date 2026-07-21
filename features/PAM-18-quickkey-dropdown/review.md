# PAM-18 — Review (UI part)

**Date:** 2026-07-19 · **Commit:** 179dd5c · **Verdict: UI part clean; feature stays Building** (AC-5 uninstall deferred to onPC)

Regression baseline: typecheck clean, full suite **343 passing**.

## AC verification

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 grouped dropdown replaces free-text | **PASS** | `MappingInspector.tsx:209` `<select>` with optgroups from `QUICKKEY_GROUP_ORDER`, readable labels |
| AC-2 one canonical list + parity test | **PASS** | `core/format/quickkeys.ts` (107 codes); `quickkeys.test.ts:43` asserts sorted set-equality with `pam-OSC.lua createQuickeysIfNotExists` — real, fails on divergence |
| AC-3 unknown/legacy key flagged + removable | **PASS** | `MappingInspector.tsx:216` renders `unknown: <value>` at top when `!isKnownQuickKey`; replaceable via dropdown |
| AC-4 executors untouched | **PASS** | no engine/input-router changes in the diff |
| AC-5 full uninstall | **DEFERRED (onPC)** | correctly not implemented; no pam-OSC.lua/plugin/XML touched. Not a failure |

## Security note (cross-cutting, not a PAM-18 regression)

The QuickKey `key` flows into `Quickey "pam-osc_${key}"` (`input-router.ts:171`) **without quote-escaping**. An imported/hand-edited mapping (AC-3 lets unknown keys through) can carry an arbitrary `key`; repro string `A" ; Store Show ; Quickey "pam-osc_A` breaks out of the quoted argument at the app layer. **Pre-existing (introduced by PAM-2, not PAM-18)** and **Low**: the `command` action already sends fully arbitrary console commands by design (with PAM-7's caution), so this grants no new capability under the local-user trust model. PAM-18's dropdown actually *reduces* exposure for new picks. Track separately (see cross-cutting note in the review summary) if community-sharing hardening is ever prioritised.

## Findings
- **F1 — Low:** no renderer test for the dropdown / unknown-key path (only the parity test was added).

## Verdict
AC-1–AC-4 PASS, AC-5 correctly deferred. No Critical/High from this build. The feature is **not fully complete** (AC-5 pending onPC), so it stays **Building**; the built UI portion is review-clean.

## Update 2026-07-19 — QuickKey injection closed (app-side)

The QuickKey code is now sanitised to `[A-Za-z0-9_]` before the `/cmd` embed (`input-router.ts` `safeQuickKeyCode`), closing the hand-edited/imported breakout noted above. Spec delta AC-6. Tests: `quickkey-escape.test.ts`. Still Building (AC-5 uninstall onPC-pending).
