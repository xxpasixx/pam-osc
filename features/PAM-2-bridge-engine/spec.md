# PAM-2: Bridge Engine

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd
**Created:** 2026-07-16 · **Last Updated:** 2026-07-16

## Why

The engine is the product core: it replaces the Open Stage Control runtime of v1 with a native bridge that owns its transports directly — real MIDI I/O and the OSC/UDP socket to the console. It reads the PAM-1 file format and delivers full v1 feature parity: everything the five supported boards can do today keeps working, plus hot-plug resilience v1 never had.

## Dependencies
- PAM-1 (device & mapping file format — the engine reads it)

## Acceptance Criteria

**MIDI → OSC (input)**

- [ ] **AC-1** — Given an active mapping with absolute fader controls, when a CC fader or 14-bit pitch-bend fader moves, then the engine sends the matching OSC fader message for the current executor page scaled to MA3's 0–100 range — pitch-bend at full 14-bit resolution, not quantized to 127 steps.
- [ ] **AC-2** — Given a mapping with relative encoders, when an encoder turns, then the engine handles all three target types: executor-fader targets accumulate into a 0–100-clamped value and send fader messages; MA3-encoder targets send relative encoder messages; attribute targets send an Attribute command whose step honors the fine (×0.1) and rough (×10) modifier toggles, with "current" resolving to the last selected attribute.
- [ ] **AC-3** — Given a mapping with button controls, when a button is pressed (above its minValue threshold, if set), then the assigned action fires: executor → Key message (press and release, scaled value); QuickKey → `Quickey "pam-osc_<name>"`; command → the raw command string; local function → engine-local toggle (encoderFine/encoderRough with LED confirmation, attribute select with attribute-LED group update).
- [ ] **AC-4** — Given a timecode-enabled mapping on an MC-mode device, when MA3 sends timecode feedback, then the 7-segment display mirrors the selected slot's time; the slot-select button cycles slots 0–8; a tap on play/pause sends Go+/Pause based on the slot's running state; a hold ≥ 500 ms sends Off.

**OSC → MIDI (feedback)**

- [ ] **AC-5** — Given MA3 sends executor fader values, when a value matches a mapped control on any active device, then the hardware follows: motor faders via CC (0–127) or pitch-bend (14-bit), encoder rings mapped into their configured return range.
- [ ] **AC-6** — Given MA3 sends button/sequence state (Button values, masterEnabled), when a mapped control matches, then its LED updates through the mapping's predefined feedback type; controls with permanentFeedback keep their fixed value; on MC-mode devices "off" is sent as note-on with velocity 0.
- [ ] **AC-7** — Given a device with displays (X-Touch scribble strips), when MA3 sends color and name (`sequence;cue`) feedback, then each strip shows the nearest of the seven supported display colors and the sequence/cue text padded/truncated to 7 characters per line, via the device's SysEx protocol.

**Runtime behavior**

- [ ] **AC-8** — Given the console reports DeskLock active, when MIDI input arrives, then no OSC messages or commands are sent until the console reports unlock; console feedback continues to be processed throughout.
- [ ] **AC-9** — Given the engine starts with at least one active mapping, when startup completes, then each mapped device has played the MIDI output-test animation, the start state is restored (attribute LED, permanent feedback), the plugin force-reload is triggered, and the connection check runs — its result (connected / console reachable but plugin missing / unreachable) is emitted as a status event, with automatic retries while unresolved.
- [ ] **AC-10** — Given a mapped MIDI device disconnects while the engine runs (or is absent at startup), when the device (re)appears, then the engine binds it automatically and restores its feedback state — meanwhile it keeps running for all other devices and emits device status events.
- [ ] **AC-11** — Given a config (console IP, send/receive ports, active mappings), when the engine is started programmatically, then it runs headless without any UI, drives several devices at once (including two units of the same board type), and exposes start/stop/reconfigure plus status events (connection, devices, errors); reconfigure applies a changed config cleanly — no duplicate messages from stale listeners afterwards.

## Out of Scope
- Settings & diagnostics UI — PAM-3/PAM-4 (incl. surfacing port diagnosis and the on-demand MIDI test mode)
- v1 mapping import — PAM-5
- Console-side changes — the Lua plugin stays the unchanged v1 plugin
- New feedback capabilities beyond parity (colored button feedback — PAM-10)
- Touch layouts / Open Stage Control replacement — v2 non-goal

## Edge Cases
- **EC-1** — MIDI events with no assignment in the active mapping are ignored — no crash, no log spam.
- **EC-2** — OSC feedback no active mapping references is ignored.
- **EC-3** — Malformed OSC packets or unexpected addresses never crash the engine — log and continue.
- **EC-4** — A config referencing a missing/invalid mapping or device file: the engine reports it and keeps running with the valid rest (consistent with PAM-1 AC-4).

## Technical Requirements
- Events are forwarded immediately (no polling/batching); no perceptible added latency on a local network — the engine is used in live operation.
- The engine core stays Electron-free (pure Node in `app/src/core`) and is covered by the integration suite: virtual MIDI ports + fake-MA3 OSC emulator (per AGENTS.md).
- A minimal dev entry point (CLI: start the engine with a config file) ships with the feature, so the engine can be run against onPC and real hardware before any UI exists.

## Open Questions
- None

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Engine owns the runtime connection-check logic (ping/pong, retries, status events); PAM-4 only surfaces it | v1.4 connection behavior is engine behavior; UI stays thin | 2026-07-16 |
| Full v1 parity including timecode (xTouch1/2 use it) | No existing user left behind | 2026-07-16 |
| Hot-plug auto-reconnect — new vs v1 | Live-operation robustness; v1's bind-at-start-only was an OSC-framework limitation | 2026-07-16 |
| PAM-2 is verifiable standalone: automated emulator/virtual-MIDI suite **plus** a headless dev-harness run against onPC/real hardware — no UI needed | The engine is config-driven and headless anyway (AC-11); verification must not wait for PAM-3 | 2026-07-16 |
