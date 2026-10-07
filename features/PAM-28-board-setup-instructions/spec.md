# PAM-28 — Per-board setup instructions in the add-device flow

> Lite spec, written inline during build (2026-07-27).

## Why

Some boards need a hardware-side step before a definition works — the X-Touch Compact must be switched into MC mode (power-on button hold), the X32 needs its DAW Remote configured. Users picking such a board in the app currently have no way to learn this without reading JSON notes. A short, user-facing instruction shown at pick time closes that gap.

## Acceptance Criteria

- **AC-1** Device definitions accept an optional `setupInstructions` string (plain text, newline = step, bounded at 1000 chars); absent = no UI shown. Additive with no format-version bump — existing files load unchanged.
- **AC-2** When a board with `setupInstructions` is picked in the add-device dialog, the instructions render as a highlighted notice above that board's mapping list (one line per step).
- **AC-3** The bundled `x-touch-compact-mc` board carries the MC-mode power-on instructions.
- **AC-4** Boards without the field render exactly as before (no empty notice).

## Out of Scope

- Showing the instructions anywhere else (Devices list, editor, wizard) — can be layered on later.
- Markdown/links in instructions — plain text only.
- Backfilling `setupInstructions` onto the other bundled boards (tracked in `docs/ideas.md`).
