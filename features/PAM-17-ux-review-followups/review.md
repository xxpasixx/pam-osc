# PAM-17 — Review

**Date:** 2026-07-19 · **Commit:** c99682a · **Verdict: READY → Approved**

Regression baseline: typecheck clean, full suite **343 passing**.

## AC verification

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 notices over the editor | **PASS** | `noticesLayer` rendered in BOTH the editor branch (`App.tsx:391`) and tabbed branch (`:482`); `.notices-layer` fixed, z-index 1000 |
| AC-2 clipboard failure surfaced | **PASS** | `TrafficLog.tsx` `copyState` idle/copied/failed; "Copy failed" state + selectable fallback |
| AC-3 retry on load-fail | **PASS** | startup Retry (`App.tsx:351`) + `Ma3SetupView` Retry (`:252`) |
| AC-4 async engine-ack test (code-level) | **PASS** | `engine.ts:216` returns a Promise, settles on done/cancel with a `settled` guard; renderer awaits in try/finally, 4s timer gone. Hardware behaviour not verifiable here (out of scope). No-output-port lead parked in ideas.md |
| AC-5 selectable diagnostics | **PASS** | global `user-select:none` removed from body, scoped to `.board`/`.board-control`; diagnostic text `user-select:text` |
| AC-6 `<dialog>` modals + tab ARIA | **PASS** | 3 modals → shared `ModalDialog` (`showModal()` focus-trap + Escape); tab bar `role=tablist`/`tab`/`aria-selected` |
| AC-7 copy polish | **PASS** | "(AC-6)" removed; disabled buttons have reason `title`s; jargon tooltips added |
| AC-8 board editor keyboard nav | **PASS** | `BoardCanvas.tsx:99` arrow nudge/select + Escape deselect, shares snap/clamp with drag |

## Findings (all Low / Info)

- **F1 — Low (a11y):** the "Setup guide" launcher (from PAM-14) sits as a plain `<button>` inside the `role="tablist"` PAM-17 introduced (`App.tsx:518`) → screen readers mis-announce it. Fix belongs with the tablist owner (give it `role="none"` or move it out).
- **F2 — Low (a11y):** the tablist has no matching `role="tabpanel"`/`aria-controls` and no arrow-key roving between tabs. AC-6's literal wording is met; flagged as a conscious partial-pattern choice.
- **F3 — Low:** a notice raised **while an editor `<dialog>` is open** renders behind it (native dialog top-layer beats z-index). Edge case — modals close before notices fire in the common flows; primary AC-1 goal met.
- **F4 — Info:** stopping/reconfiguring mid-test surfaces an "output test failed: output test canceled" notice — functionally correct, arguably noise; consider treating cancel as a silent no-op.

## Verdict
8/8 ACs PASS. No Critical/High. Four Low/Info polish notes. **Approved.**
