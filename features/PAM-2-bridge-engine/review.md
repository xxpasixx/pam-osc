# Review — PAM-2

**Reviewed:** 2026-07-17
**Where tested:** local (macOS), Vitest suite (85/85: unit on fake transports, integration over real virtual MIDI ports + real UDP against the fake-MA3 emulator), CLI harness smoke run; real onPC/hardware verification deferred by decision (spec Decision Log)
**Reviewer:** Review (AI) — two independent reviewer agents (AC/code + parity lane, red-team/regression lane) + merging owner

### Acceptance Criteria
- [x] AC-1: CC + 14-bit pitchbend faders → executor faders, page-aware, full resolution — pass (v1 constants 127/16380 verified; unit + E2E incl. real bundled X-Touch content)
- [x] AC-2: relative encoders — accumulate/clamp, MA3-knob executors >300 get Encoder+Fader in v1 order, attribute steps with fine (×0.1)/rough (×10), "current" resolution — pass (see F1 note on `amount`)
- [x] AC-3: buttons — executor Key press+release, quickKey, command, modifiers with LED confirm + attribute-LED group, minValue threshold with exact v1 semantics — pass
- [x] AC-4: timecode — 7-segment mirror (v1 layout), slot cycle 0–8 / fixed select, tap Go+/Pause, hold ≥500 ms → Off with consumed release — pass
- [x] AC-5: fader feedback — motor CC 0–127, pitchbend 14-bit, encoder rings into their range, accumulator sync — pass
- [x] AC-6: LED feedback — Button "On"/"Off", masterEnabled case-insensitive, always-on fixed, MC off = note-on velocity 0 — pass (see F2 note)
- [x] AC-7: displays — nearest of 7 colors, one frame for all 8 strips, seq/cue 7-char lines, exact v1 sysex bytes — pass
- [x] AC-8: DeskLock blocks all MIDI input, console feedback keeps flowing — pass (unit + E2E)
- [x] AC-9: startup — animation → start state → forceReload → connection check; connected / plugin-missing / unreachable as events with retries — pass (attempt counting per design: 20 total, v1 did 21 — sanctioned, F3)
- [x] AC-10: hot-plug — disconnect survives, auto-rebind restores cache + fresh state, absent-at-start binds later without animation — pass
- [x] AC-11: headless facade — config-driven start/stop/reconfigure, typed events, two units of one board type, no stale listeners after reconfigure — pass
- [x] EC-1 unmapped MIDI ignored · EC-2 unreferenced feedback ignored · EC-3 malformed OSC → log + continue · EC-4 partial configs run the valid rest · EC-5 renamed port stays missing · EC-6 absent optional fields = feature off — all pass (EC-1/EC-6 implemented but without dedicated tests → BUG-8)

### Code Review
- Implementation matches design.md including both parity tables; all documented deviations verified as actually implemented. Timer/listener teardown complete (animation interval, ping timers, hotplug poll, hold timer, socket, MIDI connections) — 100 reconfigure cycles leak exactly nothing.
- No dead code, no debug leftovers, no `any`/`@ts-ignore`. Wire translation confined to the adapters as designed.
- Level 0 delta verified: `timecodeSelect.slot` optional (cycle) is backward-compatible; the 17+2 command-button feedback restorations are correct and match v1's masterEnabled behavior.

### Security (red team)
- [x] No secrets, no telemetry, no external hosts; only the intended UDP + MIDI sockets
- [x] Hostile OSC from LAN: malformed packets, type confusion, deep bundles, floods — all absorbed (single try/catch boundary, EC-3 holds); EADDRINUSE rejects cleanly; feedback cache bounded by control count
- [x] Lifecycle: 100 × reconfigure → no socket/timer/listener accumulation
- [ ] **BUG-1 (High)** and the M-cluster below — untrusted *device definition* files are the one gap

### Regression
- v1 untouched (`git diff main..v2` on `*.js`/`*.lua`/`mappings/`: empty); PAM-1 suite 44/44 green, bundled content validates; format delta backward-compatible. No Live features exist yet.

### E2E (critical journeys)
- Locked in as part of the suite (`e2e.test.ts`): fixture board full chain + **real bundled X-Touch content** with port re-bound via user shadowing — fader roundtrip, MC LED semantics, scribble frames, masterEnabled, desk lock. Runs in `npm test` (macOS/Linux; Windows needs loopMIDI, per AGENTS.md).

### Bugs

**BUG-1: Unbounded display `index` lets a shared device file freeze/OOM the engine mid-show**
- **Severity:** High
- **Steps to reproduce:** device definition with a display control `index: 5000000` (schema-valid: only `.min(0)`), mapping assigns a `display` action → first `/Color<n>` feedback spreads a sparse 5M-element array (~426 ms; 1e8+ → OOM/freeze) and emits a malformed oversized sysex frame. `device-definition.ts:89`, `feedback-router.ts:161`, `feedback-out.ts:112`.
- **Impact:** community-shared device files are a declared surface (PAM-6/7); a buggy/hostile file = console dark during a show. Bundled content is clean (indices 0–7).

**BUG-2: `/Timecode<slot>` feedback grows an unbounded slot map (LAN memory DoS)**
- **Severity:** Medium
- **Steps to reproduce:** with a timecode-enabled mapping active, flood `/Timecode0`…`/Timecode999999999` from any LAN host → one Map entry per distinct slot, no bound (50k confirmed). `timecode.ts:14`, `feedback-router.ts:87`.

**BUG-3: Color frame hardcodes 8 strips regardless of the device's displays**
- **Severity:** Medium
- **Detail:** non-8-strip boards get malformed frames (holes/oversize), cached and replayed on rebind. Same root as BUG-1. `device-manager.ts:62`, `feedback-out.ts:112`.

**BUG-4: Scribble text offset byte exceeds 0x7F for display index ≥ 11**
- **Severity:** Medium
- **Detail:** `56 + index*7 > 127` → illegal sysex data byte; node-midi may reject the frame. Same root as BUG-1. `feedback-out.ts:121,126`.

**BUG-5: `normalizeOscPacket` has no internal guards (null input throws, deep bundles blow the stack)**
- **Severity:** Low
- **Detail:** safe today only because of the caller's try/catch (`osc-udp.ts:27`); any future caller loses the net. Suggest null guard + recursion-depth cap. `osc-normalize.ts:10`.

**BUG-6: Unbounded numeric format fields produce garbage commands/addresses**
- **Severity:** Low
- **Detail:** `amount: 1e308` → `"Attribute … at  + Infinity"`; executor `number ≥ 1e21` → `/Page1/Fader1e+21`. Schema ceilings suggested. `mapping.ts:11,65`.

**BUG-7: CLI harness installs SIGINT/SIGTERM handlers only after start() resolves**
- **Severity:** Low
- **Detail:** Ctrl-C during the ~3.5 s startup animation exits without a clean stop. Dev tool only. `engine-cli.ts:126`.

**BUG-8: EC-1 and EC-6 lack dedicated tests**
- **Severity:** Low
- **Detail:** both behaviors implemented and indirectly exercised; no asserting test names them.

**Findings without a change request:**
- **F1 (documentation):** `options.amount` also scales encoder→executor accumulation — the PAM-1 format documents amount for executor actions, v1 applied it only to attributes; not observable with bundled content (no executor encoder sets amount). To be recorded in design.md Implementation Notes.
- **F2 (documentation):** masterEnabled + `always-on` sends the fixed value (v1 coerced to 127); consistent with the Button path, not observable with bundled content. To be recorded likewise.
- **F3:** connection check = 20 total attempts per design (v1: 21). Sanctioned by design.md.
- **L2 (informational):** `command` strings are arbitrary MA3 console commands by design (v1 parity) — the format's "no executable code" means no code *executed by pam-osc*; a doc note that shared mappings should be reviewed is recommended.

### Verdict (initial pass)
- **ACs:** 11/11 passed (+ 6/6 ECs) · **Bugs:** 8 (0 Critical / 1 High / 3 Medium / 4 Low) · **Security:** LAN + lifecycle clean; untrusted device-definition files are the one gap (BUG-1 cluster)
- **Ship: NOT READY** — BUG-1 (High) blocks. The BUG-1/3/4 cluster shares one root cause (missing bound on display `index`) and BUG-2 is a two-line guard; all are cheap, contained fixes. Everything else is hardening/coverage. Run `/build` to fix, then `/review` again.

---

## Fix verification (same day, 2026-07-17)

All eight bugs fixed in the follow-up build pass (commit `fix(PAM-2): review fixes — …`) and re-verified:

- **BUG-1/3/4 — fixed:** display `index` bounded 0–7 in the schema (`device-definition.ts`, rejection test added) plus defensive guards in the color path (index vs. array bound) and text path (offset ≤ 0x7F). Bundled content unaffected (indices 0–7, 44 format tests green).
- **BUG-2 — fixed:** `/Timecode<slot>` and `/14.<slot>` only accepted for slots 0–8 (`feedback-router.ts` `validSlot`); flood test with 1001 hostile slots added — real slot feedback still renders.
- **BUG-5 — fixed:** `normalizeOscPacket` null-safe, bundle recursion capped at depth 32; tests for null/primitive/50k-deep bundles added.
- **BUG-6 — fixed:** schema ceilings — executor/display `number` ≤ 9999, `amount` ≤ 1000; rejection tests added.
- **BUG-7 — fixed:** CLI signal handlers registered before `engine.start()` (code-order fix, verified by reading; dev tool only).
- **BUG-8 — fixed:** dedicated EC-1 (four unmapped-event shapes → zero sends) and EC-6 (optional features absent → no error, routing works) tests added.
- **F1/F2/L2 — documented:** design.md Implementation Notes (amount-on-executor, always-on vs masterEnabled) and docs/file-format.md (command-string trust note for shared mappings).

**Suites after fixes: 94/94 tests green (+9), typecheck clean.**

### Final Verdict
- **ACs:** 11/11 passed (+ 6/6 ECs) · **Open bugs:** 0 Critical / 0 High / 0 Medium / 0 Low · **Security:** pass
- **Ship: READY** — Approved. Reminder from the spec's decision log: real onPC/hardware verification is deferred until PAM-3 exists; the CLI harness (`npm run engine`) is the vehicle for it and had a successful smoke run.
