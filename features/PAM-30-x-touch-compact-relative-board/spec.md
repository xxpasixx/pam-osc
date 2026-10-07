# PAM-30 — Split the relative X-Touch Compact config into its own board

> Lite spec, written inline during build (2026-07-27).

## Why

One device definition describes ONE hardware configuration (precedent: `x32-compact-cc`, `x-touch-compact-mc`). The standard `x-touch-compact` board violated that by carrying abs/rel twin controls (`knob-N-abs` + `knob-N-rel`) for the same physical side knobs — a documented wart from PAM-1. A unit re-configured to relative encoders via the X-TOUCH Editor is a different configuration and gets its own board, which also gives PAM-28 setup instructions a natural home.

## Acceptance Criteria

- **AC-1** A new bundled board `x-touch-compact-relative` models side knobs 9–16 as full-size push-encoders (relative CC 18–25, scheme 1..7 CW / 121..127 CCW, integrated push notes 8–15); everything else matches `x-touch-compact`.
- **AC-2** The standard `x-touch-compact` board loses its `knob-N-rel` twin controls; the layer-A side-knob pushes survive as standalone `knob-N-push` buttons (notes 8–15). Control ids used by `x-touch-compact-default-1` keep working.
- **AC-3** `x-touch-compact-relative-1` targets the new board (`knob-N-rel` → `knob-N`); all assignments carry over unchanged.
- **AC-4** The new board carries PAM-28 `setupInstructions` for configuring relative mode via the X-TOUCH Editor (incl. pointer to the repo preset `mappings/xTouchCompact/xTouchCompactRltv1LayerA.bin`).
- **AC-5** v1 import: `xTouchCompactRltv1.json` converts fully against the new board (converter fixture updated).
- **AC-6** _(Delta 2026-07-27)_ Layer B models the knob rotation on both boards: `knob-N-b` absolute/motorized on CC 37–52 (chart-derived from the consistent layer offsets, **to verify on hardware**), with the existing `knob-N-push-b` buttons shrunk into them. _(Delta 2026-08-01: on the RELATIVE board the ENTIRE layer B is relative now — `knob-1-b`…`knob-16-b` (CC 37–52) are relative encoders (relative2 scheme like layer A side knobs), matching the maintainer's X-TOUCH-Editor preset which sets all 16 layer-B encoders relative; pushes stay the separate `knob-N-push-b` buttons, the mapping keeps the executor targets (191–198 side, 410–417 top — the top row also gets the relative /Encoder message) with feedback none, setup instructions gained the Dump-B step. Layer A keeps absolute top knobs 1–8.)_
- **AC-7** _(Delta 2026-07-27)_ The side-button block is re-assigned in all three Compact mappings (default-1 and relative-1 on both layers, MC playback): Highlight | Clear / Prev | Next / Page Down | Page Up as QuickKeys.
- **AC-8** _(Delta 2026-07-27)_ Both standard-mode Compact boards ship with `resendFeedback: true` (PAM-25): the board clears button LEDs locally on release, so the app replays its feedback cache periodically. The MC board does not need it (host-controlled LEDs).

## Out of Scope

- Shipping the X-TOUCH Editor preset files inside the app (parked in `docs/ideas.md` — presets/ folder idea).
- Renaming the `knob-N-abs` ids on the standard board (would break existing mappings for no gain).
