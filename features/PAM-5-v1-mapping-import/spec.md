# PAM-5: v1 Mapping Import

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd
**Created:** 2026-07-17 · **Last Updated:** 2026-07-17

## Why

Existing v1 users (Discord community) have customized mapping JSONs they must not lose when moving to v2 — a PRD success metric. PAM-1 already re-expressed the *bundled* v1 mappings; PAM-5 converts a user's *own* v1 file into a valid v2 mapping via the UI, with every approximation made visible instead of silent.

## Dependencies
- PAM-1 (v2 file format & loader)
- PAM-3 (settings UI hosting the import entry point)

## Acceptance Criteria

- [ ] **AC-1** — Given the mappings area of the settings UI, when the user clicks "Import v1 mapping" and picks a `.json` file, then the app parses it (never executing any contained JavaScript) and asks the user to select the target device definition from a dropdown of all loaded definitions, plus a name for the new mapping.
- [ ] **AC-2** — Given the user confirmed device definition and name, when the import runs, then a new v2 mapping file is written to the user mappings folder, valid against the PAM-1 schema and loadable by the existing loader; the source file is left untouched and the new mapping appears in the app's mapping list.
- [ ] **AC-3** — Given a v1 mapping using any v1 feature (fader/knob `control` entries, `note` buttons with `exec`/`quicKey`/`cmd`/`attribute`/`local`, `rltvControl` relative encoders, `display`, `pitch`, `enableTimecodeSend`, `timecodeSelect`/`timecodePlayPause`, `minValue`/`amount`/`permanentFeedback` options), when it is imported against the matching device definition, then each entry becomes the equivalent v2 assignment; v1 fields that are hardware facts in v2 (encoder ranges, LED-ring addresses, `midiChannel`, `mode`) are dropped in favor of the chosen device definition.
- [ ] **AC-4** — Given a `buttonFeedbackMapper` (file-level or per-entry), when its JS matches a known v1 pattern (On/Off numeric returns, incl. the APC/Launchpad color values), then it is translated to the equivalent `on-off` feedback values; when it is not recognized, the default `on-off` (127/0) is used and a warning is recorded — the JavaScript is never executed.
- [ ] **AC-5** — Given the import finished, when the summary is shown, then it lists what was converted and every warning/approximation (unrecognized feedback mapper, v1 entries with no matching control on the chosen device definition — these are skipped, unknown keys) — nothing is dropped silently.
- [ ] **AC-6** — Given a file that is not valid JSON or not shaped like a v1 mapping, when import is attempted, then a clear error names the file and the problem, nothing is written, and the app keeps running.

## Out of Scope
- Automatic board detection from file shape — the user picks the device definition manually (dropdown)
- Import of v1 port assignments / Open Stage Control config — MIDI ports are bound in the settings UI (PAM-3)
- Batch import of multiple files in one go — one file per import
- Export/sharing of mappings — PAM-7

## Open Questions
- None

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Import via UI only, no CLI | PRD goal: migration without touching a terminal | 2026-07-17 |
| Device definition picked manually from a dropdown | v1 files don't identify their board; explicit choice beats guessing | 2026-07-17 |
| Feedback-mapper JS is pattern-matched, never executed | Untrusted input; v2 bans executable code in mapping files (PAM-1 decision) | 2026-07-17 |
| Original v1 file stays untouched; result is a new v2 file + visible summary | Safe migration, no data loss, approximations transparent | 2026-07-17 |
