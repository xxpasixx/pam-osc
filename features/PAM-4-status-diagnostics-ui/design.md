# PAM-4: Status & Diagnostics UI — Design Notes

> Written during `/build` (no upfront design) — a decisions log, not a ceremony.
> The spec is the contract; this records the non-obvious HOW choices.

## Decisions

| Decision | Rationale |
|----------|-----------|
| Traffic taps live in the engine, not the UI: one OSC tap (`sendOsc` wrapper + `onOsc`) and one MIDI tap (a decorating `MidiTransport` around the real transport) | Every message crosses exactly one of these two boundaries — no per-call-site instrumentation, impossible to miss a path. The engine emits a new `traffic` event (`midi-in/midi-out/osc-in/osc-out`, formatted text, port as source). |
| Traffic text is formatted in the core (`core/engine/traffic.ts`) | UI and tests see identical strings; renderer stays a dumb list. |
| Batched delivery: `TrafficBuffer` in main (ring 500, flush ≤ every 100 ms as one IPC array); renderer caps at 1000 entries | EC-2 — a fader move produces dozens of messages/s; per-entry IPC would flood the renderer. Snapshot carries the retained tail so the log survives a remount. |
| Engine "log" lines and issues become `system`-category entries in the same log | AC-5 — replaces the v1 terminal completely; one chronology, one filter set. |
| The test/startup animation now sends **directly** (bypassing the feedback cache) | The cache is what `restoreUnit` replays after the test (EC-1); caching transient animation frames would corrupt the restored state. Also applies at startup — strictly better than before. |
| `outputTest(mappingId)` reuses `playStartupAnimation` on a single unit, then `restoreUnit` | One animation code path (v1 parity); restore = cache replay + always-on/attribute/timecode re-init, same as a hot-plug rebind. |
| `ConnectionChecker.checkNow()` resets the attempt counter and revives a stopped checker | AC-3 — a manual re-check restarts the full retry budget instead of instantly re-giving-up. |
| Port diagnosis (`main/port-diagnosis.ts`, v1 `portUtils.js` port) runs in the main process, triggered on first `unreachable` per engine run and on engine start failure | Needs `child_process` (lsof/netstat) — not core's business. One diagnosis per run; a manual re-check clears it so a persisting failure re-diagnoses. |
| Start button reuses `EngineHost.autoStart` with the last **saved** settings | Same semantics as launch auto-start; unsaved drafts never leak into a manual start (consistent with PAM-3 "unapplied edits never take effect"). |
| Tabs (Setup / Status) instead of one long page; Save/Discard footer only on Setup | The status view is read-and-act, the setup view is edit-and-apply — mixing the two footers would blur the PAM-3 transaction model. |

## Deviations from spec
None.

## Test coverage added
- `engine.test.ts` → "diagnostics (PAM-4)": all four traffic directions with exact texts (AC-5), on-demand output test incl. state restore (AC-4/EC-1) and rejection paths, manual re-check after gaveUp → connected (AC-3), stopped-engine no-ops (EC-3).
- `port-diagnosis.test.ts`: real lsof/netstat against real UDP sockets — `self` and `free` (AC-2).
- Existing suites extended for the new `EngineLike`/`EngineHostEvents` surface.
