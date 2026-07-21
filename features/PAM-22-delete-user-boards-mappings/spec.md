# PAM-22 — Delete user boards & mappings

**Status:** Building
**Depends on:** PAM-11, PAM-6

## Why

Experimenting in the editor produces local (user) boards and mappings — copies,
"New mapping" drafts, imported files. There was no way to remove them; the
Boards list only grew. Users need to delete their **own** local files again.
Bundled boards/mappings are templates and must stay untouchable.

## Acceptance Criteria

- **AC-1** A user (local, `origin === "user"`) mapping can be deleted from the
  Boards list; its file is removed and it disappears from the catalog.
- **AC-2** A user (local) board can be deleted; its file is removed and it
  disappears from the Boards list.
- **AC-3** Bundled boards/mappings can **never** be deleted — the delete action
  isn't offered for them, and the main process refuses it defensively.
- **AC-4** Deleting a user board is **refused while any mapping still references
  it**, naming the mappings to remove/retarget first (so no file silently turns
  invalid).
- **AC-5** Delete asks for confirmation, and deleting a currently-active mapping
  also drops it from the active list (no dangling row).

## Out of Scope

- Undo / trash (deletion is permanent — the confirm dialog is the guard).
- Bulk delete.
- Deleting the images that belong to a board (PAM-21) — left in place.
