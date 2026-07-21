# PAM-21 — Design

## Resolution: convention + optional override, served as a data URL

The image is a **hardware fact of the board**, so it lives next to the board
definition. The engine resolves it; the renderer never touches the filesystem.

- **Schema** (`device-definition.ts`): add optional `image?: string`, constrained
  to a safe basename with an image extension — `^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$`.
  The regex alone closes traversal at the data layer (no `/`, `\`, `..`). Absent
  → convention lookup (AC-1/AC-2).
- **Catalog** (`catalog.ts`, Electron-free, already does fs): add
  `async deviceImage(id): Promise<string | null>`. Resolve `imagesDir =
  <dirname(deviceFile)>/images`. Candidates: `[device.image]` if set, else
  `<id>.{png,jpg,jpeg,webp}`. For each, **guard `basename(name) === name`**
  (belt-and-braces beyond the schema), read the file, return
  `data:<mime>;base64,<…>`. First hit wins; nothing found → `null`. Unreadable /
  missing → `null` (never throws). MIME by extension (AC-3/AC-4).
- **IPC**: `getDeviceImage(id) → string | null` (`pam:getDeviceImage`); preload
  passes through; main handler calls `catalog.deviceImage(id)`.
- **Renderer**: a small `BoardThumb` component fetches the data URL once per
  board (effect keyed by board id) and renders `<img>` or a `.board-thumb--empty`
  placeholder. Used in `BoardsView` (board-group header) and the
  `AddDeviceDialog` board picker.

## Why data URL over IPC (not a custom protocol / static serve)

Renderer runs with context isolation; it can't read arbitrary FS paths, and the
image set is dynamic/user-supplied (not Vite-bundled). A one-shot IPC returning a
base64 data URL fits the existing `window.pamOsc` invoke pattern with zero new
protocol registration. Board thumbs are small; README asks for ≤256 px / <150 KB.

## Assets / packaging

`resources/devices/images/` ships (electron-builder `extraResources: ../resources
→ resources` copies it recursively). It contains **only** a `README.md`
(licence rule + `<board-id>.png|jpg` naming + size). User boards resolve against
the user devices folder's `images/` subdir.

## Implementation notes / parked

- Bundled device JSONs are **not** edited — convention means dropping
  `resources/devices/images/<id>.png` is enough (e.g. `apc-40-mk2.png`).
- No caching layer: the fetch is cheap and per board; if the Boards list ever
  grows large, add a main-side LRU (parked).
