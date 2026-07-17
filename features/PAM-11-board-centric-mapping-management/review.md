# Review — PAM-11

**Reviewed:** 2026-07-17
**Where tested:** local — Vitest suite (232 tests incl. real-folder catalog tests) + typecheck + adversarial code trace; UI ACs verified by code trace (the running app instance held the single-instance lock, so no live click-through — the 60-second manual pass below is recommended before /ship)
**Reviewer:** Review (AI) — main reviewer + two parallel lanes (security/code, regression)

### Acceptance Criteria

- [x] AC-1: Boards tab lists each board's mappings (bundled + user, origin badges) with an empty state — pass (code trace: `BoardsView` groups `catalog` by `deviceDefinitionId`)
- [x] AC-2: "New mapping" creates an empty user mapping and opens the mapping editor — pass (main side test-verified: unique id, `assignments: []`, loader-valid; UI wiring code-traced)
- [x] AC-3: Mappings openable in the editor from the board list — pass
- [x] AC-4: "Add device" is two-step (board → that board's mappings); flat list gone — pass
- [x] AC-5: Setup row mapping dropdown offers same-board mappings only; ports stay; normal Apply transaction; duplicate activation blocked (UI-disabled + `validateDraft` backstop, test-verified) — pass
- [x] AC-6: Invalid mapping files greyed out with their error in both new views — pass
- [x] AC-7: "+ New mapping (empty)" in Add-device step 2 → create → editor; after save activatable — pass

### Edge Cases

- [x] EC-1: Mapping switch while the engine runs stays draft-only until Apply; apply-transaction rollback rules unchanged — pass (code trace + existing apply-settings tests)

### Code Review

- Contract additions are additive (`CatalogEntry.deviceDefinitionId`); typecheck confirms every construction/consumption site including fixtures. No dead code; the `fileExists` loop and pre-write `mappingSchema.safeParse` are justified defenses, not gold-plating.
- Regression lane: full suite green; PAM-3 add/duplicate/remove/apply, PAM-5 import, PAM-6 editor open/save, engine (PAM-2) all traced clean. `CatalogEntry` change is renderer/IPC-only — the engine never reads it.
- Persisted duplicate-id edge (hand-edited settings.json): engine still auto-starts as before; the new rule only blocks the next Save until the user fixes the row — guided fix, not a broken state.

### Security (red team)

- [x] Path traversal via mapping `name` impossible — filename derives from `makeUniqueId` (`[a-z0-9-]` only); probed live with `../../../etc/passwd` → `etc-passwd`, unicode/emoji/dots neutralized; locked in as a catalog test
- [x] No file clobbering: id collision loop covers loaded ids (bundled + user) AND files on disk; a name colliding with a bundled id gets a suffix, never a shadow
- [x] IPC handler validates input types; unknown board rejected before any FS access; renderer is treated as untrusted
- [x] Injection contained (JSON.stringify + React escaping); no secrets/PII; nothing sensitive in URLs (desktop IPC only)
- [ ] BUG-1 (Low): raw FS errors from `createMapping` leak the absolute temp path to the renderer notice

### E2E (critical journeys, optional)

- Status: **not run** — no UI E2E harness exists in the repo (engine E2E runs in Vitest). Recommended manual pass before /ship: Boards tab → group + New mapping; Add device → two-step + "+ New mapping (empty)"; Setup row → switch mapping → Save & apply.

### Bugs

**BUG-1: createMapping doesn't catch FS errors — absolute path leaks into the error notice**

- **Severity:** Low
- **Steps to reproduce:** 1. Make the user mappings dir unwritable (or use a >255-char name → ENAMETOOLONG). 2. Create a new mapping.
- **Expected / Actual:** Friendly error notice / raw Node error incl. `…/mappings/<id>.json.tmp` path surfaces in the notice. Inconsistent with `duplicate()`'s caught reads. (`app/src/main/catalog.ts` createMapping)

**BUG-2: No length cap on the mapping name → filesystem error instead of validation**

- **Severity:** Low
- **Steps to reproduce:** Create a mapping with a ~300-char name.
- **Expected / Actual:** Inline "name too long" / ENAMETOOLONG at write time (feeds BUG-1). (`catalog.ts` / `converter.ts` makeUniqueId)

**BUG-3: Create-failure loses the typed name — dialog closes before the result**

- **Severity:** Low
- **Steps to reproduce:** Trigger any createMapping failure from the Add-device dialog.
- **Expected / Actual:** Dialog stays open with the name / dialog already closed, only a notice remains; name must be retyped. (`App.tsx` createMappingAndEdit calls `setDialogOpen(false)` before awaiting)

**BUG-4: Mapping switch remounts the Setup row (focus loss)**

- **Severity:** Low
- **Steps to reproduce:** Switch a row's mapping in the new dropdown.
- **Expected / Actual:** Select keeps focus / row remounts because the key includes the mutable `mapping.id`. Values survive; cosmetic. (`DevicesSection.tsx` row key)

**BUG-5: Duplicate-active error renders on both affected rows**

- **Severity:** Low
- **Steps to reproduce:** Only reachable via hand-edited settings.json (UI disables duplicates): same id in two rows.
- **Expected / Actual:** Error on the second row / both rows show it — `field: mapping:<id>` is id-keyed, not row-keyed. Backstop-only, harmless. (`validate.ts` + `DevicesSection.tsx`)

**BUG-6: Emoji/special-character-only names get the id `imported-v1-mapping`**

- **Severity:** Low
- **Steps to reproduce:** Create a mapping named `🎹` (or `###`).
- **Expected / Actual:** Neutral fallback id like `mapping` / misleading `imported-v1-mapping` (shared fallback in `makeUniqueId`). Name itself is stored correctly; id/filename only.

**BUG-7: Invalid/orphaned active row has a dead-end mapping dropdown**

- **Severity:** Low
- **Steps to reproduce:** Activate a mapping, delete/corrupt its file, reopen Setup.
- **Expected / Actual:** Offer valid alternatives or a hint / dropdown holds only "<id> (invalid)"; recovery is Remove + re-add (same as pre-PAM-11, but the new affordance looks usable and isn't).

**BUG-8: "New board" form doesn't reset width/height (and name on Cancel)** — pre-existing PAM-6 behavior carried through the rewrite

- **Severity:** Low
- **Steps to reproduce:** Open New board, change width, Cancel, reopen.
- **Expected / Actual:** Fresh defaults / stale values reappear. (`BoardsView.tsx`)

### Verdict

- **ACs:** 8/8 passed (7 AC + 1 EC) · **Bugs:** 8 (0 Critical / 0 High / 0 Medium / 8 Low) · **Security:** pass (2 Low robustness notes: BUG-1/BUG-2)
- **Ship:** YES — all ACs pass, no Critical/High; the Low findings are polish (error handling, cosmetics) and none blocks the core flows.
