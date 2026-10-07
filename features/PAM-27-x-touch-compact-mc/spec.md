# PAM-27 — X-Touch Compact MC-mode support (bundled device + playback mapping)

> Lite spec, written inline during build (2026-07-27). Wire scheme hardware-verified the same day by live MIDI capture against a real unit.

## Why

The X-Touch Compact's MC (Mackie Control) mode is the better bridge target than its standard mode: faders speak 14-bit pitchbend (finer motor feedback), the top encoders send true relative deltas, and no X-Touch-editor reconfiguration is needed. v2 ships a bundled device definition + playback mapping so an MC-mode unit works out of the box. Requested layout: the 8 side encoders act as MA3 X-Keys, Layer A/B page up/down.

## Acceptance Criteria

- **AC-1** A bundled device definition `x-touch-compact-mc` (mode `mc`) describes the captured MC wire scheme: faders = pitchbend ch 1–8 + main ch 9 (motorized), top encoders = relative CC 16–23 (1..8 CW / 65..72 CCW) with push notes 32–39 and LED rings CC 48–55 (32..43), button rows = notes 8–15 / 16–23 / 24–31, fader buttons = notes 0–7, main fader button = note 50, Layer A/B = notes 84/85, side buttons = notes 91/92/86/95/93/94.
- **AC-2** The MC-mode quirks of the side encoders are modeled honestly: encoders 9–14 are push-only buttons (notes 40–45, rotation transmits nothing); encoders 15/16 are rotation-only (push transmits nothing), each modeled as ONE round button on its clockwise note (47/49) — the counter-clockwise notes 46/48 are deliberately ignored so turning back never re-fires. _(Delta 2026-07-27: originally one button per direction; merged to one control per knob after hands-on feedback.)_ _(Delta 2026-08-01: encoders 15/16 are now real ENCODERS, not buttons — new device-format encoding mode `note-pair` (CW = the control's own note, CCW = `encoding.decrementNote`, one detent press = ±1); the engine routes both notes to the same encoder entry.)_
- **AC-3** A bundled mapping `x-touch-compact-mc-playback-1` assigns: faders → executors 201–208 + 209 (motor feedback), encoders → 401–408 (ring feedback, push = go), rows → 401–408 / 301–308 / 201–208, fader buttons → 101–108 + 109 (LED feedback).
- **AC-4** The 8 side encoders act as X-Keys: pushes 9–14 fire `XKeys 1`–`XKeys 6`; one clockwise rotation detent of encoder 15/16 fires `XKeys 7`/`XKeys 8`. _(Delta 2026-07-27: was "either direction" — now clockwise only, see AC-2.)_ _(Delta 2026-08-01: X-Keys replaced by executors after hands-on use — pushes 9–14 press executors 291–296, rotation of 15/16 turns executor knobs 297/298 in both directions.)_
- **AC-5** Layer A = Page Down, Layer B = Page Up (QuickKeys `PAGE_DOWN` / `PAGE_UP`). _(Delta 2026-07-27: direction swapped after hands-on testing — A/B originally spec'd the other way around.)_
- **AC-6** Both files load through the bundled-content validation (schema-valid, no layout overlaps, inventory test lists them).

- **AC-7** _(Delta 2026-07-27)_ The six side buttons fire QuickKeys Highlight | Clear / Prev | Next / Page Down | Page Up (replaces the initial transport layout). _(Delta 2026-08-01: bottom pair is now Up | Down — the page keys live on Layer A/B, AC-5.)_

## Out of Scope

- Scribble strips / displays (the Compact has none).
- A second MC mapping variant; the standard-mode definitions stay untouched.
- Automatic mode detection or switching the unit into MC mode from the app (hardware power-on toggle).

## Open verification

- ~~The `XKeys n` console command syntax (AC-4) is **to verify** on a GrandMA3 console — pool-object call semantics assumed.~~ _(Obsolete 2026-08-01: the mapping no longer uses XKeys, see AC-4 delta.)_
- The note-pair encoder routing (AC-2 delta 2026-08-01) is engine-tested but **to verify** on the real unit (knob 15/16 turning executor knobs 297/298 in both directions).
- **Verified 2026-08-01 (hardware):** the side-encoder LED rings (9–16) are NOT controllable in MC mode — the unit ignores standard-mode "LED ring change" CC 18–25, "LED ring remote" CC 34–41, and a hypothetical MC V-Pot continuation CC 56–63 (channels 1+2, values 6/13/27/43/127 each), while the top rings CC 48–55 respond normally. The side encoders therefore ship without ring feedback; standard-mode boards remain the option when side-ring feedback matters.
- LED/motor feedback (output direction) verified live against the unit during build; see review notes.
