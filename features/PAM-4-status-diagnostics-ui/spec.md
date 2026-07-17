# PAM-4: Status & Diagnostics UI

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17

## Why

v1 buried its diagnostics (connection check, port diagnosis, MIDI test) in the Open Stage Control terminal — the #1 source of setup questions on Discord. PAM-4 surfaces the v1.4 diagnostics logic in a dedicated Status view and replaces the terminal entirely: connection state with actionable hints, port diagnosis, on-demand MIDI tests, a filterable traffic log, and manual engine control.

## Dependencies

- PAM-2 (engine emits connection/device/issue/log events)
- PAM-3 (app shell, settings, minimal status indicators)

## Acceptance Criteria

- [ ] **AC-1** — **Status view.** Given the app is running, when the user opens the Status view, then it shows the connection state (checking / connected / plugin missing / unreachable) with the v1.4 hint texts for the current failure (MA3 OSC settings, send entry, firewall), the retry attempt, and the per-device list (bound / missing).
- [ ] **AC-2** — **Port diagnosis.** Given the connection check reports unreachable or the OSC receive port cannot be bound, when the diagnosis runs, then the UI names the blocking process (e.g. `UDP port 8000 is used by "QLab" (pid 4711)`) or reports the port as free — on Windows, macOS and Linux; if the check itself fails, it says "could not check", never an unhandled error.
- [ ] **AC-3** — **Manual re-check.** Given any connection state (including after the engine gave up retrying), when the user hits "Check connection", then a new connection check runs immediately and the result updates the view; automatic retries resume.
- [ ] **AC-4** — **MIDI output test on demand.** Given a bound device, when the user triggers its output test, then the device plays the v1 test animation (LED running light + fader/encoder wave) and afterwards returns to its live feedback state (permanent feedback, attribute LED, current executor values).
- [ ] **AC-5** — **Traffic log.** Given the engine is running, when MIDI or OSC messages flow, then the log view shows them as human-readable entries, filterable by **MIDI IN / MIDI OUT / OSC IN / OSC OUT** (engine/system lines always available as their own category), with copy-to-clipboard; the buffer is bounded — long sessions never grow memory without limit.
- [ ] **AC-6** — **Engine start/stop.** Given the engine is running, when the user hits Stop, then the engine stops cleanly (MIDI and UDP ports released) and the UI shows a distinct "stopped" state; Start runs it again with the saved settings. Auto-start on launch (PAM-3 AC-4) stays the default.

## Out of Scope

- Sending arbitrary/custom MIDI or OSC messages from the UI (test mode is the predefined animation only)
- Persisting logs to disk / log files — copy-to-clipboard covers support cases
- Colored button feedback diagnostics — PAM-10

## Edge Cases

- **EC-1** — Output test during live operation: feedback state is fully restored after the animation; a test never leaves stale LED/fader state.
- **EC-2** — Message flood (fast fader moves): the log stays responsive; entries may be capped/dropped oldest-first, the UI never freezes.
- **EC-3** — Engine stopped: connection card and device list show "stopped" (not "unreachable"), test/re-check actions are disabled.
- **EC-4** — Start pressed while the config is invalid or ports are taken: the engine error surfaces in the UI (consistent with PAM-3 EC-3), the app never crashes.

## Open Questions

- None

## Decision Log

### Product Decisions

| Decision                                                        | Rationale                                                                       | Date       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| Manual start/stop lands in PAM-4 (PAM-3 had deferred it)        | Diagnostics view is its natural home; port-sharing with other tools needs it    | 2026-07-17 |
| Test mode = output animation + traffic log (no input injection) | Input problems are visible in MIDI IN log; keeps scope at v1.4 parity + monitor | 2026-07-17 |
