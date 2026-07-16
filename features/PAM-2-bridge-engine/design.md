# PAM-2 — Design

**Date:** 2026-07-17

> The technical design (HOW). Two readers: the PM (approves) and `/build` (implements against it). No code — but implementation-grade precise. The contract (WHAT) lives in `spec.md`.

## Component Structure

No user interface — PAM-2 delivers the engine, its transports, and a CLI dev harness. Pure Node; Electron arrives with PAM-3.

```
app/src/core/
+-- format/                     (PAM-1, consumed as-is: loadFormat() → validated
|                                DeviceDefinition/Mapping objects + FormatIssues)
+-- engine/
|   +-- Engine facade           start / stop / reconfigure + typed events
|   +-- Runtime state           page, attribute, fine/rough, desk lock, encoder
|   |                           accumulators, timecode slots, feedback cache
|   +-- Input router            MIDI event → MA3 action (per assignment)
|   +-- Feedback router         OSC feedback → MIDI feedback (per feedback type)
|   +-- Timecode module         slot state, 7-segment rendering, tap/hold logic
|   +-- Connection checker      ping/pong state machine with retries
|   +-- Startup sequencer       animation → restore state → forceReload → ping
|   +-- Device manager          port binding, hot-plug watcher, per-unit state
+-- transports/
|   +-- MIDI transport          interface + easymidi adapter (+ virtual ports in tests)
|   +-- OSC transport           interface + UDP adapter (+ fake-MA3 emulator in tests)
app/src/dev/
+-- CLI harness                 start the engine from a JSON config file, log events
```

The engine core never imports `easymidi` or `osc` directly — both transports are injected interfaces. The integration suite runs the *identical* core against virtual MIDI ports and a fake-MA3 UDP emulator; the CLI harness runs it against the real adapters. That is what makes every AC CI-testable.

## Data Model

Nothing in PAM-2 is persisted (consistent with `docs/data-model.md` — runtime state is mirrored live, never written to disk; the map needs no change). Two in-memory structures matter:

**Engine Config** — the input to `start()`/`reconfigure()`. PAM-3 will later own its persistence as App Settings; the CLI harness reads it from a JSON file (dev tool only, not a product file format):

```
- consoleAddress — IP or hostname, required
- sendPort — UDP port the console listens on, integer 1–65535, required
- receivePort — local UDP port for console feedback, integer 1–65535, required
- deviceFolders / mappingFolders — folder paths handed to the PAM-1 loader
  (bundled + user locations), at least the bundled ones
- activeMappingIds — list of mapping ids (PAM-1 envelope id), at least 1;
  two units of the same board = two mappings, both listed
```

Unknown mapping ids, loader errors, or an empty active list are reported as issues; the engine starts with whatever is valid (spec EC-4) and refuses to start only when *nothing* valid remains. v1's unused OSC `prefix` option is dropped.

**Runtime State** — held per engine run, reset on start/reconfigure:

```
- currentPage — integer ≥ 1, starts at 1
- currentAttribute — text, starts "dimmer"
- encoderFine / encoderRough — booleans, start off
- deskLocked — boolean, starts unlocked
- per relative-encoder assignment: accumulator 0–100, starts 0
- timecode: selectedSlot 0–8 (0 = none, starts 0); per slot: hours/minutes/
  seconds/hundredths as last received, running (boolean), cleared (boolean)
- per bound device: feedback cache — last value sent per control (LEDs, fader
  positions, segments), used to restore hardware state after a rebind and to
  suppress redundant MIDI sends during the startup animation
```

## Behaviors & Access

Everything is local; there is no access model beyond "the local user". The contract has four parts:

### 1. Engine API (consumed by the CLI harness now, PAM-3/PAM-4 later)

```
Operations:
- start(config)      — load formats, bind devices, run the startup sequence
- stop()             — close all MIDI ports and the UDP socket, cancel all
                       timers; the engine can be started again afterwards
- reconfigure(config) — stop + start in one call, without process restart;
                       afterwards no stale listener may fire (AC-11)

Events (typed, observable by any consumer):
- connection — state: checking | connected | plugin-missing | unreachable,
               plus attempt counter (AC-9)
- devices    — per active mapping: mapping id, port name, bound | missing (AC-10)
- issue      — structured problems: PAM-1 FormatIssues, transport errors,
               unknown mapping ids; file/path/problem in plain language
- log        — human-readable progress lines (the harness prints these)
```

### 2. Input routing (MIDI → MA3) — v1 parity table

MIDI events are normalized at the adapter: note-off arrives as a note event with value 0 (v1 semantics). An assignment's `options.minValue` discards **every** event at or below the threshold — including releases (exact v1 behavior, used by MPX16 pads). While `deskLocked` is true, *all* MIDI-originated processing is suppressed (including local toggles); console feedback keeps flowing (AC-8).

| Control + action | Engine sends (v1-identical) |
| --- | --- |
| fader (cc) + executor | `/Page<p>/Fader<n>` — float, value ÷ 127 × 100 (AC-1) |
| fader (pitchbend) + executor | `/Page<p>/Fader<n>` — float, value ÷ 16380 × 100, full 14-bit (AC-1) |
| encoder + executor | accumulator ± relative detents, clamped 0–100 → `/Page<p>/Fader<n>`; executor numbers above 300 (MA3 rotary knobs) get **additionally** `/Page<p>/Encoder<n>` with the signed relative value (AC-2) |
| encoder + attribute | `/cmd` — `Attribute <attr> at ± <step>`; step = detents × `options.amount`, × 0.1 while encoderFine, × 10 while encoderRough; attribute "current" resolves to `currentAttribute` (AC-2) |
| button + executor | `/Page<p>/Key<n>` — integer, round(value ÷ 127 × 100); press and release both sent (unless filtered by minValue) (AC-3) |
| button + command | `/cmd` — the command text, on every note event passing minValue (AC-3) |
| button + quickKey | `/cmd` — `Quickey "pam-osc_<key>"` (AC-3) |
| button + modifier encoderFine / encoderRough | toggle the flag; confirm via on-off feedback on the same control (AC-3) |
| button + modifier attributeSelect | set `currentAttribute`; refresh the LED of **every** attributeSelect button — only the matching one lit (AC-3) |
| button + timecodeSelect, no slot | cycle selectedSlot 0→1→…→8→0; reset segments, show slot digit, re-render the slot's time if known (AC-4) |
| button + timecodeSelect, with slot | select exactly that slot, same display update (AC-4) |
| button + timecodePlayPause | press starts a 500 ms timer → fires `Off Timecodeslot <sel>` and marks the slot cleared; release before 500 ms cancels the timer and toggles: running → `Pause Timecodeslot <sel>`, stopped → `Go+ Timecodeslot <sel>`; a release after the Off fired is consumed silently (AC-4) |

Relative detents come from the device definition's encoder `encoding` ranges (increment range → +1 per step inside it, decrement range → −1), exactly v1's interpretation.

### 3. Feedback routing (MA3 → MIDI) — the Lua-plugin OSC contract, unchanged

Incoming addresses and their handling; anything unmatched is ignored (EC-2), malformed packets are logged and skipped (EC-3):

| Incoming | Engine behavior |
| --- | --- |
| `/Page<p>/Fader<n>` (0–100) | every assignment targeting executor n with `fader-position` feedback: cc fader → CC value round(v ÷ 100 × 127); pitchbend fader → pitch value round(v ÷ 100 × 16380); `encoder-ring` feedback → value mapped into the ring's configured range on the ring's CC, **and** the encoder's accumulator is set to v (AC-5) |
| `…/Button<n>` | assignments targeting executor n with `on-off` feedback: value > 0 → onValue, else offValue; `always-on` assignments keep their fixed value (AC-6) |
| `/masterEnabled/<name>` | assignments whose command action matches `<name>` case-insensitively: on-off by truthiness, always-on unchanged (AC-6) |
| `…/Color<n>` | display assignments showing executor n: parse "r;g;b;a", pick nearest of the 7 X-Touch strip colors (black when all-zero or alpha 0), send **one** SysEx color frame carrying all 8 strips (AC-7) |
| `…/Name<n>` | value "sequence;cue": two SysEx text frames per matching strip — line 1 sequence, line 2 cue, each padded/truncated to 7 chars; text offsets: line 1 = strip-index × 7, line 2 = 56 + strip-index × 7 (AC-7) |
| `/updatePage/current` | set currentPage; subsequent sends use it (AC-1) |
| `/status/deskLocked` (T/F) | set/clear deskLocked (AC-8) |
| `/status/connectionPong`, `/status/pluginPong` | consumed by the connection checker (AC-9) |
| `/Timecode<slot>` ("1h02m03:04") | store hours/minutes/seconds/hundredths for that slot; if it is the selected slot, re-render the 7-segment display (AC-4) |
| `/14.<slot>` ("Go+"/other) | set the slot's running flag (AC-4) |

Executor numbers are parsed from the trailing digits of the address (v1 read the last 3 characters; digits-parsing is behavior-identical for MA3's 3-digit executors).

### 4. v1 → v2 MIDI translation (the parity-critical boundary, spec Technical Requirements)

All translation happens exactly once, inside the transport adapter:

- **Channels:** format files use 1–16 (human), `easymidi` uses 0–15 — subtract 1 at the adapter, nowhere else.
- **MC-mode "off":** devices with mode "mc" get note-on with velocity 0 instead of note-off (v1 behavior, required by X-Touch MC).
- **SysEx:** v1's hex strings become byte arrays at the adapter. Scribble color frame: `F0 00 00 66 14 72` + 8 color bytes + `F7`; text frame: `F0 00 00 66 14 12` + offset byte + 7 ASCII bytes + `F7`.
- **7-segment (mc only):** position p is written via CC number (75 − p) with the digit's ASCII code as value; 12 positions, reset writes value 0. Layout identical to v1: slot digit at position 1, hours 2–4, minutes 5–6, seconds 7–8, hundredths 9–10.
- **Scaling constants bit-exact to v1:** 127 for CC, **16380** (not 16383) for pitchbend, 0–100 on the MA3 side. Parity beats theoretical correctness; the integration suite asserts identical bytes/messages to v1 for the bundled mappings.

### 5. Runtime services

**Startup sequence (AC-9):** bind configured devices → play the output-test animation (~3.5 s: LED running light + fader/ring wave, only value *changes* sent) → restore start state (attributeSelect LEDs, always-on feedback, timecode segment init for enableTimecodeSend devices) → trigger the plugin force-reload (`Lua 'SetVar(GlobalVars(), "forceReload", true)'`) → start the connection check.

**Connection checker (AC-9):** sends the v1 ping pair (connection-pong Lua echo via the OSC entry named "pam-osc", fallback entry 2; plugin ping via `pamPing` global). 3 s timeout → result: both pongs = connected; console pong only = plugin-missing; none = unreachable. Non-connected results retry every 30 s, max 20 attempts; every result is emitted as a connection event. Port diagnosis (who holds the UDP port) is **not** here — PAM-4 owns it, per spec decision.

**Device manager (AC-10, EC-5):** `easymidi` has no hot-plug events, so the port list is polled every 2 s. Matching is by the mapping's exact configured port name — a device that reappears under a different OS name stays "missing" (EC-5; re-picking a port is PAM-3). On (re)bind: open ports, replay the feedback cache plus always-on/attribute LEDs and timecode segments — **no** animation on late binds or rebinds (mid-show safety; the animation runs only at engine start). On disconnect: mark missing, emit the event, drop sends to that device silently, everything else keeps running.

**Optional-field rule (EC-6):** absent optional mapping features (timecode flags, displays, minValue, amount, …) mean "feature off" — handled by the PAM-1 schema defaults, never a runtime error.

## Tech Decisions

- **Ports & adapters (injected transports).** The core is plain logic with two narrow interfaces; the same core runs in tests (virtual MIDI + fake MA3) and production (easymidi + UDP). Without this, the ACs would only be verifiable with hardware in hand.
- **Pure Node, no Electron.** Nothing in PAM-2 needs a window; the Electron shell arrives with PAM-3 and hosts this engine in its main process unchanged.
- **Hot-plug by polling.** No native events exist in the MIDI layer; a 2 s poll is imperceptible during setup and costs nothing measurable at runtime.
- **v1 constants bit-exact.** Every scaling formula and protocol byte is carried over unchanged and locked by tests against the bundled mappings — the fastest way to make "feature parity" falsifiable.
- **Single UDP socket** bound to receivePort, used for send and receive — matches how users already configure the MA3 OSC destination for v1; no second port to document.

## Dependencies

- `easymidi` — MIDI I/O; also provides virtual ports for the integration tests (per AGENTS.md; Windows CI limitation documented there)
- `osc` — OSC message encode/decode over UDP (fake-MA3 emulator uses a plain UDP socket + the same codec)

(No CLI framework — the harness parses its two arguments with Node built-ins.)

## Build Plan

```
Level 0 — PAM-1 delta:  T0      timecodeSelect.slot becomes optional (absent = cycle 0–8,
                                v1 parity) + xTouch mappings + format docs updated
                                · files: app/src/core/format/mapping.ts, resources/mappings/
                                  x-touch-default-*.json, docs/file-format.md · → AC-4
Level 1 — Transports:   T1 [P]  MIDI transport interface + easymidi adapter + channel/SysEx
                                translation + virtual-port test helper
                                · files: app/src/transports/midi* · → AC-1, AC-6, AC-7
                        T2 [P]  OSC transport interface + UDP adapter + fake-MA3 emulator
                                test helper · files: app/src/transports/osc* · → AC-9
Level 2 — Engine core:  T3      runtime state + input router (fader/encoder/button/modifier)
                                · files: app/src/core/engine/state*, input* · → AC-1–AC-3, AC-8
                        T4      feedback router (faders, LEDs, masterEnabled, displays, page)
                                · files: app/src/core/engine/feedback* · → AC-5–AC-7
                        T5 [P]  timecode module · files: app/src/core/engine/timecode* · → AC-4
                        T6 [P]  connection checker + startup sequencer (animation, restore,
                                forceReload) · files: app/src/core/engine/connection*, startup* · → AC-9
                        T7      device manager (binding, hot-plug poll, feedback cache replay)
                                · files: app/src/core/engine/devices* · → AC-10, EC-5
                        T8      engine facade: start/stop/reconfigure + events, config validation
                                · files: app/src/core/engine/engine* · → AC-11, EC-4
Level 3 — Harness/E2E:  T9 [P]  CLI dev harness (config file, event logging, clean SIGINT stop)
                                · files: app/src/dev/* · → AC-11
                        T10 [P] end-to-end integration suite: virtual MIDI ↔ engine ↔ fake MA3,
                                v1-parity byte assertions for bundled mappings, EC-1–EC-6
                                · files: app/src/core/engine/*.test.ts · → all ACs
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| Ports & adapters: transports injected as interfaces | ACs verifiable in CI with virtual MIDI + fake MA3; core stays hardware-free | Core calls easymidi/osc directly | One indirection layer to maintain | 2026-07-17 |
| Pure Node in PAM-2, Electron arrives with PAM-3 | Nothing here needs a window; engine stays maximally testable | Scaffold Electron shell now | App frame exists one feature later | 2026-07-17 |
| PAM-1 delta: timecodeSelect.slot optional, absent = cycle 0–8 | v1 parity (AC-4); PAM-1 approximated cycling as "slot 1" during build | Fixed-slot select only (change AC-4) | Small schema + content change while PAM-1 is In Review | 2026-07-17 |
| Hot-plug via 2 s port-list polling | easymidi exposes no hot-plug events | Native hot-plug bindings (extra dep, platform-specific) | Up to 2 s bind delay after replug | 2026-07-17 |
| No startup animation on late binds/rebinds | A device replugged mid-show must not play a light show | Full startup ritual on every bind | Late-bound devices get no visual output test (state restore still confirms output) | 2026-07-17 |
| v1 scaling constants bit-exact (incl. pitchbend 16380) | Parity is the contract; tests assert identical output to v1 | "Correct" 16383 full-scale | Carries a v1 quirk forward, documented here | 2026-07-17 |
| Single UDP socket for send + receive | Matches the documented v1 console setup; one port to configure | Separate send socket | None of note | 2026-07-17 |

## Open Questions

- None
