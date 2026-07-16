# PAM-3: Setup & Settings UI

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd
**Created:** 2026-07-17 · **Last Updated:** 2026-07-17

## Why

The first UI of v2 — it turns the headless PAM-2 engine into the "download, open, enter IP, pick your device — done" product promise. PAM-3 bootstraps the Electron app shell (window, MA3-inspired dark theme, main↔renderer IPC, dev/build scripts) and delivers the setup flow: console connection, active mappings with MIDI port binding, persisted locally.

## Dependencies
- PAM-2 (bridge engine — started/reconfigured via its programmatic API, AC-11)

## Acceptance Criteria

- [ ] **AC-1** — Given a fresh install with no saved settings, when the app launches, then a window opens in the MA3-inspired dark theme showing the setup view: console IP, send/receive ports (prefilled with the v1 defaults), and mapping selection — the engine is not started with an incomplete config.
- [ ] **AC-2** — Given mappings exist (bundled with the app, or user files in the app's mappings folder), when the user adds an active mapping, then the picker lists both kinds and the user binds the chosen mapping to one of the currently connected MIDI ports; several mappings can be active at once, including two units of the same board type; the UI offers a way to reveal the user mappings folder.
- [ ] **AC-3** — Given the user changed settings, when they hit Save, then the settings are persisted locally and applied to the running engine via reconfigure — without an app restart; unapplied edits never take effect.
- [ ] **AC-4** — Given valid persisted settings exist, when the app launches, then the engine starts automatically with them — no user action required.
- [ ] **AC-5** — Given an active mapping whose configured MIDI port is not currently present (e.g. the OS renamed it), when the user opens settings, then the mapping is visibly marked as unbound and can be rebound to a connected port; after Save the engine binds the device (resolves PAM-2 EC-5).
- [ ] **AC-6** — Given invalid input (malformed IP, port out of range, two mappings on the same MIDI port), when the user tries to save, then the UI shows a clear inline error naming the problem and the invalid config is neither persisted nor applied.
- [ ] **AC-7** — Given the engine is running, when it emits status events (connection: connected / plugin missing / unreachable; per-device: bound / missing), then the UI reflects them as simple always-visible indicators — enough to see that setup worked; deeper diagnostics (port diagnosis, MIDI test mode) stay in PAM-4.

## Out of Scope
- Status & diagnostics UI beyond the minimal AC-7 indicators (connection check details, port diagnosis, MIDI test mode) — PAM-4
- Manual engine start/stop toggle — auto-start only for now (decision below)
- Creating or editing mappings — PAM-6 (editor); PAM-3 only selects/activates existing ones
- v1 mapping import (PAM-5), mapping file sharing UX (PAM-7)

## Edge Cases
- **EC-1** — No MIDI ports connected: existing active mappings stay configured (hot-plug binds them later, PAM-2 AC-10); the port picker shows an empty state, not an error.
- **EC-2** — Settings file missing or corrupt: the app starts into the setup view with defaults, reports the problem, and never crashes; the corrupt file is not silently overwritten until Save.
- **EC-3** — Engine fails to start or rejects an applied config (mapping file deleted since selection, OSC receive port already in use, …): the UI surfaces the engine's error and keeps the previous working state.
- **EC-4** — An invalid mapping file in the user mappings folder: listed as invalid with its validation error (per PAM-1 AC-4), not selectable — the picker never crashes.
- **EC-5** — A second app instance is launched: it focuses the existing window instead of starting a competing engine (MIDI ports and the OSC receive port are exclusive resources).

## Technical Requirements
- App shell arrives with this feature: Electron window, React/Vite renderer, `npm run dev` / `npm run build` per AGENTS.md
- Renderer never touches MIDI/OSC/filesystem directly — engine runs in the main process, UI talks over IPC
- Settings = the "App Settings" entity from the data model: one local file, no accounts/cloud, carrying a format version for future migrations (consistent with PAM-1 files)

## Open Questions
- None

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| PAM-3 bootstraps the Electron app shell | First UI feature; no separate scaffold chore | 2026-07-17 |
| Engine auto-starts with saved settings; no start/stop toggle yet | Matches "open and it works"; toggle can come later if port-sharing demands it | 2026-07-17 |
| Explicit Save/Apply, no live-apply | Predictable during live operation — no half-typed IP gets applied | 2026-07-17 |
| Minimal status indicators live in PAM-3 (AC-7), full diagnostics in PAM-4 | Pre-mortem: without any feedback after Save, first-run users are flying blind | 2026-07-17 |
