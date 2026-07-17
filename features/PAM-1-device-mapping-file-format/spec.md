# PAM-1: Device & Mapping File Format

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd

**Created:** 2026-07-16 · **Last Updated:** 2026-07-17 (delta: AC-7 composite push-encoders, scheduled by PAM-6)

## Why

The foundation of v2: v1 conflates board description, MIDI port, and user mapping in one file (whose _filename_ selects the port) and even embeds eval'd JavaScript. v2 separates a **device definition** (board type: controls, MIDI addresses, 2D layout) from a **mapping** (port binding + control → MA3 action assignments) as pure-data files — the base that PAM-2 (engine), PAM-5 (import), PAM-6 (editor), and PAM-7 (sharing) build on.

## Dependencies

- None (first feature)

## Acceptance Criteria

- [ ] **AC-1** — Given the app starts, when device definitions are loaded, then all five bundled board types (X-Touch, X-Touch Compact, APC mini, Launchpad, MPX16) are available, each listing its controls (faders, encoders, buttons) with MIDI address (note/CC, number, channel) and a 2D position/size for the board layout.
- [ ] **AC-2** — Given a device definition, when a mapping is created against it, then the mapping references the device definition by ID, binds one concrete MIDI port name, and assigns controls to GrandMA3 actions (executor, command, QuickKey, attribute) with feedback behavior chosen from predefined types — no executable code anywhere in the file.
- [ ] **AC-3** — Given the bundled v1 mappings (xTouch1/2, xTouchCompact1/Rltv1, akiApcMini1/2, LaunchPad Playback/TriFlats, mpx16-1), when they are re-expressed in the new format and bundled as default mappings, then every behavior they use (exec, quicKey, cmd, attribute, relative encoders, displays, feedback mapping) is expressible — the format is proven against the complete v1 feature set.
- [ ] **AC-4** — Given a file with invalid or unknown content is loaded, when validation fails, then the app reports a clear error naming the file and the problem (and keeps running); valid files carry a format version for future migrations.
- [ ] **AC-5** — Given two units of the same board type are connected, when two mappings reference the same device definition with different MIDI port names, then both run simultaneously with independent assignments.
- [ ] **AC-6** — Given the documented format, when a user hand-edits a mapping or device file in a text editor, then the app loads it like a bundled one — the format stays human-editable until the visual editor (PAM-6) exists.
- [ ] **AC-7** — Given an encoder control that declares an integrated push button (own note/CC address and LED capability), when a mapping targets that control, then rotate and push are independently assignable (each with its own action and feedback) on the one control; the bundled X-Touch expresses its 8 push-encoders this way and its bundled mappings keep their v1 behavior.

## Out of Scope

- Visual editing — PAM-6
- Import of _user_ v1 mappings — PAM-5 (AC-3 covers only the bundled ones, as format proof)
- Sharing/export UX — PAM-7
- Runtime bridge behavior — PAM-2
- Custom scripted feedback functions (v1 `buttonFeedbackMapper` JS) — replaced by predefined feedback types (see Decision Log)

## Open Questions

- None

## Decision Log

### Product Decisions

| Decision                                                                        | Rationale                                                                                                                            | Date       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Bundle all five v1 board types                                                  | No existing user left behind at migration                                                                                            | 2026-07-16 |
| Pure-data files, no executable code / no eval                                   | Shared mapping files are untrusted input (Discord sharing); the P1 visual editor can only edit data, not code                        | 2026-07-16 |
| MIDI port binds per **mapping**, not per device definition                      | Two units of the same board type must run side by side with different mappings                                                       | 2026-07-16 |
| Composite push-encoders: one control, two functions (delta, scheduled by PAM-6) | One physical knob = one control in the editor (user decision); separate button controls hid the encoder in the 2D view               | 2026-07-17 |
| Schema evolves in place, formatVersion stays 1 (delta)                          | v2 is pre-release — no shipped build reads these files yet; a version bump would cost migration machinery with zero users to protect | 2026-07-17 |
