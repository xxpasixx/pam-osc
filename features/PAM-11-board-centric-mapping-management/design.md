# PAM-11: Board-centric mapping management — design notes

> No upfront design was needed (pure UI restructuring on existing format and IPC surfaces).
> This file records the non-obvious implementation choices, per the build workflow.

## Implementation notes (2026-07-17)

- **`CatalogEntry` gained `deviceDefinitionId`** — the one addition the grouping needs everywhere (Boards tab, Add-device dialog, Setup dropdown). Additive, no consumer broke.
- **`Catalog.createMapping(deviceDefinitionId, name)`** (main): writes an empty user mapping — `assignments: []`, id via the same `makeUniqueId` + file-collision loop as the v1 import, belt-and-braces `mappingSchema` check before writing, atomic write.
- **Placeholder ports = board name** (`midiPort.input/output = device.name`): the schema requires a non-empty input, and the bundled mappings follow exactly this convention ("APC MINI"). Setup rebinds on activation (copy-on-activate), so the placeholder never reaches the engine.
- **Duplicate-active-id rule added to `validateDraft`** — the Setup mapping dropdown (AC-5) made "same mapping active twice" reachable; the UI disables those options and the shared validation backstops it (renderer live + main on apply). One existing validate test restructured accordingly (it used a duplicate row to test missing input).
- **Invalid mapping files can't be attributed to a board** (no readable content) — they are listed as a flat greyed-out section: Boards tab bottom + Add-device step 1 (AC-6).
- ~~**Known limitation:** a freshly created mapping's editor Test/indicate listens on the placeholder port (the board name) until the mapping is first activated with real ports.~~ **Fixed same day** (user hit it live): the editor-header Hardware picker now shows in both modes; it defaults to the mapping's port when that unit is connected and falls back to the first real MIDI input otherwise (fresh mapping / unit unplugged). Ports already held by the running engine work via the existing engine tap in midi-learn.
