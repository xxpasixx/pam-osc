# Review — PAM-4

**Reviewed:** 2026-07-17
**Where tested:** local — Vitest suite (fake transports, real UDP sockets for port diagnosis), full code review of commit 497f4a4; UI verified by code reading (manual onPC/hardware run still recommended before `/ship` per AGENTS.md release convention)
**Reviewer:** Review (AI) — security and regression lanes run as independent reviewer subagents

### Acceptance Criteria

- [x] **AC-1** Status view (connection state, v1.4 hints, retry attempt, device list) — pass. `StatusView` renders headline + LED per state, `UNREACHABLE_HINTS`/`PLUGIN_HINTS` carry the v1.4 texts, attempt counter shown, device list with bound/missing.
- [x] **AC-2** Port diagnosis — pass, with one gap (BUG-2). `diagnoseUdpPort` ported from v1 `portUtils.js`, real-socket tests prove `self` and `free` on macOS; Windows path is a faithful netstat/tasklist port (not run on Windows in this review). Triggers: first `unreachable` per engine run, auto-start failure, manual-start failure. Gap: failed **Save & apply** does not trigger it (BUG-2).
- [x] **AC-3** Manual re-check — pass. `ConnectionChecker.checkNow()` resets the retry budget and revives a gave-up checker; engine test drives gaveUp → re-check → connected.
- [x] **AC-4** Output test on demand — pass. Engine test verifies animation frames flow and the cached live fader value is restored afterwards; rejection paths (unknown mapping, missing device, stopped engine) tested.
- [x] **AC-5** Traffic log — pass. Engine test asserts all four directions with exact texts and per-unit source; system category fed from engine log lines + issues; filters/copy verified by code; `TrafficBuffer` unit-tested (batching, cap, stop).
- [x] **AC-6** Engine start/stop — pass. `EngineHost.stop()` keeps lastGood so Start resumes with saved settings; start guarded against double-start; auto-start unchanged (PAM-3 AC-4 regression-checked).

### Edge Cases

- [x] **EC-1** Output test during live operation — pass. Animation frames bypass the feedback cache (`sendDirect`); `restoreUnit` replays only real state. Regression lane confirmed this also _fixes_ a latent bug (rebind after test would have snapped faders to 0 under the old caching).
- [x] **EC-2** Message flood — pass. Main: ring 500 + ≥100 ms batching (unit-tested); renderer: cap 1000; ~10 IPC messages/s worst case.
- [ ] **EC-3** Engine stopped state — **partial: BUG-1.** Connection card and actions correct, but stale device rows keep rendering after a manual Stop.
- [x] **EC-4** Start with invalid config / taken port — pass. Error surfaces as notice, engine state stays stopped, no crash (engine-host tests).

### Code Review

- Tap architecture is sound: exactly one OSC tap (`sendOsc` + `onOsc`) and one MIDI tap (decorated transport) — no missable path; wrapper preserves open/close/throw semantics (regression lane verified against `DeviceManager.tryBind`).
- No double-wrapping across `reconfigure()`; `listPorts` stays raw.
- **Low (cosmetic):** out-direction traffic events are emitted _before_ the send, so a throwing send still logs an outgoing line (BUG-5).
- No leftover mocks, no dead code, no over-engineering found. Matches the design notes in `design.md`.

### Security (red team, independent subagent)

- [x] Command injection: clean — `receivePort` always passes zod (`1–65535` int; corrupt settings.json falls back to defaults), PIDs are `parseInt`+`isNaN`-guarded; only `exec` sink in the app.
- [x] IPC: sender check on every handle; `startEngine` double-call race safe (synchronous state flip before first await); `runOutputTest` coerced + per-mapping guarded.
- [x] XSS: no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere; hostile OSC/lsof/MIDI strings render as React-escaped text.
- [x] Data exposure: no credentials/PII exist in the app; nothing sensitive in any URL/address; clipboard copies only the visible log on explicit click.
- [x] Flood: traffic path bounded in main and renderer.
- [ ] **Low:** no throttle on `checkConnection`/`startEngine`/`stopEngine` — a compromised renderer could spam OSC pings at the console (BUG-3).
- [ ] **Low:** `applySettings` persists without a `persistedSettingsSchema` re-parse — renderer-attached extra keys are written, then silently reset to defaults next launch (BUG-4).
- Noted, pre-existing, out of scope: unauthenticated OSC input is inherent to the v1 design (PAM-2), not introduced here.

### Regression (independent subagent)

- `npm test` 14 files / 134 pass + typecheck clean (with review's added `traffic-buffer.test.ts`: 15 / 137).
- Startup-animation cache bypass: no v1-parity break (force-reload repopulates the cache; feedback-less controls observationally identical); hot-plug restore test still asserts exact cache replay.
- PAM-3 apply/save transaction byte-identical, rollback intact; e2e suite unchanged and green through the new tapped paths (byte-for-byte v1 wire parity).

### E2E (critical journeys)

- Status: **covered by the existing engine E2E suite** (real UDP + virtual MIDI) for the engine-side journeys (AC-3/4/5). UI journeys (tab, buttons) have no E2E harness yet — a Playwright/WebdriverIO setup for Electron is deliberately not introduced in this review; consider before v2.0 ship.

### Bugs

**BUG-1: Stale device rows after manual engine stop**

- **Severity:** Medium (EC-3)
- **Steps to reproduce:** 1. Engine running with a bound device, open Status tab. 2. Click "Stop engine".
- **Expected:** Device list shows the stopped empty-state only. **Actual:** "Engine stopped — no devices are bound." renders _and_ the old device rows stay below it with a green "bound" LED — the engine emits no empty devices event on stop and the renderer keeps the last list (`EngineHost.resetLiveStatus` resets only the snapshot copy).

**BUG-2: Failed Save & apply does not trigger the port diagnosis**

- **Severity:** Medium (AC-2 gap)
- **Steps to reproduce:** 1. Another app holds UDP port X. 2. In Setup, set receive port to X, Save & apply.
- **Expected:** Error notice _and_ port diagnosis naming the blocking process. **Actual:** Only the engine error notice; `runPortDiagnosis` is wired to launch/manual-start/unreachable but not to the apply path (`app/src/main/index.ts` — applySettings outcome is not observed). Workaround: press "Start engine" afterwards — that path diagnoses.

**BUG-3: No rate limit on engine-control IPC**

- **Severity:** Low (defense-in-depth; self-inflicted target)
- A compromised renderer can loop `checkConnection()` → unbounded OSC `/cmd` pings at the console. Throttle (e.g. ≥1 s) in the main-process handlers.

**BUG-4: Settings persisted without schema re-parse**

- **Severity:** Low (defense-in-depth)
- `applySettings` writes `draft.console` fields after `validateDraft` only; extra keys from a hostile renderer are persisted, then `strictObject` resets the user to defaults on next launch. Re-parse through `persistedSettingsSchema` before `save()`.

**BUG-5: Out-traffic logged before the send happens**

- **Severity:** Low (cosmetic)
- `midi-out`/`osc-out` events are emitted before `connection.send`/`socket.send`; a throwing send still produces an outgoing log line. Move the emit after a successful send, or accept as "attempted send".

### Verdict

- **ACs:** 6/6 passed (AC-2 with a Medium gap) · **ECs:** 3/4 full, EC-3 partial · **Bugs:** 5 (0 Critical / 0 High / 2 Medium / 3 Low) · **Security:** pass (2 Low hardening items)
- **Ship: YES — READY.** No Critical/High. The two Mediums are diagnostics-UX gaps with workarounds, not broken core paths; recommend fixing BUG-1/BUG-2 via `/build` before `/ship`, and a manual onPC + real-hardware pass per the release convention.
