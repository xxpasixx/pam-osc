# PAM-10 — Colored button feedback (RGB pads reflect MA3 sequence colour)

**Status:** Building
**Depends on:** PAM-2, PAM-16

## Why

RGB-capable pads (the APC40 mkII clip grid) should mirror the **live GrandMA3
executor appearance colour** instead of a single fixed colour, so the control
surface reflects the running sequences' colours. The engine already receives
per-executor colour from the plugin (`/…Color<exec>`, gated by PAM-16
`sendColors`) but only routes it to X-Touch scribble-strip displays — never to
button LEDs. This adds a colour path for `velocity-colors` button LEDs.

## Acceptance Criteria

- **AC-1** A new `rgb-color` button feedback maps the executor's MA3 appearance
  colour (the plugin's `r;g;b;a` string) to the **nearest colour in the board's
  LED palette** and lights the pad in it.
- **AC-2** The pad shows the colour while its executor is **active/running** and
  turns **off** when it is not (colour + running state combined per executor).
- **AC-3** Device definitions declare their LED palette by name; the APC40 mkII
  ships its full **128-entry** palette. Boards without a palette / single-colour
  boards are unaffected; existing files load unchanged (no format-version bump).
- **AC-4** The APC40 mkII default mapping's **clip grid** uses `rgb-color`
  feedback (Scene Launch stay fixed-colour — they trigger global functions, not
  executors, so they have no MA colour source).
- **AC-5** Colour only flows for executors already in the plugin watch-set with
  `sendColors` enabled (reuses the PAM-16 handshake) — **no new console
  traffic**, no plugin change.

## Out of Scope

- Colour on single-colour LED boards (APC mini / Launchpad palettes) — the
  mechanism is generic, but only the APC40 mkII palette ships here.
- RGB blink/pulse behaviours (solid Primary Colour only; channel 0).
- Dim "assigned-but-idle" colour tiers — idle pads are simply off.
