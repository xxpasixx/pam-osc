# PAM-22 — Design

## Where the delete lives

- **Catalog** (`catalog.ts`): `deleteMapping(id)` and `deleteDevice(id)`.
  - Both look the file up via the existing source maps (`sourceById` /
    `deviceSourceById`), so they only ever touch a real loaded file.
  - **Origin guard**: `origin !== "user"` → `{ error }` (AC-3). Bundled files are
    never on disk in a deletable place anyway; the guard is explicit.
  - `deleteDevice` **reference guard** (AC-4): if any loaded mapping has
    `deviceDefinitionId === id`, refuse and list their names.
  - On success: `unlink` the file, `refresh()`, return `{ ok: true }`.
- **IPC**: `deleteMapping` / `deleteDevice` → main calls the catalog and
  `rebuildMenu()` on success (the app menu lists boards/mappings). Preload passes
  through; `PamOscApi` typed `Promise<{ ok: true } | { error: string }>`.
- **UI** (`BoardsView`): a `Delete` button (`.subtle.danger`) rendered **only**
  for `origin === "user"` — per board (header) and per mapping (row). Each goes
  through `window.confirm` first (AC-5).
- **App** (`App.tsx`): `deleteMapping` / `deleteBoard` callbacks call the IPC,
  surface `error` as a notice, else re-`getSnapshot` + `adoptEditorSnapshot`.
  For a mapping, also `updateDraft` to drop it from `activeMappings` so an active
  deletion leaves no dangling row (AC-5).

## Notes

- Deleting a user copy that shadows a bundled mapping (same id) un-shadows the
  bundled one — the natural "reset to bundled". Documented in the method.
- The active-mapping cleanup lives in the draft (dirty → user saves), matching
  the existing duplicate/import pattern; no direct settings write from delete.
- Board images (PAM-21) are intentionally not touched on board delete — cheap to
  leave, and a user may re-create the board. Parked if it ever matters.
