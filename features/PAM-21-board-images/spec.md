# PAM-21 — Board images (photo per board)

**Status:** Building
**Depends on:** PAM-1, PAM-6, PAM-11

## Why

In the Boards list (and the add-device picker) a board is only identified by
name/id. A small **photo of the hardware** lets you see at a glance which board
it is. Images are **user-supplied and must be licence-clean** (own photos, or
with the manufacturer's explicit permission) — the repo is public GPL-3.0, so
manufacturer product photos must **not** be bundled. The app ships **no** images;
it provides the mechanism and shows a placeholder until the user drops files in.

## Acceptance Criteria

- **AC-1** A board can have an image, discovered by **convention**: a file
  `images/<board-id>.{png,jpg,jpeg,webp}` next to the board's definition
  (`resources/devices/images/…` for bundled, the user devices folder for user
  boards). No JSON editing needed — dropping a correctly-named file is enough.
- **AC-2** A device definition may set an explicit `image` override (a plain
  filename with an image extension); it wins over the convention. Additive &
  optional → existing files load unchanged (no format-version bump).
- **AC-3** The Boards list shows the board's image (and the add-device board
  picker); when no image exists, a neutral **placeholder** shows instead — never
  a broken image.
- **AC-4** Image lookup is **path-traversal safe**: only a bare basename with an
  allowed image extension is ever read, always from the board's `images/`
  folder; anything else is ignored (no read outside that folder).
- **AC-5** The app ships **no** third-party images; `resources/devices/images/`
  carries only a README stating the licence rule + naming + size guidance.

## Out of Scope

- Bundling any manufacturer/stock photos (licence).
- In-app image upload/cropping UI — the user places files in the folder.
- Per-mapping images (this is per board/hardware).
- Auto-generated schematic thumbnails (was the alternative; maintainer chose
  real photos).
