# PAM-22 — Review

**Verdict:** Approved (no Critical/High).

## AC verification

| AC | Result | Evidence |
| -- | ------ | -------- |
| AC-1 delete user mapping | ✅ | `catalog-delete.test.ts`: user mapping deleted → gone from `entries()`. |
| AC-2 delete user board | ✅ | user board (once unreferenced) deleted → gone from `boards()`. |
| AC-3 bundled untouchable | ✅ | `deleteMapping("test-map")` / `deleteDevice("test-board")` → `{error}`; UI only renders Delete for `origin === "user"`. |
| AC-4 refuse referenced board | ✅ | `deleteDevice("u-board")` while `u-map` references it → error `/still used by/`; succeeds after the mapping is deleted. |
| AC-5 confirm + drop active | ✅ | `BoardsView` guards each delete with `window.confirm`; `App.deleteMapping` filters the id out of `draft.activeMappings`. |
| unknown id | ✅ | returns `mapping/board "…" not found`. |

## Code review

- Deletes resolve the file only via the catalog's own source maps → never an
  arbitrary path from the renderer. Origin guard is main-side (defensive), not
  just hidden in the UI.
- `deleteDevice` reference guard prevents orphaning mappings (they'd otherwise
  load as invalid). Board images (PAM-21) left in place by design.
- App refreshes via `getSnapshot` + `adoptEditorSnapshot` (same pattern as
  duplicate/import); active-mapping cleanup stays in the draft (user saves).
- 380/380 tests, typecheck + production build green.

## Notes / parked

- Permanent delete (no trash/undo) — the confirm dialog is the guard (spec Out
  of Scope). Bulk delete not included.
