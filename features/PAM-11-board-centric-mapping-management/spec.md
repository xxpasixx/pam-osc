# PAM-11: Board-centric mapping management

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17 (delta: AC-8 board search)

## Why

The Setup and Boards views hide the core data-model relationship (one board → many mappings): "Add device" is a flat picker across all mappings, the Boards tab shows boards with no connection to their mappings, and there is **no way to create a new mapping at all** — a freshly built custom board can never be activated (only Duplicate and v1 import exist). This feature makes the board the anchor everywhere a mapping is chosen or managed.

## Dependencies

- PAM-1 (device & mapping file format)
- PAM-3 (setup & settings UI)
- PAM-6 (visual mapping editor)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given the Boards tab, when I look at a board entry, then I see the mappings belonging to that board (bundled + user, with origin badges), and a board without mappings shows an empty state instead of nothing.
- [ ] **AC-2** — Given a board in the Boards tab, when I click "New mapping" and enter a name, then an empty user mapping for that board is created (unique id derived from the name, all controls unassigned) and opens directly in the mapping editor.
- [ ] **AC-3** — Given a board's mapping list in the Boards tab, when I pick a mapping, then I can open it in the mapping editor from there (Edit).
- [ ] **AC-4** — Given Setup → "Add device", when the dialog opens, then I first pick a **board** and then one of **that board's mappings** — the flat all-mappings list is gone.
- [ ] **AC-5** — Given an active device row in Setup, when I open its mapping dropdown, then I see only mappings of the same board and can switch; the chosen ports stay, and the switch takes effect with the normal Apply transaction.
- [ ] **AC-6** — Given any of the new views, when a mapping file is invalid, then it appears greyed out with its validation error (same behavior as the current Add-device dialog), never silently hidden.
- [ ] **AC-7** — Given Setup → "Add device" step 2, when I click "+ New mapping (empty)", then an empty user mapping for the chosen board is created and opens in the mapping editor; after saving, it is available for activation like any other mapping.
- [ ] **AC-8** — Given the Boards tab, when I type into the search field at the top, then only boards whose **name or id** matches (case-insensitive) remain visible — the search never matches mapping names; clearing it shows all boards again, and no match shows an empty state. _(Delta 2026-07-17: user request.)_

## Out of Scope

- Deleting mapping files from the UI (doesn't exist today; separate decision)
- Mapping list inside the board editor sidebar (deliberately not chosen — Boards tab + Setup carry the hierarchy)
- Mapping export/import for sharing (PAM-7)
- Moving a mapping to a different board

## Edge Cases

- **EC-1** — Switching the mapping in the Setup dropdown while the engine runs behaves like any other Setup change: nothing happens until Apply; the rollback rules of the apply transaction hold.

## Open Questions

- [x] Should "Add device" step 2 also offer "+ New mapping (empty)" as a shortcut? — **Yes** (user, 2026-07-17) → AC-7.

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Hierarchy shown in Setup (dropdown per device) **and** Boards tab (list per board), not in the editor | User interview — both recommended options chosen | 2026-07-17 |
| New mapping starts empty; Duplicate remains the template path | Empty canvas is honest; copying stays one click away | 2026-07-17 |
| Own ticket instead of PAM-6 delta | Touches Setup (PAM-3) *and* editor entry (PAM-6) plus a new create-flow | 2026-07-17 |
| "+ New mapping" shortcut also in the Add-device dialog (AC-7) | One less tab switch on the happy path from "board built" to "device active" | 2026-07-17 |
