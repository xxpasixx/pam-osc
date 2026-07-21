# PAM-20 — Signed (two's-complement) relative encoder decoding

**Status:** Building
**Depends on:** PAM-1, PAM-2

## Why

The AKAI APC40 (and other Akai boards) send their endless encoders as a *signed*
relative CC: `1..63 = +1..+63`, `64..127 = −64..−1` (so `0x7F` = −1, one slow
detent left). The engine's only relative decoder (`relativeDetents`) is
range-based and monotonic — it assumes magnitude grows with the CC value inside a
`from..to` window (X-Touch style). That window cannot represent the Akai scheme,
where magnitude *shrinks* as the value rises toward 127. Result: the APC40 mkII
**Cue Level** and **Tempo** knobs cannot be mapped correctly today (a slow left
turn reads as a huge negative jump). This adds a second decode mode so signed
encoders work, and enables the Cue Level → executor mapping the user asked for.

## Acceptance Criteria

- **AC-1** The device format lets an encoder declare its relative decode mode.
  Existing range-based encoder files (X-Touch) load and behave **unchanged**
  (mode defaults to the current range behaviour) — no format-version bump.
- **AC-2** A `signed` encoder decodes: value `1..63` → `+1..+63`, value
  `64..127` → `−64..−1` (`127` → −1, `64` → −64), value `0` → no movement
  (event ignored).
- **AC-3** A `signed` encoder assigned to an executor nudges that executor's
  fader in the correct **direction** and proportional magnitude — a single slow
  detent moves ±1 unit in both directions (not a large jump).
- **AC-4** The bundled APC40 mkII device gains **Cue Level** (CC `0x2F`) and
  **Tempo** (CC `0x0D`) as `signed` encoders; the default mapping binds **Cue
  Level → executor 211**.

## Out of Scope

- Absolute-mode operation of Cue/Tempo (the board can report absolute too — we
  use relative).
- Any relative encoding beyond `range` (existing) and `signed` (new).
- Encoder LED-ring feedback for the APC40 knobs.
