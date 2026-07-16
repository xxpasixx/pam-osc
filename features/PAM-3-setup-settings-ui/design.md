# PAM-3 — Design

**Date:** 2026-07-17

> The technical design (HOW). Two readers: the PM (approves) and `/build` (implements against it). No code — but implementation-grade precise. The contract (WHAT) lives in `spec.md`.

## Component Structure

PAM-3 bootstraps the Electron shell and delivers the settings UI. The PAM-2 engine runs unchanged inside the main process; the renderer never touches MIDI, OSC, or the filesystem (spec Technical Requirements).

```
Electron app
+-- Main process (Node)
|   +-- App bootstrap        single-instance lock, window creation & bounds
|   |                        restore, engine auto-start
|   +-- Settings store       settings.json in the OS userData folder:
|   |                        load / validate / atomic save / corrupt handling
|   +-- Mapping catalog      PAM-1 loader over bundled resources/ + user
|   |                        <userData>/mappings + /devices; list with validity;
|   |                        copy-on-activate; duplicate-for-second-unit;
|   |                        reveal-folder
|   +-- Engine host          owns the PAM-2 engine: start/stop/reconfigure,
|   |                        last-known-good config, apply transaction,
|   |                        forwards engine events to the renderer
|   +-- MIDI port lister     current input/output port names, polled while the
|   |                        window is open, pushed on change
|   +-- IPC surface          the only bridge to the renderer (preload, narrow
|                            typed API; contextIsolation on, sandbox on)
+-- Renderer (React, MA3 dark theme)
    +-- Status bar           engine state + console connection LED + text
    +-- Console section      IP, send port, receive port
    +-- Devices section      one row per active mapping (name, board, port
    |   |                    pickers, bound/missing LED, duplicate, remove)
    |   +-- Add-device dialog  all available mappings (bundled + user),
    |                          invalid files greyed out with their error
    +-- Notices area         issues from loader/engine/settings, dismissible
    +-- Footer               Save (disabled while unchanged or invalid),
                             Discard, "Open mappings folder" link
```

Single page — no navigation yet; PAM-4 adds the diagnostics view next to it.

## Data Model

`docs/data-model.md` already carries the **App Settings** entity; this design details it — the map needs no change. Mappings and device definitions stay exactly the PAM-1 formats.

**settings.json** — one file in the OS userData folder, written atomically (temp file + rename):

```
- formatVersion — integer, required, starts at 1 (same migration rule as
  PAM-1 files: newer-than-known is rejected with a clear message)
- console:
    - address     — text, required; IPv4 or hostname (no port suffix).
                    First-run prefill: 127.0.0.1
    - sendPort    — integer 1–65535, required. First-run prefill: 9003
    - receivePort — integer 1–65535, required. First-run prefill: 9004
      (9003/9004 are the v1 defaults from OpenStageControlConfig.config — AC-1)
- activeMappingIds — list of mapping ids (PAM-1 envelope id), unique, may be
  empty (empty = engine intentionally not running, UI shows "add a device")
- ui — optional: window bounds (x, y, width, height), saved on close outside
  the Save transaction; never blocks or dirties the settings form
```

**What "active" means on disk:** the settings file holds only the id list. The MIDI **port binding stays in the mapping file** (PAM-1 AC-2 — the mapping is the shareable artifact, port included). Because bundled mappings are read-only inside the app package, activating one **materializes a user copy**:

- Activating a **bundled** mapping: the user picks ports in the dialog; on Save the app writes a copy to `<userData>/mappings/` with the **same id** and the chosen ports. The PAM-1 loader's shadowing rule makes the user copy win from then on (with its info notice).
- Activating a **user** mapping: ports prefill from the file; a change rewrites the file on Save.
- **Second unit of the same board:** "Duplicate" on a row or in the dialog creates a user copy with the first free id suffix (`<id>-2`, `-3`, …) and name suffix (" (2)") — two distinct mapping files, as the PAM-2 engine expects (its per-unit state is keyed by mapping id).
- **Remove** takes the id out of `activeMappingIds` only — the user file stays on disk for later reuse; deleting files is manual (or PAM-6 later).

**Not persisted:** engine runtime state, connection status, port lists — all live, per `docs/data-model.md`.

## Behaviors & Access

Everything is local, single user — no access model. Five behavior groups:

### 1. Startup (AC-1, AC-4, EC-2, EC-5)

1. Request the single-instance lock; if another instance holds it, that instance's window is focused/restored and this one quits (EC-5).
2. Load settings.json: **missing** → in-memory defaults (prefills above), first-run state. **Corrupt/invalid** → same defaults *plus* a notice naming file and problem; the broken file stays on disk untouched until the next successful Save overwrites it (EC-2).
3. Config completeness check: address non-empty, ports valid, at least one active mapping id. **Complete** → engine host starts the engine immediately (before the window is ready — the bridge must not wait for the UI, AC-4). **Incomplete** → engine stays stopped; the window opens on the setup view (AC-1).
4. Window opens with restored bounds; renderer requests one snapshot: settings + catalog + port list + engine/connection/device status + pending notices.

### 2. IPC contract (the narrow preload API)

Queries (renderer → main, request/response):
- **getSnapshot** — everything the UI needs at mount (see above)
- **listMidiPorts** — current input and output port names

Commands (renderer → main):
- **applySettings(draft)** — the Save transaction (below); returns ok + applied snapshot, or a structured error list (field-level for validation, notice-level for engine problems)
- **revealMappingsFolder** — opens `<userData>/mappings/` in Finder/Explorer
- **duplicateMapping(id)** — creates the suffixed user copy, returns the new catalog entry

Events (main → renderer, push):
- **connection** — checking | connected | plugin-missing | unreachable, with attempt counter (engine event, AC-7)
- **devices** — per active mapping: mapping id, port name, bound | missing (AC-7, AC-5)
- **engineState** — stopped | starting | running
- **midiPorts** — changed port list (poll every 2 s while the window is open)
- **notice** — structured issue (source, file/path if any, plain-language text)

The preload exposes exactly these — no generic `invoke`, no Node APIs in the renderer.

### 3. The Save transaction (AC-3, EC-3)

Draft edits live only in the renderer until Save. On **applySettings**:

1. **Validate** (rules below). Any failure → return field errors, change nothing.
2. **Write mapping files**: materialize bundled activations, rewrite rebound ports of user mappings. These writes are user intent and survive a later rollback.
3. **Reconfigure the engine** with the new config (PAM-2 reconfigure; stop→start, no stale listeners). Empty active list → engine is stopped instead, state "not running".
4. **Judge the result:** engine running (possibly with partial issues, e.g. one mapping file invalid — PAM-2 EC-4) → new config becomes last-known-good, go to 5; engine failed entirely (nothing valid, UDP receive port already in use, …) → the host **reconfigures back to the last-known-good config** and returns the engine's error — the previous working state keeps running (EC-3).
5. **Persist settings.json** — only what is now actually applied, so an app restart never auto-starts into a known-bad config. Partial issues are returned as notices with the success.

Discard resets the draft to the applied snapshot. Save is disabled while the draft is unchanged or invalid.

### 4. Validation rules (AC-6 — exact list)

- **address**: required; IPv4 dotted-quad or hostname (letters, digits, dots, hyphens); no spaces, no port suffix.
- **sendPort / receivePort**: integer 1–65535.
- **sendPort ≠ receivePort when address is the local machine** (127.0.0.1 / localhost) — both sockets would collide.
- **Per active mapping**: an input port is chosen (output optional — input-only boards); the referenced mapping exists and is valid in the catalog.
- **Across active mappings**: no two share the same input port name; no two share the same output port name (a physical unit belongs to exactly one mapping).
- Errors render inline at the field/row that caused them, naming the problem; nothing is persisted or applied (AC-6).

### 5. Status & catalog surfaces (AC-2, AC-7, EC-1, EC-4)

- **Status bar**: engine state; connection LED — grey "checking…" / green "connected" / yellow "plugin missing" / red "console unreachable", plus attempt counter while retrying. Colors follow the PRD theme (status LEDs, MA-yellow accent).
- **Device rows**: green "bound" / red "missing — check port" LED from device events. A row whose configured port is absent shows its port picker highlighted for rebinding (AC-5); the row stays functional, hot-plug may still bind it later (EC-1).
- **Add-device dialog**: lists every catalog entry — mapping name, board type (device definition name), badge "bundled"/"user". Invalid files (PAM-1 loader errors) are listed greyed out with their validation message, not selectable (EC-4). Empty port dropdown state: "no MIDI devices found — connect one" (EC-1).
- **Notices area**: loader notices (shadowing info, invalid files), settings-file problems, engine issues — each dismissible; deep diagnostics stay PAM-4.

## Tech Decisions

- **Copy-on-activate instead of port overrides in App Settings.** The port lives in the mapping file (PAM-1 AC-2) and the PAM-2 engine keys per-unit state by mapping id — a settings-level override with duplicate ids would break the two-units case, and the mapping file would stop being the complete shareable artifact. Shadowing already exists in the PAM-1 loader; activation simply uses it.
- **Settings persisted only after a successful apply.** The file always mirrors a config that actually ran — restart can never auto-start into a known-bad state. Cost: values that failed to apply are gone after a restart; the error message at Save time is the mitigation.
- **Rollback to last-known-good on total engine failure.** Reconfigure is stop→start (PAM-2), so a failed start would otherwise leave the bridge dead mid-setup; re-applying the previous config keeps the show running (EC-3).
- **electron-vite as the build pipeline.** One dev command with HMR for renderer + rebuild for main/preload, and one build command feeding electron-builder — instead of hand-wiring three Vite configs. Versions verified against npm at build time (AGENTS.md).
- **Electron hardened by default:** contextIsolation on, sandbox on, nodeIntegration off, a preload exposing exactly the IPC contract above — the renderer is untrusted display code (matches the "renderer never touches MIDI/OSC/fs" requirement).
- **No settings library (electron-store & co.).** zod is already the schema source of truth for PAM-1 files; the same pattern (zod schema + derived type + atomic write) covers one settings file without a new dependency.

## Dependencies

- `electron` — the desktop shell (main process hosts the PAM-2 engine)
- `electron-vite` — dev server (HMR) + build for main/preload/renderer
- `electron-builder` — installers: dmg / exe / AppImage, unsigned in the MVP (per AGENTS.md)
- `react`, `react-dom` — renderer UI
- `zod` — already present; settings.json schema + derived type

(Versions pinned at build time via `npm view <pkg> version`, per AGENTS.md.)

## Build Plan

```
Level 1 — Shell:     T1      electron-vite scaffold: main/preload/renderer, window,
                             single-instance lock, bounds persistence, dark-theme
                             tokens (graphite + #ffc400), npm run dev/build/package
                             · files: app/electron.vite.config.*, app/src/main/*,
                               app/src/preload/*, app/src/renderer/* (skeleton),
                               app/package.json · → AC-1 (shell), EC-5
Level 2 — Services:  T2 [P]  settings store: zod schema, defaults, atomic save,
                             corrupt handling · files: app/src/main/settings*
                             · → AC-1, EC-2
                     T3 [P]  mapping catalog: loader wiring (bundled + userData),
                             validity list, copy-on-activate, duplicate, reveal
                             · files: app/src/main/catalog* · → AC-2, EC-4
                     T4 [P]  MIDI port lister (poll + diff) · files:
                             app/src/main/midi-ports* · → AC-2, EC-1
Level 3 — Host:      T5      engine host: auto-start, apply transaction, rollback,
                             event forwarding; IPC surface + typed preload bridge
                             · files: app/src/main/engine-host*, ipc*,
                               app/src/preload/* · → AC-3, AC-4, EC-3
Level 4 — UI:        T6      renderer: status bar, console form, device rows,
                             add-device dialog, notices, save/discard flow,
                             inline validation
                             · files: app/src/renderer/* · → AC-1–AC-3, AC-5–AC-7
Level 5 — Tests:     T7      unit: settings store, validation rules, catalog
                             copy-on-activate/duplicate; integration: apply
                             transaction against an engine test double
                             (start-fails / partial-issues / success), snapshot
                             + event flow over the IPC layer
                             · files: app/src/main/*.test.ts · → all ACs, EC-1–EC-5
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| Copy-on-activate: activating a bundled mapping writes a user copy (same id, shadowing); second unit = suffixed duplicate | Port binding belongs to the mapping file (PAM-1 AC-2); engine keys per-unit state by mapping id (PAM-2) | Port overrides stored in App Settings | Bundled improvements don't propagate into existing copies (shadow notice mitigates) | 2026-07-17 |
| Persist settings.json only after a successful apply | Restart never auto-starts into a known-bad config (AC-4 stays safe) | Persist on Save regardless of engine result | Failed values must be re-typed after a restart | 2026-07-17 |
| Rollback to last-known-good config on total engine start failure | Reconfigure is stop→start — without rollback a bad Save kills the running bridge (EC-3) | Leave engine stopped, show error | Slightly more host complexity; mapping-file writes intentionally survive | 2026-07-17 |
| electron-vite pipeline | One dev command with HMR across main/preload/renderer; feeds electron-builder | Hand-rolled Vite configs + electron CLI | One more dev dependency; less config control | 2026-07-17 |
| Hardened Electron defaults (contextIsolation, sandbox, narrow preload) | Renderer is display-only per spec; Electron security baseline | ipcRenderer exposed directly | Every new IPC call needs a preload addition — deliberate friction | 2026-07-17 |
| zod + atomic write for settings, no electron-store | Same schema pattern as PAM-1; one less dependency | electron-store | Migrations stay hand-rolled (formatVersion covers it) | 2026-07-17 |
| First-run prefills 127.0.0.1 / 9003 / 9004 | v1 defaults (OpenStageControlConfig.config): onPC-on-same-machine is the most common first test (AC-1) | Empty fields | Users on a real console must edit the IP — they must anyway | 2026-07-17 |

## Open Questions

- None

## Implementation Notes (added during /build, 2026-07-17)

- **Versions pinned from the npm registry:** electron 43.1.1, electron-vite 5.0.0, electron-builder 26.15.3, react/react-dom 19.2.7, @vitejs/plugin-react 5.2.0 (6.x needs Vite 8; electron-vite 5 bundles Vite 7).
- **Preload is built as CommonJS** (`.cjs`): Electron's ESM preloads require `sandbox: false`; the design mandates sandbox **on**, so the preload is the one non-ESM artifact. Main process stays ESM.
- **Loader extension (additive, PAM-1 module):** `LoadResult` now also reports `mappingSources` (id → origin + actual file path). The catalog needs real file paths because user mapping files are not guaranteed to be named `<id>.json`; filename guessing would have corrupted rewrites. No existing behavior changed (44 format tests untouched).
- **Validation is one pure module** (`src/core/settings/validate.ts`) used twice: live in the renderer for instant inline errors and enforced in the main process inside the Save transaction — the renderer remains untrusted.
- **Window-all-closed quits the app** (engine stops with it). A background/tray mode is parked in `docs/ideas.md` — spec is silent, quitting is the predictable MVP behavior.
- **Duplicate flow:** duplicating a row immediately adds the copy to the draft with the source's ports; validation flags the port collision so the user re-picks — one step fewer than duplicate-then-activate.
- **Engine host does stop→start explicitly instead of `engine.reconfigure()`** — the rollback path (EC-3) needs control between the stop and the start.
- **Agent/CI caveat:** launching the app from a shell that carries `ELECTRON_RUN_AS_NODE` (e.g. VS Code task shells) makes Electron boot as plain Node — documented in AGENTS.md commands.
- **Verified:** 116/116 Vitest (validation, settings store, catalog incl. copy-on-activate/duplicate/EC-4, apply transaction incl. rollback paths, plus all PAM-1/PAM-2 suites), typecheck clean, `electron-vite build` green, dev-mode boot smoke on macOS (window process up, userData folders created, first-run = no engine start).
