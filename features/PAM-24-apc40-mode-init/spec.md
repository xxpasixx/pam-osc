# PAM-24 — APC40 mkII Mode-1 init (host LED control via connect-time SysEx)

## Status: Spec'd

**Created:** 2026-07-22 · **Last Updated:** 2026-07-22

## Why

The APC40 mkII always powers up in **Generic Mode (Mode 0)**, which cannot be
changed from the hardware. In Mode 0 the LEDs are locally controlled, the
Activator/Solo/Rec-Arm buttons are toggles, and the Track-Select buttons re-bank
the device knobs across MIDI channels instead of sending their own MIDI. This is
the root cause of the observed "Activate shifts everything around", the "board
sends weird MIDI on track-select", and the fact that host-driven LED/colour
feedback does not work. The fix is the documented **Introduction message**: the
host sends one SysEx frame on connect to switch the board into **Ableton Live
Mode (Mode 1)**, where all buttons are momentary, knobs are no longer banked, and
all non-ring LEDs are host-controlled. This unblocks [PAM-10](../PAM-10-colored-button-feedback/spec.md)
(colored button feedback), which cannot function in Mode 0.

Verified against the official _Akai APC40 Mk2 Communications Protocol v1.2_
(2015-01-19), pages 8/10–12.

## Dependencies

- **PAM-2** (bridge engine — owns the MIDI connect/output path)
- **PAM-1** (device-definition format — gains the `initSysEx` field)
- Enables **PAM-10** (colored button feedback depends on Mode-1 host LED control)

## Acceptance Criteria

**Format:** **AC-N** — Given / When / Then, in English (repo spec language).

- [ ] **AC-1** — Given a device definition that declares an `initSysEx` byte
      array, when a mapping using that board connects (its MIDI **output** port
      opens), then the engine sends exactly that SysEx frame to the board once, as a
      `{ kind: "sysex" }` output message.
- [ ] **AC-2** — Given the init SysEx is defined for a connected board, when the
      engine sends startup/feedback output (startup animation, LED feedback, motor
      faders), then the init SysEx is sent **before** any other output message to
      that board, so the mode is set before the host drives LEDs.
- [ ] **AC-3** — Given a board that was disconnected and reconnected (e.g. USB
      re-plug or power-cycle, which resets it to Mode 0), when it reconnects, then
      the engine sends the init SysEx again, so the board is re-armed into its mode
      without a manual step.
- [ ] **AC-4** — Given the bundled **APC40 mkII** device definition, then it
      declares `initSysEx = F0 47 7F 29 60 00 04 41 01 01 01 F7` (Introduction
      message, Application/Configuration identifier `0x41` = **Ableton Live Mode /
      Mode 1**). _(Delta 2026-07-22: briefly changed to `0x42`/Mode 2 for the encoder
      rings, then reverted — in Mode 1 the rings are board-rendered but
      host-updatable, which covers AC-8 without giving up local ring response.)_
- [ ] **AC-5** — Given a device definition **without** `initSysEx` (all other
      bundled boards, existing user/shared files), when it connects, then no init
      SysEx is sent and behaviour is unchanged; the field is optional and additive,
      so existing files load with **no format-version bump**.
- [ ] **AC-6** — Given an `initSysEx` value in any loaded device file, when the
      catalog validates it, then it must be a well-formed SysEx frame (first byte
      `0xF0`, last byte `0xF7`, all inner bytes `0x00`–`0x7F`); a malformed value
      makes the board load as invalid (caught at load, never a runtime crash).
- [ ] **AC-7** — Given the APC40 mkII now runs in Mode 1 (no knob banking, all
      buttons momentary), then the bundled APC40 mkII device definition and default
      mapping are reviewed and, where needed, corrected for Mode-1 addressing (device
      knob channels, momentary vs toggle), and the correction is **verified on real
      hardware** before this feature is marked Live.
- [ ] **AC-8** — Given the APC40 mkII in Mode 1 (encoder LED rings board-rendered
      but host-updatable), when a knob is mapped to an MA3 target that reports a
      value, then its **LED ring reflects that value**: (a) the board is told each
      ring's **type** once on connect via per-device `initCC` (Device-Knob ring-type
      CC `0x18`–`0x1F`, Track-Knob ring-type CC `0x38`–`0x3F`; default value `2` =
      Volume style, configurable per device file), and (b) the live value is sent on
      the knob's own controller (Device knobs `0x10`–`0x17`, Track knobs
      `0x30`–`0x37`), which the board renders on the ring. Verified on real hardware.

## Out of Scope

- **Mode 2 (Alternate Ableton, `0x42`):** briefly adopted, then dropped — its
  only difference (host-exclusive ring control) isn't needed since Mode 1 rings
  accept host updates while staying locally responsive.
- **Other Akai boards** (APC mini / APC mini mk2 have their own mode SysEx): the
  `initSysEx` mechanism is generic, but only the APC40 mkII declares one here.
- **Periodic re-arming** via the PAM-16 handshake: connect-time (re)send covers
  power-cycles, since a power loss shows up as a disconnect/reconnect. Move here
  if hardware testing shows the board silently drops back to Mode 0 while staying
  connected.
- **A UI toggle** to pick the mode: the desired mode is a hardware fact declared
  in the device file, not a user setting.

## Edge Cases (when real)

- **EC-1** — `initSysEx` declared but the mapping binds an **input-only** unit
  (no output port): the send is a silent no-op (the transport already no-ops on
  output-less connections). No error surfaced.
- **EC-2** — Two units of the same board type connected at once: each unit gets
  its own init SysEx on its own connect (per-unit, not once globally).

## Open Questions

- [ ] Hardware verification of AC-7 (knob channels / momentary behaviour) and
      AC-8 (ring type + value → ring lights correctly) happens during `/build` +
      `/review` with the APC40 mkII connected.
- [ ] AC-8 modeling: how the ring-type init CCs are declared (a generic per-board
      `initCC` list, mirroring `initSysEx`) and whether the knobs stay `fader` type
      with `fader-position` feedback or are remodeled — resolved in `/design`.

## Decision Log

### Product Decisions

| Decision                                                                                                     | Rationale                                                                                                                                                                                                                 | Date       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Declare the init as **raw `initSysEx` bytes**, not a semantic `akaiMode` enum                                | Generic — works for any controller needing a start-time init blob, no APC-specific logic in the engine                                                                                                                    | 2026-07-22 |
| Target **Mode 1 (Ableton Live, `0x41`)** — final, after a brief Mode-2 detour                                | Momentary buttons, no knob banking, host LED control; rings stay board-rendered but host-updatable — AC-8 works without giving up instant local ring response. Mode 2's host-exclusive ring control adds nothing we need. | 2026-07-22 |
| Ring style set per device via `initCC`, default Volume (2)                                                   | Each board file declares its own ring-type CCs — style is a device fact, configurable without engine changes                                                                                                              | 2026-07-22 |
| APC40 knobs carry `motorized: true`                                                                          | The loader gates `fader-position` feedback on `motorized`; semantically the field means "hardware displays host-sent values" — the knobs do, via LED ring instead of a motor                                              | 2026-07-22 |
| Device ID byte = **`0x7F`** (broadcast), not `0x00`                                                          | Matches the official spec's recommended broadcast value; the board ignores the field anyway                                                                                                                               | 2026-07-22 |
| Handle the knob-banking / toggle fallout via a **review AC + hardware verify**, not a full re-definition now | Avoids over-specifying before we see the real Mode-1 MIDI on hardware                                                                                                                                                     | 2026-07-22 |
