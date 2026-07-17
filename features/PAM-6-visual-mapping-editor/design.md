# PAM-6 — Design

**Date:** 2026-07-17

> The technical design (HOW). Two readers: the PM (approves) and `/build` (implements against it). No code — but implementation-grade precise. The contract (WHAT) lives in `spec.md`.

## Component Structure

PAM-6 adds an editor view to the existing single-page app (PAM-3/PAM-4: tabs "Setup" and "Status"). The editor opens as a full-window view on top of the tabs, with its own header and an explicit close — it is a focused work surface, not a third tab.

```
Renderer (React, MA3 dark theme)
+-- Setup view (PAM-3, extended)
|   +-- Device rows           new per-row action: "Edit mapping" → opens editor
|   +-- Boards manager        new dialog from the devices section: lists all
|                             device definitions (bundled + user) with badge,
|                             actions: Edit · New board · (bundled: "Edit a copy")
+-- Editor view (new, full window)
    +-- Editor header         name being edited, mode badge ("Mapping" or
    |                         "Board"), dirty indicator, Save / Discard / Close
    +-- Board canvas          renders every control of the device definition at
    |                         its 2D position/size (grid units, zoom-to-fit,
    |                         rect/circle shapes, control label + assignment
    |                         summary). Click = select. Board mode adds drag
    |                         (move), resize handles, and delete.
    +-- Inspector panel       right side, shows the selected control:
    |     Mapping mode        action (type + parameters), options, feedback
    |                         (type + parameters, filtered by capabilities),
    |                         "remove assignment"
    |     Board mode          label, type, MIDI address (kind/channel/number)
    |                         with "Learn" button + port picker, position/size/
    |                         shape, per-type capabilities
    +-- Toolbar (board mode)  add control (fader/encoder/button/display),
                              board dimensions
+-- Main process (extended)
    +-- Catalog               + read full file content, save with validation,
    |                         copy-on-edit, retarget, control-usage lookup
    +-- MIDI learn session    one at a time; taps the engine's raw input when
    |                         the port is engine-held, else opens it temporarily
    +-- Engine host           unchanged mechanism: saving a file that an active
                              mapping uses triggers the existing reconfigure
```

## Data Model

**No new entities and no change to `docs/data-model.md`** — the map already states "users add their own via the P1 editor". The editor round-trips the two existing PAM-1 file formats losslessly; unknown-to-the-editor content cannot exist because the PAM-1 schemas reject unknown fields. Details the editor adds on top:

**Editing scope per mode:**

- **Mapping mode** edits exactly: `assignments` (add/change/remove per control), `name`, `notes`. It never edits `midiPort` (PAM-3 owns port binding) or `deviceDefinitionId` (retargeting is a copy-on-edit outcome, below).
- **Board mode** edits exactly: `name`, `notes`, `manufacturer`, `layout` (width/height), and `controls` (add/move/resize/delete; per control: `label`, `type`, `midi` or display `index`, `position`, `capabilities`). It never edits `mode` or `defaultMidiChannel` on existing bundled copies without warning — changing them is allowed but flagged as affecting every control ("advanced" section of the inspector).
- `formatVersion` and `id` are read-only in the editor; `id` is generated (below).

**New control defaults (board mode):** id is generated `<type>-<n>` with the first free `n` (e.g. `button-9`); label empty; MIDI kind `note` for buttons, `cc` for faders/encoders, channel empty (falls back to `defaultMidiChannel`); number empty (**invalid until Learn or manual entry** — AC-7 blocks save); position: a free 1×1 spot in the top-left region, shape `rect` (`circle` selectable); capabilities: fader `motorized: no`, button `led: none`, encoder increment/decrement ranges empty (must be filled — same save rule), display `segments: 7`.

**Geometry rules (board mode):** positions and sizes snap to **0.5 grid units**, minimum size 0.5×0.5; controls must lie fully inside `layout`; enlarging the board is allowed any time, shrinking is blocked while a control would fall outside (error names the control). Overlaps are **allowed** (real boards have dense clusters; only addresses must be unique, not pixels).

**Copy-on-edit (AC-5):** bundled files are never written. "Edit" on a bundled item becomes "Edit a copy":

- The copy gets a **new id** using the PAM-3 suffix convention (first free `<id>-2`, `-3`, … / name " (2)") and `origin: user`. The bundled original stays visible in all lists. Deliberately **no same-id shadowing** (PAM-1 allows it): a shadow would hide the bundled original and silently change every mapping that references the id — a copy keeps both visible and the choice explicit.
- Editing a **user** file (including PAM-3's materialized activation copies and PAM-5 imports) edits it in place — no copy.
- **Retarget prompt (board copies only):** after saving a copy of a bundled definition, the app lists all mappings referencing the original; **user** mappings can be retargeted (rewrite `deviceDefinitionId`) via checkboxes, default unchecked. Safe because the copy started control-id-identical. Bundled mappings are listed greyed out ("activate it first, then retarget") — they stay templates against the original.

**Where files land:** exactly as PAM-1 — user copies in `<userData>/devices/` and `<userData>/mappings/`, atomic write (temp + rename), file name `<id>.json` for new files; existing user files keep their actual path (catalog knows it since PAM-3).

## Behaviors & Access

Everything is local, single user — no access model. Five behavior groups:

### 1. Opening the editor

- "Edit mapping" on a device row → mapping mode for that mapping (active or not). "Edit" in the boards manager → board mode. "New board" → dialog asking name + board width/height, then board mode on an empty layout (AC-6).
- The editor loads the **full file content** via a new query (below) — `CatalogEntry` stays the thin list row. Draft state lives in the renderer until Save, exactly like the PAM-3 settings draft.
- Mapping mode on a mapping whose definition has controls without any assignment renders them dimmed — visible hardware, nothing assigned (AC-1).

### 2. IPC contract (additions to the existing surface)

Queries (renderer → main):

- **getMappingForEdit(id)** — full mapping content + its device definition content + `origin`
- **getDeviceDefinitionForEdit(id)** — full definition content + `origin` + **usage list**: per control id, the names/ids of mappings (bundled and user, active flagged) that assign it — powers the AC-7 delete warning without a second round trip
- **getDefinitionUsage(id)** — mappings referencing a definition — powers the retarget prompt

Commands (renderer → main):

- **saveMapping(draft)** — validate → write → engine reload if active (below); returns ok + refreshed snapshot, or structured errors (per assignment path)
- **saveDeviceDefinition(draft, retargetMappingIds)** — validate → write (copy-on-edit resolved main-side from `origin`) → retarget the listed user mappings → engine reload if any active mapping is affected; same result shape
- **startMidiLearn(inputPortName)** / **cancelMidiLearn()** — session control (group 4)

Events (main → renderer):

- **evMidiLearn** — one per session: `{ captured: kind, channel, number }` or `{ ended: "canceled" | "port-lost" }`

The preload stays a narrow typed surface; every handler keeps the existing sender check.

### 3. Save → validate → reload (AC-2, AC-3, AC-7)

1. **Validate main-side** with the PAM-1 zod schemas **plus editor rules**, all implemented in `core` (pure, renderer reuses them live for inline errors — same pattern as PAM-3 `validate.ts`):
   - Board: no duplicate MIDI address among controls (key: kind + effective channel + number; pitchbend: kind + channel); every non-display control has a complete address; encoder ranges complete; geometry rules above; ids unique.
   - Mapping: every assignment references an existing control, at most one assignment per control, feedback type permitted by the control's capabilities, action parameters complete (the PAM-1 schema already carries these; the editor rules add the duplicate-address and geometry checks the loader never needed).
   - Any failure → field-level errors at the causing control/assignment, **nothing written** (AC-7).
2. **Write** atomically (Data Model above).
3. **Reload the engine only when the running config is affected:** saved mapping is in `activeMappingIds`, or saved definition is referenced by an active mapping (including via retarget). Reuse the PAM-3 apply transaction (stop→start, last-known-good rollback) — no second reload path. Editor save with a stopped engine or an inactive file writes only.
4. Result returns the refreshed snapshot (catalog, boards, notices); the editor clears its dirty state. Partial engine issues come back as notices, like PAM-3 Save.

**Deleting an assigned control (AC-7):** the delete warning lists affected mappings from the usage list. On confirm, save additionally **removes the orphaned assignments from affected user mappings** (files rewritten in the same save, named in the warning text). Reason: the PAM-1 loader skips a whole mapping file on a broken control reference — leaving the reference behind would silently kill that unit at next start. Affected **bundled** mappings can't be rewritten; they are listed with the note that they will show as invalid if retargeted later (only reachable via the retarget flow, which is opt-in).

### 4. MIDI learn (AC-4)

- One session at a time, owned by the main process. The inspector's Learn button opens a port picker prefilled with the mapping's input port (mapping context) or the first available input; board mode without context defaults to the first available.
- **Port already held by the running engine** (it belongs to an active mapping): the session taps the engine's **raw MIDI input stream** (a new pass-through listener on the existing input path — messages keep flowing to the engine untouched). Reason: Windows MME does not allow opening an input port twice; macOS/Linux would, but one code path beats three.
- **Port not held:** the main process opens it temporarily for the session and closes it on capture/cancel/editor close.
- **Capture rule:** the first qualifying message wins and ends the session — CC → kind `cc` + number + channel; note-on/note-off (any velocity, incl. velocity-0 = mc-mode off) → kind `note` + number + channel; pitchbend → kind `pitchbend` + channel. Qualifying means one of those three; anything else (sysex, clock, aftertouch) is ignored, session keeps listening. No timeout — the UI shows "listening…" with a Cancel button; the session also ends if the port disappears (`port-lost`).
- Captured values fill the inspector fields (draft only — Save persists). Learn never changes the control's `type` — the user chose fader/encoder/button; Learn supplies the address.

### 5. Dirty state & closing (EC-1)

The editor tracks draft vs loaded content (same deep-compare approach as the PAM-3 settings draft). Close/navigate with a dirty draft → three-way prompt: Save (runs group 3; stays open on validation errors), Discard, Cancel. Save button disabled while unchanged or invalid — identical semantics to the PAM-3 footer, so the app has one consistent editing model.

## Tech Decisions

- **Board canvas as plain DOM (absolutely positioned divs from grid units), no canvas/drag library.** The board is tens of controls, not thousands; DOM gives free theming (existing CSS tokens), accessibility, and hit-testing. Drag/resize via pointer events with 0.5-unit snapping. A library (dnd-kit, konva) would add a dependency for interactions this contained.
- **Copy-on-edit with a new id instead of PAM-1 same-id shadowing.** Shadowing silently repoints every referencing mapping and hides the bundled original from the lists; a suffixed copy plus an explicit opt-in retarget prompt keeps both visible and the blast radius chosen by the user. (PAM-1's shadowing stays supported for hand-edited files — the editor just doesn't produce it.)
- **Editor saves reuse the PAM-3 apply transaction for engine reload.** One reload path with known rollback semantics (last-known-good) instead of a second, editor-specific one — the spec's "save → reload" decision maps 1:1 onto machinery that already exists and is tested.
- **Learn taps the engine instead of double-opening ports.** Windows MME forbids opening an input port twice; a raw pass-through tap on the engine's input path works on all three OSes and never disturbs the running bridge. Temporary open only for ports the engine doesn't hold.
- **Orphaned assignments are cleaned up on confirmed control deletion.** The PAM-1 loader treats a broken control reference as a file-level error (mapping skipped); silent breakage of other mappings would violate the spirit of AC-7's warning. The cleanup is named in the warning, so nothing happens unannounced.
- **Validation rules live in `core`, used twice** (renderer live + main enforced) — the established PAM-3 pattern; the renderer stays untrusted.

## Dependencies

None new. Electron, React, zod, easymidi are already in place; the canvas is DOM + pointer events by decision above.

## Build Plan

```
Level 1 — Rules:    T1      editor validation rules in core/format (duplicate
                            address, geometry, completeness, usage lookup,
                            orphan computation) + unit tests
                            · files: app/src/core/format/editor-rules*  · → AC-3, AC-7
Level 2 — Main:     T2      catalog: content queries, save (validate/write/
                            copy-on-edit/retarget/orphan cleanup), usage;
                            IPC + preload additions; engine-reload wiring
                            · files: app/src/main/catalog*, index.ts,
                              app/src/shared/ipc.ts, app/src/preload/*  · → AC-2, AC-3, AC-5, AC-7
                    T3 [P]  MIDI learn session: engine raw tap + temporary
                            port open, events, port-lost
                            · files: app/src/main/midi-learn*,
                              app/src/core/engine/* (tap hook)  · → AC-4
Level 3 — Canvas:   T4      editor view shell (navigation, header, dirty/close
                            prompt) + board canvas rendering, selection,
                            zoom-to-fit
                            · files: app/src/renderer/src/components/editor/*  · → AC-1, EC-1
Level 4 — Modes:    T5 [P]  mapping mode: inspector assignment form, save flow
                            · → AC-1, AC-2
                    T6 [P]  board mode: drag/resize/add/delete, learn UI,
                            new-board dialog, boards manager, copy-on-edit +
                            retarget prompts  · → AC-3–AC-7
Level 5 — Tests:    T7      integration: save→reload against the engine test
                            double, learn session (virtual MIDI), copy-on-edit/
                            retarget/orphan flows over the IPC layer
                            · → all ACs, EC-1
```

## Technical Decisions

| Decision                                                        | Rationale                                                                                | Alternative considered                       | Trade-off                                                                        | Date       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| Board canvas as plain DOM + pointer events, no drag/canvas library | Tens of controls, free theming/hit-testing; no new dependency                             | dnd-kit / konva / SVG scene graph             | Hand-rolled drag/resize/snap code to maintain                                     | 2026-07-17 |
| Copy-on-edit creates a **new id** (PAM-3 suffix rule), never a shadow | Shadowing repoints referencing mappings silently and hides the original                   | PAM-1 same-id shadowing                       | Edits don't auto-apply to existing mappings → explicit retarget prompt needed     | 2026-07-17 |
| Opt-in retarget prompt after saving a board copy                  | Makes the copy useful for existing setups without silent rewrites                          | Auto-retarget all user mappings               | One extra dialog; bundled mappings stay on the original by design                 | 2026-07-17 |
| Editor save reuses the PAM-3 apply transaction for engine reload  | One reload path, rollback semantics already tested                                        | Editor-specific hot reload of one mapping     | Full stop→start even for a one-assignment change (acceptable per spec decision)   | 2026-07-17 |
| Learn taps the engine's raw input when the port is engine-held    | Windows MME can't open a port twice; tap never disturbs the bridge                        | Stop engine during learn / double-open        | Small engine addition (pass-through tap hook)                                     | 2026-07-17 |
| Confirmed control deletion also removes orphaned assignments from user mappings | PAM-1 loader skips whole files on broken references — orphans would kill units silently   | Leave references, let the loader flag them    | Save may rewrite files the user didn't open — mitigated by naming them in the warning | 2026-07-17 |
| Geometry snap 0.5 grid units, overlaps allowed                    | Real boards have dense clusters; addresses are the uniqueness that matters                | Collision-free layout enforcement             | Sloppy layouts possible — cosmetic only                                           | 2026-07-17 |

## Open Questions

- None

## Implementation Notes (added during /build)

_(empty — filled by /build)_
