# PAM-13 — Design

**Date:** 2026-07-19

> Technical design (HOW). No code — implementation-grade precise. Contract lives in `spec.md`.

## Component Structure

Console-side (Lua plugin) plus a small generator change. No app UI of its own (the wizard/PAM-9 surface it).

```
Plugin bundle (build-plugin-xml.mjs)  → ONE UserPlugin "pam-osc"  (was two)
+-- Component "Start Stop" (default)  — the main engine loop (pam-OSC.lua)
|   +-- on start: OSC self-check (NEW)
|       +-- read ShowData().OSCBase children
|       +-- ensure receive entry (port = send port) + send entry named "pam-osc"
|       +-- create missing (onPC-pending) OR print a clear console warning
+-- Component "Settings"              — the options dialog (SettingsPage.lua), reached as a
                                         named component of the SAME plugin, not a 2nd pool entry
```

## Data Model

No persisted **app** data. Console-side artefacts and the generator:

```
Plugin XML (generated): one <UserPlugin Name="pam-osc"> with two components (Start Stop, Settings),
instead of today's two separate <UserPlugin> entries. GUIDs stay stable so re-import is recognised.
PLUGIN_VERSION mini-bumped on this change (per the version-bump rule).

OSC self-check target (console OSC config, owned by MA3, addressed by the plugin):
- Receive entry — name irrelevant, Port = the app's send port (default 9003), Receive + Receive Command on.
- Send entry — Name EXACTLY "pam-osc", Port = the app's receive port (default 9004), Send Command on,
  Destination IP = the app machine.
The plugin verifies entries by NAME ("pam-osc") and presence; it creates missing ones with DEFAULT
ports (9003/9004) — see Tech Decisions for the port-customisation limitation.
```

## Behaviors & Access

- **Merge (AC-1, AC-2):** the generator emits one plugin with two components. Importing gives one pool entry; "Start Stop" runs the engine, "Settings" opens the options dialog (invoked as a named component of the same plugin). No option is lost.
- **OSC self-check on start (AC-3):** the engine, on start, reads `ShowData().OSCBase` children and checks for the receive entry and the send entry named `pam-osc`, reporting the result on the console.
- **Auto-create where possible (AC-4):** a missing entry is appended via `OSCBase:Append()` with name/port/direction/command toggles — **onPC-pending** (see Open Questions); if the writable property set is insufficient, this degrades to warn-only for that entry.
- **Warn otherwise (AC-5):** if an entry can't be created/verified, the plugin prints a human-readable console warning naming the missing entry and its expected name/port — never a silent failure.
- **Bundle both entries (AC-6):** DONE — the maintainer's re-export with both entries is now in `gma3_library/inout/osc/pam-osc.xml`.
- **No protocol regression (AC-7):** `pamPing`/protocol handshake and all PAM-2/PAM-12 behaviour are unchanged; merging components and adding a self-check do not alter the app↔plugin message protocol.

**Access:** console-side only; the self-check reads/creates OSC config on the console the operator is running. It touches only pam-osc's own named entries.

## Tech Decisions

- **One plugin, two named components:** MA3 plugins can carry multiple components callable by name, so "one pool entry, settings still reachable" is achievable without losing the dialog. _(Verify the exact invocation form on onPC — Open Questions.)_
- **Auto-create uses default ports; port customisation stays guided:** the plugin cannot know app-chosen non-default ports before OSC works (chicken-and-egg). So auto-create uses 9003/9004; if the user runs custom ports, the app guide/wizard (PAM-9/PAM-14) covers it, and the plugin **warns** when an entry exists by name but its port differs from what it expects. Keeps auto-create useful for the common case without pretending to solve the impossible one.
- **Create-where-possible, warn-otherwise:** honest floor — a loud, specific warning is always achievable even if OSCBase write access is limited.

## Dependencies

- None new. Changes `build-plugin-xml.mjs` (one plugin, two components) and `pam-OSC.lua` (self-check). Consumes the already-fixed bundled OSC file.

## Build Plan

```
Level 1 — Generator: T1      build-plugin-xml.mjs → emit ONE UserPlugin with two components; keep GUIDs; mini-bump version · files: app/scripts/build-plugin-xml.mjs, app/src/plugin-xml.test.ts · → AC-1, AC-7
Level 2 — Settings:  T2      make SettingsPage reachable as the plugin's "Settings" component        · files: SettingsPage.lua, pam-OSC.lua · → AC-2
Level 3 — Self-check:T3      OSC self-check on start: read OSCBase, verify by name, create-or-warn    · files: pam-OSC.lua (+ regenerate XML) · → AC-3, AC-4, AC-5
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| -------- | --------- | ---------------------- | --------- | ---- |
| One UserPlugin with two components | User imports/sees one tool; settings not lost | Keep two pool entries | Depends on MA3 multi-component invocation (verify onPC) | 2026-07-19 |
| Auto-create with default ports only | Cannot learn custom ports pre-OSC; warn on mismatch | Have the app inject ports first | Custom-port users still need the guide; auto-create covers the default case | 2026-07-19 |
| Create-where-possible, warn-otherwise | OSCBase write surface unverified; warning is the guaranteed floor | Assume full create works | Some entries may stay manual until onPC confirms | 2026-07-19 |

## Open Questions

- [ ] **onPC-pending — OSCBase writable properties:** confirm the full set (Destination IP, direction/Input-Output, Receive/ReceiveCommand/SendCommand) settable via `OSCBase:Append()` on onPC 2.x. Determines how much of AC-4 auto-creates vs. degrades to AC-5 warnings. (Shared with PAM-18 uninstall's OSCBase delete.)
- [ ] **onPC-pending — multi-component invocation:** verify how a named component ("Settings") of one UserPlugin is invoked so AC-2 holds with a single pool entry.
