# PAM-31 — Configurable encoder-resolution factor on fine/rough modifiers

> Lite spec, written inline during build (2026-07-27).

## Why

v1's encoder modifiers were fixed: Fine = ÷10, Rough = ×10. For attribute work on the X-Touch Compact's relative encoders, gentler steps (÷2 / ×2) are often the right resolution — and a board has enough buttons to offer several resolutions side by side.

## Acceptance Criteria

- **AC-1** The modifier action accepts an optional `factor` (positive, ≤1000); absent = 10, so every existing mapping behaves exactly as before (additive, no format-version bump).
- **AC-2** While `encoderFine`/`encoderRough` is active, attribute changes divide/multiply by the **active** factor (set by the button that activated the modifier).
- **AC-3** Several buttons may carry the same modifier with different factors: pressing another factor **switches the resolution and keeps the modifier on**; pressing the button with the active factor toggles the modifier off.
- **AC-4** LED feedback shows the active resolution: exactly the button whose factor is active is lit; all other fine/rough buttons are off (refreshed across all units on every toggle).
- **AC-5** `x-touch-compact-relative-1` uses it: Layer-A side buttons = Highlight | Clear (row 1), Fine ÷2 | Rough ×2 (row 2), Page Down | Page Up (row 3); Layer B keeps the QuickKey block. _(Delta 2026-07-27: was four resolution buttons ÷2/×2/÷10/×10 — two suffice, Highlight/Clear stay.)_

## Out of Scope

- Exposing `factor` in the visual mapping editor UI (hand-edit / bundled files only for now — editor support can follow).
- Factors on executor-targeted encoders (the accumulator path) — v1 semantics apply modifiers to attribute encoders only.
