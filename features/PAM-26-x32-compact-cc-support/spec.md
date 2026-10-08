# PAM-26 — X32 Compact support (DAW Remote "MIDI CC" mode) + CC-addressed buttons

**Status:** Building · **Priority:** P1 · **Depends on:** PAM-1, PAM-2

## Why

Pascal owns a Behringer X32 Compact and wants to use it as a GrandMA3 surface. Live MIDI capture against the real unit (2026-07-26) showed that its Mackie-Control remote protocol never engages over the X-USB card — the console keeps sending its raw "MIDI CC" remote protocol. That protocol is simple and fully bidirectional (motor faders + mute-row LEDs verified on hardware), but it addresses **buttons via CC** (value 127 = pressed, 0 = released) — a shape the engine previously dropped on input and skipped on LED feedback, since buttons were assumed to be note-addressed.

## Acceptance Criteria

- ~~**AC-1**~~ _(moved to Out of Scope 2026-10-07 — the X32 Compact board did not work end-to-end; device + mapping removed from the bundle)_ A bundled device definition `x32-compact-cc` + default mapping `x32-compact-cc-default-1` ship with the hardware-verified CC scheme: faders ch 1 CC 0–7 (left bank), CC 72–79 (right bank), CC 70 (main), all motorized; mute buttons ch 2 on the same numbers with on-off LEDs. No encoders/displays/other rows (the console does not transmit them in CC mode).
- **AC-2** A CC-addressed button control routes input exactly like a note button: the CC value feeds the same press/release semantics (executor Key, minValue threshold, CMD-mode interception, press-only actions).
- **AC-3** On-off / always-on feedback for a CC-addressed button is sent as a CC message on the control's own channel+number (note buttons keep the v1 wire shape unchanged).
- **AC-4** Bundled-content tests cover the new files; the inventory test lists them. _(delta 2026-10-07: with AC-1 removed, the CC-button engine path stays covered by `cc-button.test.ts` on a synthetic board; the inventory test no longer lists X32 files.)_

## Out of Scope

- **Bundled X32 Compact board + mapping (former AC-1)** — removed 2026-10-07: it did not work end-to-end with the console. The generic CC-addressed button support (AC-2/AC-3) stays in the engine for other boards.

- Mackie-Control support for the X32 (the console never switched to MC during testing; the standard `mc` mode files would cover it if it ever engages)
- The X32's channel-2 state-broadcast groups (CC 40–43 / 60–63 / 80–85 on layer changes) — ignored as unmapped
- Select/Solo rows, encoders, scribble displays — not transmitted in CC remote mode

## Verification

Wire scheme, motor-fader RX and mute-LED RX hardware-verified 2026-07-26 via live capture/probe scripts against Pascal's unit. End-to-end (app → MA3 executor) verification pending.
