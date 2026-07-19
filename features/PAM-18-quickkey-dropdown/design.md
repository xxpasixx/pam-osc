# PAM-18 — Design

**Date:** 2026-07-19

> Technical design (HOW). No code — implementation-grade precise. Contract lives in `spec.md`.

## Component Structure

Two independent pieces: a UI change in the editor, and a console-side uninstall action.

```
MappingInspector (editor)
+-- QuickKey field  → replaced: free-text input  ==>  <select> dropdown
    +-- options: the canonical key list (grouped: Keypad, Transport, Function, …)
    +-- unknown/legacy value → shown at top, flagged "unknown key", still removable

Uninstall (console-side cleanup, triggered from the app)
+-- Settings/Status: "Remove pam-osc from console…" button → confirm dialog
+-- runs a console-side uninstall sequence (order matters — see Behaviors)
```

## Data Model

No persisted app data changes. One new **code** artifact (not user data):

```
Canonical QuickKey catalogue — a core module (new: app/src/core/format/quickkeys.ts):
- code: string — the MA3 hardkey code, e.g. "DEF_GO", "STORE", "NUM5", "XKEYS" (the ~110 codes
  currently listed only inside pam-OSC.lua createQuickeysIfNotExists).
- label: string — human-friendly name, e.g. DEF_GO → "Go (default)", ASTERISK → "Asterisk (*)".
- group: one of Keypad | Transport | Function | Object | Navigation | Special — for dropdown grouping.

This module is the SINGLE SOURCE OF TRUTH (AC-2). The app dropdown reads it. A parity test
(new, mirroring plugin-xml.test.ts) asserts the plugin's createQuickeysIfNotExists array contains
exactly these codes, so the Lua and the UI can never drift.

mapping action stays unchanged: { type: "quickKey", key: string } — the dropdown just constrains
which values a user can pick; an imported/unknown key is still a valid string (AC-3).
```

## Behaviors & Access

- **Dropdown (AC-1):** the QuickKey action renders a grouped `<select>` of the canonical codes with readable labels. Selecting writes `{ type: "quickKey", key: <code> }`.
- **Unknown key (AC-3):** if the current value isn't in the catalogue (v1 import, hand-edited file), it appears as a flagged option at the top ("unknown: <value>") so it's visible and removable — never silently dropped or silently accepted as valid.
- **Executors unchanged (AC-4):** executor actions keep the CMD/macro path (PAM-12); nothing in this feature routes executors through QuickKeys.
- **Full uninstall (AC-5, expanded 2026-07-19 → "remove pam-osc from console"):** removes, **in this order** so the app doesn't cut its own channel mid-run:
  1. all `pam-osc_*` QuickKeys (pool objects) — delete only names with the `pam-osc_` prefix; user QuickKeys untouched.
  2. the `pam-osc_CMD` macro (PAM-12).
  3. the two OSC entries (`pam-osc`, `pam-osc-recive`) — **last of the console-comms items**, because deleting them ends feedback/command flow.
  4. the plugin pool objects themselves — the merged pam-osc plugin (PAM-13).
  The action reports what was removed (counts per category). Removing the OSC entries and the plugin means the app will lose its connection — the UI must explain this ("this ends the console connection") in the confirm dialog and reflect the disconnected state afterwards.

**Access:** local user, single machine — same trust model as install (PAM-9). The uninstall targets only `pam-osc_`-prefixed / pam-osc-named objects; it must never touch unrelated console objects.

## Tech Decisions

- **Canonical list in `core`, drift-guarded by a test:** the list must feed both the UI dropdown and the plugin's QuickKey creation. Keeping it in `core` (imported by the renderer) with a parity test against the Lua is the lowest-risk way to get one source of truth without restructuring the byte-parity-tested Lua embedding.
- **Keep create-all-from-1000 (maintainer, 2026-07-19):** the plugin keeps pre-creating all codes from pool 1000, skipping forward to the next free slot on collision (its current behaviour). No lazy creation, no PAM-16 coupling — simpler and already working.
- **Uninstall runs console-side, ordered comms-last:** the plugin can delete its own QuickKeys/macro/OSC via `Cmd`/OSCBase; ordering OSC-entry and plugin removal last avoids severing the channel before the earlier steps complete.

## Dependencies

- None new. Touches the renderer (`MappingInspector`), a new `core/format/quickkeys.ts`, and `pam-OSC.lua` (uninstall routine).

## Build Plan

```
Level 1 — Data:      T1      canonical quickkeys.ts (codes + labels + groups) + parity test vs pam-OSC.lua · files: app/src/core/format/quickkeys.ts, app/src/quickkeys.test.ts · → AC-2
Level 2 — UI:        T2      MappingInspector free-text → grouped dropdown, unknown-key handling           · files: app/src/renderer/src/components/editor/MappingInspector.tsx · → AC-1, AC-3
Level 3 — Plugin:    T3      uninstall routine in pam-OSC.lua (quickeys→macro→OSC→plugin, prefix-safe) + BUMP mini version + regenerate XML · files: pam-OSC.lua, app/scripts/build-plugin-xml.mjs · → AC-5
Level 4 — Trigger:   T4      app-side "Remove pam-osc from console…" + confirm dialog + post-uninstall disconnected state · files: renderer (Status/Settings), main IPC · → AC-5
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| -------- | --------- | ---------------------- | --------- | ---- |
| Canonical key list in core + parity test | One source of truth for UI dropdown and plugin creation; test prevents drift | Duplicate the list in TS and Lua by hand | Must keep the test; list edits touch two files until/unless the generator injects it | 2026-07-19 |
| Full uninstall, comms-removed-last | Maintainer wants a real "remove from console"; ordering avoids cutting the channel mid-uninstall | QuickKey-only cleanup | Larger scope; depends on OSCBase delete (onPC-pending) | 2026-07-19 |
| Keep pre-create-all from pool 1000 | Maintainer choice; already working, no PAM-16 coupling | Lazy-create only mapped keys | ~110 pool objects per showfile | 2026-07-19 |

## Open Questions

- [ ] **onPC-pending — OSCBase delete & plugin self-removal:** deleting OSC entries (via `ShowData().OSCBase` children) and the plugin pool objects from within a running plugin needs verification on onPC (same OSCBase uncertainty as PAM-13). If the plugin cannot remove itself cleanly, the last step becomes an app-guided manual removal. Resolve in the onPC session.
- [ ] **Uninstall trigger location** — Status tab vs a Settings/Advanced area; decide during build.
