# PAM-14 — Review

**Date:** 2026-07-19 · **Commit:** 63cb88b (build), fix follows · **Verdict: READY → Approved** (after re-review — see bottom)

Regression baseline: typecheck clean, full suite **343 passing**. No Critical/High.

## AC / EC verification

| ID | Verdict | Evidence |
| --- | --- | --- |
| AC-1 auto-open on first run | **PASS** | decided only from the initial snapshot (`App.tsx:95` in `loadSnapshot`); post-save adopt never reopens |
| AC-2 skip everywhere + reopen, flag persists, reopen no reset | **PASS** | Skip in header + footer; Setup-guide reopen; `setOnboardingCompleted` persists even on a pristine first run |
| **AC-3 controller step → active mapping** | **PARTIAL (Medium, BUG-1)** | bundled-board pick → active mapping ✓; **v1-import path does NOT** add to `draft.activeMappings` (see BUG-1) |
| AC-4 connect + PAM-4 check, fail doesn't block | **PASS** | reuses ConsoleSection; Next gated only on validity, not on a green connection (EC-1) |
| AC-5 install card + USB fallback | **PASS** | `Ma3SetupView mode="install"` |
| AC-6 OSC step live ports/IP | **PASS** | `Ma3SetupView mode="osc"` with live console values |
| AC-7 verify + success | **PASS** | "You're live — move a fader" on connected+running |
| AC-8 finish auto-starts + marks complete | **PASS** | guarded auto-start effect; Finish persists the flag |
| EC-1 finish without green connection | **PASS** | fallback copy + diagnostics link |
| EC-2 no bundled board → way forward | **PASS** | "Continue without one for now" + import path |

Red-team confirmed clean: pristine-skip persists; no auto-open loop; mid-wizard Save preserves `onboarding`; components genuinely reused (no forks); auto-start guarded against double/no-mapping start (main also rejects). Additive `onboarding` is backward compatible.

## Bugs (most severe first)

- **BUG-1 — Medium — v1-import in the wizard yields no active mapping (AC-3 gap).** `runImportV1` (`App.tsx:248`) only refreshes the catalog; the import result offers just "Done" and nothing adds the imported mapping to `draft.activeMappings`. Repro: wizard → step 2 → "Import a v1 mapping…" → Done → `activeMappingCount` still 0, Next stays disabled. Workaround exists (open "Choose a controller…" and pick the imported entry), but it contradicts AC-3 and the step's own messaging.
- **BUG-2 — Medium — no renderer test coverage.** Only persistence (schema/settings-store/apply-settings) is tested; the wizard's renderer logic (first-snapshot-only auto-open, activation, connect gate, success state, auto-start guards) has zero tests.
- **F3 — Low:** the "Open diagnostics" detour link calls `closeWizardCompleted` → silently marks onboarding done even though setup wasn't finished.
- **F4 — Low:** `closeWizardCompleted` sets `wizardOpen=false` on every path; if the flag write fails, the wizard reappears next launch (AC-2 promise breaks on the error path).
- **F5 — Low:** creating a new mapping from the controller step opens the editor over the wizard; on close the wizard remounts and resets to step 1 (progress lost).
- **F6 — Low:** theoretical sub-100ms double-start race between the auto-start effect and the visible "Start bridge" button (main guards it → at worst a spurious error notice).
- **F7 — Info:** `mode="osc"` renders `OscEntryCard` **and** `ImportPluginCard`; design step 5 named only OscEntryCard. Broader, not wrong.

## Verdict (initial)
No Critical/High, but **AC-3 is only partially met** (v1-import path) and the renderer ACs have no test guard. **NOT READY** — fix BUG-1 (activate the imported mapping) and add renderer tests (BUG-2), then re-review. The Low items are optional polish.

## Re-review — 2026-07-19 (after fix)

- **BUG-1 resolved.** `runImportV1` now activates the imported mapping via the shared `activateCatalogEntry` helper using `ImportV1Result.entry` (a `CatalogEntry` with id + ports) — `App.tsx:261`. The same helper now backs all three activation sites (bundled pick, duplicate, v1 import), so **AC-3 is met on the import path**: a completed v1 import sets `activeMappingCount ≥ 1`, the controller step shows a ready controller, Next enables. Idempotent (dedups by id) so it's harmless from the normal tabbed import.
- **BUG-2 resolved.** No renderer harness exists, so the decision logic was extracted to a pure module `wizard-logic.ts` (`shouldAutoOpenWizard`, `activateCatalogEntry`, `shouldAutoStartEngine`) — the components call these exact functions — with 12 unit tests (`wizard-logic.test.ts`) covering first-snapshot-only auto-open (AC-1), the import-activation (AC-3), and the auto-start guard (AC-8).
- Regression: typecheck clean, full suite **355 passing** (343 + 12).

The Low items F3–F7 remain optional polish (not blockers). **Verdict: Approved.**
