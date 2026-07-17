# PAM-6: Visual Mapping Editor

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17

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

| Decision                                                     | Rationale                                                                     | Date       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------- |
| Mapping editor and device-definition editor together in PAM-6 | Shared UI foundation (board rendering); matches the PRD roadmap entry         | 2026-07-17 |
| MIDI learn plus manual entry                                 | Usability win; manual entry as fallback when no board is connected             | 2026-07-17 |
| Bundled files are read-only, copy-on-edit                    | App updates never overwrite user customizations; clean reset stays possible   | 2026-07-17 |
| Save → engine reload instead of hot-apply                    | Simple and predictable; live editing would add significant engine complexity  | 2026-07-17 |
