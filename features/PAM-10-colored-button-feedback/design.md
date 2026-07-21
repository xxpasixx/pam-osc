# PAM-10 — Design

## Palette: named, in an engine registry (not embedded per file)

A board's LED palette is a **hardware fact shared by every unit and mapping** of
that board, and the APC40 mkII palette is 128 entries — embedding it in each
device file is noise and invites drift. So the device declares
`ledPalette?: string` (a name) and the engine holds the tables:

- `device-definition.ts`: add optional `ledPalette: z.string()` at the device
  level (additive, default absent → no colour mapping; existing files unchanged,
  AC-3).
- `led-palette.ts` (new, `core/engine`): `LED_PALETTES: Record<string, PaletteEntry[]>`
  with `"apc40-mk2"` = the 128 velocity→RGB entries from the APC40 Mk2
  Communications Protocol v1.2, plus `nearestPaletteVelocity(name, rgba)`.

`nearestPaletteVelocity`: black or `alpha === 0` → `0` (off); otherwise the
velocity of the min-Euclidean-distance palette entry (velocity 0 excluded from
the search). Unknown/absent palette → `0` (rgb-color degrades to "off", never
throws). Same shape as the existing `nearestDisplayColor`.

## Feedback type `rgb-color`

`mapping.ts` feedbackSchema gains `{ type: "rgb-color", offValue?: 0..127 }`
(offValue default 0). No colour param — the colour comes live from MA3.

## Combining colour + running state (AC-2)

The pad's velocity depends on **two** async inputs: `/…Button<exec>` (running)
and `/…Color<exec>` (colour). We keep a tiny per-unit map keyed by executor:

```
unitRuntime.rgb: Map<executor, { running: boolean; colorVelocity: number }>
```

- `feedback-router.handleButton`: for `rgb-color` entries, update `running`, then
  render (non-rgb entries keep calling `sendButtonFeedback` as today).
- `feedback-router.handleColor`: today only feeds display strips; add a branch
  that, for `byExecutor` **button** entries with `rgb-color` feedback, maps the
  colour via the device palette into `colorVelocity`, then renders.
- Render (`feedback-out.sendRgbColorFeedback`): velocity = `running ?
  colorVelocity : offValue`; sent as a note on the control's channel (channel 0 =
  APC Primary-Colour solid; the grid controls resolve to channel 1 = wire 0).

Idle/until-first-message: the map defaults `{running:false, colorVelocity:0}` →
pad off, which is the correct dark state. On rebind the normal `cache` replay
restores the last sent note (no special-casing).

## Scope of the wiring (AC-4)

Only the APC40 mkII **clip grid** gets `rgb-color`. Scene Launch stay fixed
colours: they fire GO/PAUSE/etc. (not executors), so there is no per-executor MA
colour to reflect. Single-colour rows (activator/solo/…) stay `on-off`.

## AC-5 / no console change

The grid executors are already in each mapping's assignments, so the PAM-16
config handshake already puts them in the plugin watch-set and `sendColors` is on
by default — the `/…Color<exec>` messages already arrive. Nothing on the console
side changes; we only stop throwing the colour away for buttons.

## Implementation Notes

- `UnitRuntime` gains `rgb: Map<number, {running,colorVelocity}>`, initialised
  `new Map()` in `DeviceManager` beside `colors`.
- `nearestPaletteVelocity` reuses the `Rgba` type + parse from `v1-compat.ts`.
- Decision to verify on hardware: idle pads are OFF (not dim). If Pascal wants
  assigned-but-idle pads dimly lit, that's a follow-up (needs dim-tier palette
  pairing) — parked, not built.
