# PAM-10 — Review

**Verdict:** Approved (no Critical/High). Ship gate: on-hardware verification
that the mapped colours read correctly on a real APC40 mkII still pending.

## AC verification

| AC | Result | Evidence |
| -- | ------ | -------- |
| AC-1 nearest-palette mapping | ✅ | `rgb-color-feedback.test.ts`: pure green→21, red→5, blue→45, white→3; near-green (#14D205-ish)→122. |
| AC-2 colour while running, off otherwise; colour+running combined | ✅ | routing test: colour-then-run, live colour change while running, stop→off; order-independent (run-then-colour). |
| AC-3 device declares palette; 128 entries; others unaffected | ✅ | `led-palette.ts` `apc40-mk2` = 128 parsed entries; device `ledPalette` optional (absent→0/off); full suite (incl. APC mini / X-Touch) green. |
| AC-4 grid uses rgb-color | ✅ | `apc-40-mk2-default-1.json` clip grid feedback `{type:"rgb-color"}`; bundled load 0 issues. |
| AC-5 no new console traffic | ✅ | Reuses `/…Color<exec>` the plugin already sends for watched executors (PAM-16 `sendColors`); no plugin change, grid executors already in the watch-set. |

## Code review

- `handleColor` refactor keeps the X-Touch display path byte-identical (colour
  parsed once, display branch unchanged) and adds the button branch; no unit
  without displays is skipped anymore, which is the point. Regression covered by
  the green X-Touch colour tests.
- Malformed colour string → `NaN` distances → nearest stays 0 → pad off
  (graceful, no throw).
- rgb state is per-unit per-executor; two controls on one executor both render;
  on-off buttons are untouched (they never react to `/Color`).
- `sendRgbColorFeedback` reuses `sendToUnit` (cache + rebind replay) → a
  replugged board restores its last pad colours for free.

## Notes / parked

- Idle (assigned-but-not-running) pads are OFF, not dim — deliberate (design).
  A dim-tier variant is a possible follow-up.
- Scene Launch stay fixed-colour (they fire GO/PAUSE/… not executors, so no MA
  colour source) — matches AC-4 scope.
- Colour accuracy on the physical pads is the hardware-only check for Pascal.
