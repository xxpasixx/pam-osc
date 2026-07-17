# PAM-6: Visual Mapping Editor

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17 (delta: AC-8…AC-11 from first user feedback)

## Why

Until now, mappings and device definitions can only be changed by hand-editing JSON (PAM-1 AC-6 — explicitly a stopgap). The visual editor brings both into the app: reassigning controls on the 2D board layout and creating custom board types — the prerequisite for community sharing (PAM-7) and the main reason users no longer need a terminal or text editor.

## Dependencies

- PAM-1 (device & mapping file format)
- PAM-3 (settings UI hosting the editor)

## Acceptance Criteria

- [ ] **AC-1** — Given a mapping is selected, when the editor opens, then it renders every control of the device definition at its 2D position/size, shows each control's current assignment, and clicking a control selects it for editing.
- [ ] **AC-2** — Given a selected control, when the user assigns an MA3 action (executor, command, QuickKey, attribute) and a predefined feedback type, or removes the assignment, then saving writes a valid mapping file (PAM-1 schema) and the engine reloads the mapping — the change is live on the device afterwards.
- [ ] **AC-3** — Given a device definition in edit mode, when the user adds, moves, resizes, or deletes controls (faders, encoders, buttons) on the 2D layout, then saving writes a valid device definition file that the existing loader loads.
- [ ] **AC-4** — Given the control editor and a connected board, when the user activates "Learn" and moves/presses a physical control, then its type, note/CC number, and channel are captured; manual entry remains possible at all times (including with no board connected).
- [ ] **AC-5** — Given a bundled device definition or bundled mapping, when the user edits it, then the bundled file stays untouched and a user copy with a new name/ID is created and appears in the lists; app updates never overwrite user files.
- [ ] **AC-6** — Given the device list, when the user creates a new device definition (name, board dimensions), then an empty layout starts on which controls are added via AC-3/AC-4 — saved as a user file and immediately selectable for mappings.
- [ ] **AC-7** — Given an invalid state (duplicate MIDI address on the same board, control without an address), when the user tries to save, then the editor shows the error at the affected control and writes nothing; when the user deletes a control that is assigned in existing mappings, then the editor warns beforehand, listing the affected mappings.
- [ ] **AC-8** — Given the app, when the user opens the new "Boards" tab (next to Setup and Status), then all device definitions are listed with bundled/user badges, Edit ("Edit a copy" on bundled) and "New board" — board management no longer lives inside the Devices section.
- [ ] **AC-9** — Given a device definition whose encoder declares an integrated push button (PAM-1 AC-7), when it renders in the 2D view, then ring and center cap appear as one combined component; clicking the ring selects the rotate function, clicking the cap the push function; in mapping mode both functions are independently assignable (action, feedback incl. push LED), and in board mode the push address (incl. Learn) and push LED capability are edited on the encoder itself.
- [ ] **AC-10** — Given the bundled X-Touch Compact definition, when it renders in the editor, then layer-A and layer-B controls no longer fully overlap — the B layer is visibly offset as its own area and every control is clickable.
- [ ] **AC-11** — Given the editor and a connected unit, when the user enables the Test/Indicate toggle and operates physical controls, then the matching controls light up briefly in the 2D view (mapping and board mode); the tap is view-only — it never triggers MA3 actions beyond what the running engine already does.

## Out of Scope

- Export/sharing UX — PAM-7
- Configuring colored button feedback — PAM-10
- Hot-apply while editing (changes take effect on save — see Decision Log)
- Undo/redo history — dirty state + discard covers the basic need; revisit if demanded

## Edge Cases

- **EC-1** — Closing the editor with unsaved changes prompts (save / discard / cancel) — never a silent loss.

## Open Questions

- None

## Decision Log

### Product Decisions

| Decision                                                                | Rationale                                                                                                                            | Date       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Mapping editor and device-definition editor together in PAM-6           | Shared UI foundation (board rendering); matches the PRD roadmap entry                                                                | 2026-07-17 |
| MIDI learn plus manual entry                                            | Usability win; manual entry as fallback when no board is connected                                                                   | 2026-07-17 |
| Bundled files are read-only, copy-on-edit                               | App updates never overwrite user customizations; clean reset stays possible                                                          | 2026-07-17 |
| Save → engine reload instead of hot-apply                               | Simple and predictable; live editing would add significant engine complexity                                                         | 2026-07-17 |
| Boards management moves to its own tab (delta)                          | User feedback: separate managing board types from activating devices                                                                 | 2026-07-17 |
| Push-encoder combos live in the file format, not rendering-only (delta) | One physical knob = one control (user decision); pre-release window makes schema evolution cheap — format change owned by PAM-1 AC-7 | 2026-07-17 |
| X-Touch Compact layer B offset in bundled data (delta)                  | Fastest fix for the full occlusion; a layer toggle in the view is parked in ideas                                                    | 2026-07-17 |
| Indicate mode = view-only MIDI tap in the editor (delta)                | Verify mappings by pressing hardware, zero side effects                                                                              | 2026-07-17 |
