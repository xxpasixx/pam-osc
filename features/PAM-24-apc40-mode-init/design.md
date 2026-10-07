# PAM-24 — Design

**Date:** 2026-07-22

> Technical design (HOW) for the APC40 mkII Mode-1 connect-time init. No code —
> implementation-grade precise. Contract (WHAT) lives in [spec.md](spec.md).

## Component Structure

No user interface. This feature is entirely inside the bridge engine + device
file format. The moving parts:

```
Device Definition (data)         resources/devices/apc-40-mk2.json
  └─ new optional field: initSysEx (raw SysEx frame)

Device format schema (validation)  app/src/core/format/device-definition.ts
  └─ initSysEx byte-array validator (SysEx frame rules)

Engine · DeviceManager (runtime)   app/src/core/engine/device-manager.ts
  └─ tryBind(): after the MIDI output port opens, send initSysEx once,
     before any other output, on both first bind and every rebind
```

## Data Model

The **Device Definition** entity (owned by the local user; bundled ones ship
with the app) gains one optional field:

```
Device Definition — new field:
- initSysEx  (optional; array of integers = one complete MIDI System-Exclusive frame)
    · Absent by default. Present only on boards that must be put into a mode on connect.
    · Constraints (rejected at load if violated):
        - length 2–64
        - every element an integer 0–255
        - first element = 240 (0xF0, SysEx start)
        - last element  = 247 (0xF7, SysEx end)
        - every INNER element (all but first/last) in 0–127 (7-bit MIDI data)
    · Semantics: the exact bytes the engine sends to the board's MIDI OUT on connect.
      The engine does not interpret them — it is an opaque init blob.

Bundled APC40 mkII value (AC-4):
  initSysEx = [240, 71, 127, 41, 96, 0, 4, 65, 1, 1, 1, 247]
            =  F0  47  7F  29  60  00 04 41 01 01 01  F7
  (Akai Introduction message, Application/Configuration identifier 0x41 = Ableton
   Live Mode / Mode 1 — momentary buttons, no knob banking, non-ring LEDs
   host-controlled; encoder rings board-rendered but host-updatable)
```

No change to `formatVersion` — the field is optional and additive, so every
existing device/mapping file loads unchanged (AC-5). `docs/data-model.md` updated
to mention the connect-time init on the Device Definition entity.

## Behaviors & Access

This is engine **runtime behavior**, not a user-facing API. The contract `/build`
implements:

```
On unit bind (DeviceManager.tryBind, immediately after the MIDI output port opens
successfully, BEFORE the onBind callback / feedback restore / startup animation):

- If the unit's device definition has initSysEx:
    send { kind: "sysex", bytes: initSysEx } directly on the fresh connection.
    - Sent as the FIRST output message to that board (AC-2), so the mode is
      set before any LED/fader/animation output.
    - Sent directly, NOT through the feedback cache (sendToUnit) — it must fire
      once per physical bind and never be conflated with restorable feedback state.
- If initSysEx is absent: do nothing (AC-5).
- If the unit is input-only (no output port bound): the transport's send is a
  silent no-op (EC-1) — no error.

This single location covers BOTH paths (AC-1, AC-3):
- First bind at engine start: tryBind runs inside deviceManager.start(), before
  the startup animation plays on the bound units.
- Rebind / hot-plug / power-cycle: the hot-plug poll calls tryBind again, before
  onBind → restoreUnit. A power-cycled board (back in Mode 0) is re-armed with
  no manual step.

Per-unit, not global: two units of the same board type each get their own init
on their own bind (EC-2).
```

### Mode-1 fallout to verify on hardware (AC-7)

Switching the APC40 mkII into Mode 1 changes hardware behavior. During `/build`
these are checked against the connected unit and the bundled device/mapping
corrected where the hardware disagrees:

- **Device-control knobs (CC 16–23):** in Mode 0 they were _banked_ by
  Track-Select (transmit on the selected track's channel; the device file binds
  them at channel 1). In Mode 1 they are **not banked** — they transmit on one
  fixed channel. Confirm the actual channel on hardware and update the device
  file + its `notes` accordingly.
- **Activator / Solo / Record-Arm:** Mode 0 = toggle, Mode 1 = **momentary**.
  Confirm a press sends note-on and release sends note-off (value 0), matching
  the engine's existing press/release semantics — no double-trigger.
- **Track-Select (0x33):** silent in Mode 0, sends its own note per track in
  Mode 1. If the mapping assigns it, confirm it behaves.
- **LEDs:** all non-ring LEDs become **host-controlled** — confirm pads/buttons
  no longer self-light on press and that host feedback (on-off LEDs, the PAM-10
  colour path) actually drives them; the encoder rings stay board-rendered but
  must adopt host value updates (AC-8).

Findings that require byte-level changes are applied to
`resources/devices/apc-40-mk2.json` / the default mapping; the AC is only met
once verified on the real unit.

### Encoder LED-ring feedback (AC-8)

Per the protocol (pages 22–27), each APC40 mkII knob ring is host-driven in two
parts, both plain Controller-Change messages:

```
Ring TYPE (set once):   send CC <type-id> <style>   style: 0=off, 1=Single, 2=Volume, 3=Pan
  Device knobs: type CC 0x18–0x1F   Track knobs: type CC 0x38–0x3F
Ring VALUE (continuous): send CC <knob-id> <0–127>   the board fills the ring per the type
  Device knobs: CC 0x10–0x17        Track knobs: CC 0x30–0x37   (same number as the knob input)
```

Note the ring VALUE controller is the **same CC number as the knob's input** —
so the existing `fader-position` feedback (which echoes the control's own CC
value back out) already produces the ring VALUE update. The only missing piece
is setting the ring TYPE once on connect.

**Mechanism — a generic `initCC` list**, mirroring `initSysEx` (built):

```
Device Definition — new optional field:
- initCC  (optional; array of { controller: 0–127, value: 0–127, channel?: 1–16 }, max 64 entries)
    · Sent on connect, right AFTER initSysEx, before any other output.
    · channel defaults to 1 when omitted.
    · Same rationale/placement as initSysEx (DeviceManager.tryBind, direct, per bind).
    · Ring STYLE is therefore configurable per device file — the APC40 ships
      Volume (2) as the default; a user board can declare Single (1) or Pan (3).

Bundled APC40 mkII initCC (AC-8): the 16 ring-type CCs set to Volume style (2):
  Device knobs: controllers 0x18–0x1F = 2
  Track knobs:  controllers 0x38–0x3F = 2
Mapping: the 16 knob assignments switch feedback from "none" to "fader-position"
  so the live executor value is echoed on the knob CC → the ring fills.
Device: the 16 knobs carry motorized: true — the loader gates fader-position on
  it, and semantically it means "hardware displays host-sent values" (here via
  the LED ring instead of a motor).
```

This keeps the knobs modelled as `fader` (they send absolute CC), needs no
engine feedback changes beyond emitting `initCC`, and is fully declarative.
In Mode 1 the rings are board-rendered but host-updatable — local knob turns
update the ring instantly, and MA3-side changes arrive via the value echo.
Ring style rendering and the exact executor→value behaviour are confirmed on
hardware (AC-8 verify).

## Tech Decisions

- **Send the init inside `DeviceManager.tryBind`, right after the port opens and
  before `onBind`.** This is the one place both the initial bind and every
  rebind pass through, and it guarantees the SysEx is the very first byte stream
  to reach the board — exactly what the Akai protocol requires ("sent before any
  other device-specific message"). Putting it in the engine's startup/onBind
  paths instead would need two call sites and could let the startup animation
  race ahead of the mode switch.
- **Store the init as raw bytes (`initSysEx`), not a semantic `akaiMode` enum.**
  The engine stays dumb about vendor modes; any future controller that needs a
  start-time init blob just declares its own bytes. (Spec decision, 2026-07-22.)
- **Validate the frame at load, in the device schema.** A shared/user board file
  is untrusted input; without validation a malformed or oversized array could
  push garbage to the hardware or allocate an unbounded buffer. The 2–64 length
  bound and the F0/…/F7 + 7-bit-inner rules make a bad file load as _invalid_
  (caught by the catalog) rather than misbehave at runtime (AC-6).
- **Send directly, bypassing the feedback cache.** The init is a per-bind
  hardware handshake, not restorable feedback state; caching it would add a
  replay slot with no benefit and blur the "first message out" guarantee.
- **No PAM-16 handshake coupling, no periodic re-send.** A board only reverts to
  Mode 0 on power loss, which surfaces as a disconnect/reconnect the bind path
  already re-arms. Periodic re-sending is parked in the spec's Out of Scope until
  hardware shows it's needed.

## Dependencies

- No new packages. The MIDI transport already types a `{ kind: "sysex" }`
  output message and the `easymidi` adapter already implements it
  (`output.send("sysex", bytes)`), so the full send path exists end-to-end today.

## Build Plan

Small feature; three code touch-points plus a hardware-gated verification.

```
Level 1 — Schema:   T1  add optional initSysEx + frame validator to the device
                        definition schema        · files: app/src/core/format/device-definition.ts
                                                  · → AC-5, AC-6
Level 2 — Data:     T2  add initSysEx to the bundled APC40 mkII device file
                        · files: resources/devices/apc-40-mk2.json  · → AC-4
Level 3 — Engine:   T3  send initSysEx in DeviceManager.tryBind (post-open,
                        pre-onBind, direct send)  · files: app/src/core/engine/device-manager.ts
                                                  · → AC-1, AC-2, AC-3, EC-1, EC-2
Level 4 — Ring FB:  T5  add optional initCC to schema + engine (send after
                        initSysEx); APC40 device gets the 16 ring-type CCs;
                        knob mapping feedback none → fader-position
                        · files: device-definition.ts, device-manager.ts,
                          apc-40-mk2.json, apc-40-mk2-default-1.json  · → AC-8
Level 5 — Verify:   T4  hardware pass on the connected APC40 mkII: confirm Mode-2
                        behavior + rings, correct knob channels / momentary / LEDs
                        · files: resources/devices/apc-40-mk2.json (+ default mapping)
                                                  · → AC-7, AC-8
```

Unit/integration tests (Vitest): the fake-MIDI transport asserts the SysEx frame
is the first message sent on bind and on rebind, that absent `initSysEx` sends
nothing, and that the schema rejects malformed frames. AC-7 is verified manually
on hardware (cannot be covered by the emulator).

## Technical Decisions

| Decision                                                     | Rationale                                                                                             | Alternative considered                            | Trade-off                                                    | Date       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| Send init in `DeviceManager.tryBind`, post-open / pre-onBind | Single choke point for initial + rebind; guarantees SysEx is first out, as the Akai protocol requires | Send from engine start path + `onBind` separately | Two call sites; startup animation could race the mode switch | 2026-07-22 |
| Raw `initSysEx` bytes on the device definition               | Engine stays vendor-agnostic; reusable for any board needing a start-time blob                        | Semantic `akaiMode` enum                          | Less validation of intent; but keeps engine dumb and generic | 2026-07-22 |
| Validate frame at load (len 2–64, F0…F7, inner 0–127)        | Shared board files are untrusted; bad data must fail at load, not at the hardware                     | Trust the file / validate only length             | Slightly more schema code                                    | 2026-07-22 |
| Send directly, bypass feedback cache                         | Per-bind handshake, not restorable state; preserves "first message out"                               | Route through `sendToUnit` (cached)               | None meaningful                                              | 2026-07-22 |
| Connect-time only; no periodic re-send                       | Power-cycle = disconnect/reconnect, already re-armed by the bind path                                 | Re-send via PAM-16 heartbeat                      | Would add console-independent traffic for no proven need     | 2026-07-22 |

## Open Questions

- [ ] AC-7/AC-8 specifics (device-knob fixed channel in Mode 2, ring style,
      exact momentary/LED behavior) resolve during the `/build` hardware pass — not
      blocking the design.

## Implementation Notes (post-build, 2026-07-22)

Built to the plan (AC-1…AC-6 + AC-8 mechanism):

- **Schema** — `sysexFrameSchema` + optional `initSysEx` (len 2–64, 0xF0…0xF7,
  inner 0–127) and `initCcSchema` + optional `initCC` (max 64 entries,
  controller/value 0–127, channel optional) in
  `app/src/core/format/device-definition.ts`.
- **Data** — `initSysEx: [240,71,127,41,96,0,4,65,1,1,1,247]` (Mode 1 / `0x41`)
  - `initCC` (16 ring-type CCs, Volume=2) on the bundled APC40 mkII; the 16
    knobs are `motorized: true`; the default mapping's 16 knob assignments use
    `fader-position` feedback. Device `notes` flag Mode-1 fallout as pending verify.
- **Engine** — `DeviceManager.tryBind` sends initSysEx, then initCC, post-open /
  pre-onBind, direct (uncached), with log lines when they fire.
- **Tests** — `device-manager.test.ts` (AC-1/2/3/8-order, EC-2),
  `schemas.test.ts` blocks (AC-6 + initCC validation), `bundled.test.ts`
  assertions (AC-4 `0x41`, AC-8 ring config). `typecheck`, `build`, and the
  Vitest suite pass (447) **except one pre-existing unrelated failure**:
  `bundled.test.ts` PAM-19 AC-4 expects `apc-mini-default-1` status `tested` but
  it is `community` (commit fe65982) — not touched by this feature.

**Mode history:** built as Mode 1 (`0x41`) → briefly Mode 2 (`0x42`) for the
rings → **reverted to Mode 1** (final): Mode-1 rings are board-rendered but
host-updatable, so AC-8 works while local knob turns still update the ring
instantly.

**Hardware findings so far (2026-07-22, user's APC40 mkII in Mode 1):**

- **Ring feedback works** — the knobs light up with the echoed values (AC-8
  partially confirmed on hardware).
- **Activator/Track-Select swap (all tracks):** hardware sends Activator on
  0x33 (51) and Track Select on 0x32 (50) — the protocol doc has them reversed.
  Verified on track 1, user confirmed the swap applies to all 8; adopted for
  channels 1–8 in the bundled device (2026-07-23).
- **Feedback toggles (user decision 2026-07-23):** the bundled APC40 mapping
  ships `sendColors: true`, `sendNames: false`, `resendButtons: false`,
  `enableTimecodeSend: false` — only colours flow from the console.
- **Master button** (`button-1`): hardware-verified as note 80 / channel 1;
  adopted.
- **Mapping reshaped per user:** bank-select arrows → QK UP/DOWN/PREV/NEXT
  (fixture-select navigation, was PAGE_UP/PAGE_DOWN); the 8 device knobs + the
  8-button block (device-left/right, bank-left/right, device-onoff, device-lock,
  clip/device-view, detail-view) → X-key executors **291–298** (knob i and
  button i pair on the same executor), buttons with on-off LED feedback.

**AC-7 remains open** — activator/track-select swap on tracks 2–8, knob channel
in Mode 1, momentary behavior, and full LED verification. Status stays
**Building** until verified. The user's local shadows (mapping shadow + device
copy) were merged and moved to the userData backup folder so the bundled files
take effect.
