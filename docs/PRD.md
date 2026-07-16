# Product Requirements Document — pam-osc v2

## Vision

pam-osc v2 is a standalone desktop app (macOS, Windows, Linux) that turns affordable MIDI controllers into real GrandMA3 control surfaces: faders, encoders, and buttons drive the executors on the current page, and the console talks back — motorized faders follow the show, button LEDs mirror running sequences, and LED displays show the current sequence, cue, and color. Setup is: download, open, enter the console IP, pick your device — done. v2 replaces the fragile Open Stage Control setup of v1 with a native app that makes status, errors, and diagnostics visible in the UI instead of a terminal, and later lets users visually create and share their own device mappings.

## Target Users

- **Pre-programmers & operators** (churches, small venues, freelancers) who want motorized-fader/LED feedback on affordable MIDI hardware without buying MA hardware wings
- **Existing v1 users** (Discord community) who know the features but fight the OSC setup — they must be able to migrate with their mappings
- **First-time users** who find the GitHub repo and should get from download to a working fader in minutes, without reading terminal output

## Core Features (Roadmap)

_Priority only — feature status lives in `features/INDEX.md`._

| Priority | Feature |
|----------|---------|
| P0 (MVP) | Bridge engine — ported v1 core with feature parity (faders, encoders, buttons, LED/display feedback, DeskLock) |
| P0 (MVP) | Device & mapping file format — devices (controls, MIDI notes, 2D positions) separated from mappings (control → MA3 action), bundled definitions for the v1-supported boards |
| P0 (MVP) | Setup & settings UI — console IP/ports, device selection, persisted locally |
| P0 (MVP) | Status & diagnostics UI — connection check, plugin check, port diagnosis, MIDI test mode (v1.4 logic, surfaced in the UI) |
| P0 (MVP) | v1 mapping import |
| P1 | Visual mapping editor — 2D board layout, remap controls, add buttons/faders/encoders |
| P1 | Mapping export/import as file (community sharing) |
| P2 | Code signing & notarization |
| P2 | One-click Lua plugin install on the console (open question: feasibility of pushing plugins from outside) |
| P2 | More device definitions, colored button feedback |

## Success Metrics

- A new user gets from download to a moving fader in under 10 minutes without touching a terminal
- Setup questions on Discord drop noticeably after v2 release
- Existing v1 users migrate successfully with imported mappings
- v2 downloads overtake v1 within a few releases

## Constraints

- Solo maintainer, spare time; no budget in the MVP (unsigned builds — Gatekeeper/SmartScreen workarounds documented)
- GPL-3.0 (existing license)
- Compatibility with GrandMA3 2.x and the existing Lua plugin (unchanged from v1)
- UI design direction: MA3-inspired dark theme — graphite surfaces, MA-yellow `#ffc400` accent, status LEDs, monospace value displays

## Non-Goals (v2.0)

- No MA2 support
- No touchscreen control surface — v2 is a bridge + editor, not an Open Stage Control replacement for touch layouts
- No cloud, accounts, or sync — everything is local; sharing happens via file export
- No mobile app
- No console-side features beyond what the existing Lua plugin provides
