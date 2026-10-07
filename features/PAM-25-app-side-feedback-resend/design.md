# PAM-25 — Design notes (build-from-spec decisions log)

**Date:** 2026-07-23

> Built straight from the spec ACs; this file records the non-obvious choices,
> not a full design.

## Decisions

| Decision                                                                                                                                                                                                           | Rationale                                                                                                           | Date       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| Resend lives in the **Engine** as one `setInterval` (`feedbackResendMs`, default 2000 ms in `DEFAULT_TIMING`) that walks `deviceManager.bound()` and replays the cache for units whose device has `resendFeedback` | One timer instead of per-unit timers; hot-plug/rebind need no extra wiring — the bound() snapshot is always current | 2026-07-23 |
| Extracted `replayCache(unitRuntime)` from `restoreUnit` (feedback-out) and reused it                                                                                                                               | The periodic resend is exactly the rebind replay's first half — one loop, two callers, no state invention           | 2026-07-23 |
| Timer skips while the startup animation runs (`animationDone` guard)                                                                                                                                               | Animation frames bypass the cache on purpose; replaying mid-animation would fight the wave                          | 2026-07-23 |
| `buildPamConfig` pins `resendButtons: false` (payload keeps `r=0`)                                                                                                                                                 | Wire compat with the plugin's fixed-field-order v1 parser; console resend never activates (AC-3)                    | 2026-07-23 |
| Mapping schema keeps `resendButtons` (deprecated comment), editor UI drops the toggle                                                                                                                              | Older/shared mapping files must keep loading (AC-4); strict schema would reject them                                | 2026-07-23 |
| UI checkbox sits in the board inspector's **Advanced** section ("Re-send feedback periodically")                                                                                                                   | It is a rarely-needed board fact, same altitude as protocol mode / default channel                                  | 2026-07-23 |
| Bundled boards ship with the flag **off** (schema default)                                                                                                                                                         | The workaround is opt-in for boards that demonstrably lose LED state — no proactive traffic                         | 2026-07-23 |

## Implementation Notes (post-build, 2026-07-23)

- **Schema:** `resendFeedback: boolean` (default false) on the device definition
  (`device-definition.ts`); `resendButtons` in `mapping.ts` marked deprecated.
- **Engine:** timer in `Engine.start`, cleared in `shutdown`; `replayCache`
  exported from `feedback-out.ts`; new `feedbackResendMs` in `EngineTiming`
  (2000 ms default, 30 ms in `TEST_TIMING`).
- **Handshake:** `config-handshake.ts` no longer reads `mapping.resendButtons`.
- **UI:** checkbox in `BoardInspector.tsx` (Advanced); toggle removed from
  `MappingFeedbackOptions` in `EditorView.tsx`.
- **Tests:** schema defaults + legacy acceptance (`schemas.test.ts`), pinned
  `r=0` even with a legacy `resendButtons: true` mapping
  (`config-handshake.test.ts`), periodic replay fires for flagged devices and
  stays silent for others (`engine.test.ts`, new `resendVariant` fixture).
- **Verification:** typecheck ✅ · build ✅ · 458 tests ✅ — the only failure is
  the pre-existing, unrelated `apc-mini-default-1` status test (commit fe65982).
- **Not in this slice** (per spec Out of Scope): plugin-side removal of the
  dormant `automaticResendButtons` tick — separate plugin release + version bump.
