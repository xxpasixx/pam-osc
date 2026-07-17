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

## Implementation notes — Low-bug fix round (2026-07-17)

- **BUG-1:** `createMapping` wraps the write — friendly notice with the fs error code, no absolute path leak.
- **BUG-2:** 120-char name cap in `createMapping` (backstops IPC callers) + `maxLength` on both New-mapping inputs.
- **BUG-3:** the Add-device dialog closes only after a successful create — failures keep it open with the typed name.
- **BUG-4:** Setup rows key by position (`index`), not the mutable mapping id — switching a mapping no longer remounts the row.
- **BUG-6:** `makeUniqueId` takes a fallback (default `"mapping"`); the v1 import keeps `"imported-v1-mapping"`.
- **BUG-8:** "+ New board" resets name/width/height on open.
- **BUG-9 (delta re-review):** a real bound-but-unplugged unit stays selected and shows "(not connected)"; only the never-activated placeholder (board name) falls back to the first real input. Test/Learn toggle disabled while the shown port isn't connected. Also tidied (PAM-6 note): toggling Indicate off clears pending flash timers.
- **Parked:** BUG-5 (duplicate-active error renders on both rows — backstop only, reachable solely via hand-edited settings.json) and BUG-7 (recovery affordance for invalid active rows — needs a UX decision with the maintainer).
- **Verified:** 234/234 Vitest (1 new: name cap + neutral fallback), typecheck clean, production build green.
