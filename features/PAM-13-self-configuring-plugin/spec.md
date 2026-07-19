# PAM-13: Self-configuring plugin — one plugin, OSC entries handled on start

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-18 · **Last Updated:** 2026-07-18

## Why

Console-side setup is the product's adoption bottleneck. Two things make it worse than it needs to be: the user currently imports and sees **two** separate UserPlugins ("pam-osc Start Stop" + "pam-osc Settings") for what feels like one tool, and the two required OSC entries must be created by hand — the bundled OSC-config file even ships only the *Receive* entry, so importing it alone doesn't set up feedback (PAM-9 open question). This feature collapses that: **one** plugin to import, and the plugin checks its own OSC configuration on start — creating the missing entries where the MA3 Lua API allows it, and warning clearly where it can't.

## Dependencies

- PAM-2 (bridge engine + the ported `pam-OSC.lua`)
- PAM-9 (setup assistant — installs the bundled plugin + OSC-config files; AC-6 fixes its bundled-OSC gap)
- PAM-12 (plugin v2 protocol / version handshake — must not regress)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given the user imports the pam-osc plugin into a GrandMA3 plugin pool, when they look at the pool, then there is exactly **one** pam-osc UserPlugin to import and run — not two separate entries.
- [ ] **AC-2** — Given the single merged plugin, when the user wants to change options (resend buttons, send colors, send names, send timecode, fixed page number), then all options that the old "pam-osc Settings" plugin exposed are still configurable from within the one plugin — no option is lost. _(How settings are reached inside one plugin — component/argument/menu — is `/design` work.)_
- [ ] **AC-3** — Given the plugin starts on the console, when it runs its OSC self-check, then it inspects the console's OSC configuration for both required entries (a Receive entry on the send port; a Send entry named exactly `pam-osc`) and reports the result on the console.
- [ ] **AC-4** — Given a required OSC entry is missing **and** the MA3 Lua API permits creating it with the needed properties, when the self-check runs, then the plugin appends the missing entry (via `ShowData().OSCBase:Append()`) with the correct name / port / direction / command toggles, so feedback works without any manual OSC steps. _[verify on onPC — see Open Questions]_
- [ ] **AC-5** — Given a required OSC entry is missing and the plugin **cannot** create or safely verify it (API limitation, ambiguous state), when the self-check runs, then the plugin prints a clear, human-readable warning on the console naming exactly which entry is missing and the expected name/port — never a silent failure.
- [ ] **AC-6** — Given the app installs the bundled OSC-config file (PAM-9 AC-2b), then that file contains **both** entries (the Receive entry and the Send entry named `pam-osc`) with correct ports and toggles — closing PAM-9's open question that it currently ships only the Receive entry.
- [ ] **AC-7** — Given the merged, self-configuring plugin, when the app runs its `pamPing` version handshake, then the plugin answers with a valid protocol version and all PAM-2 feedback and PAM-12 CMD-mode behavior continues to work unchanged (no regression).

## Out of Scope

- Auto-starting or keeping the plugin running across sessions/showfile loads — that is PAM-15.
- Pushing the plugin to the console over the network — still a P2 roadmap idea (PAM-9 out of scope).
- Changing the app↔plugin OSC message protocol — this feature is console-side self-configuration only.

## Edge Cases

- **EC-1** — An OSC entry with the right name but wrong port/toggles already exists → the plugin should detect the mismatch and warn (or correct it), not create a duplicate.
- **EC-2** — Ports differ from the defaults (user changed send/receive ports in the app) → the plugin must self-check against the *actual* expected ports, not hardcoded ones. _(How the plugin learns the expected ports is an Open Question.)_

## Open Questions

- [ ] **OSCBase property set** — the forum shows `Name` and `Port` on `ShowData().OSCBase:Append()`, but the full property set needed for a working entry (destination IP, direction / Input vs Output, the *Receive* / *Receive Command* / *Send Command* toggles) is undocumented. **Verify on onPC** via `oscbase:Children()` + `:Dump()` against a hand-made working entry before relying on auto-create. If a needed flag isn't settable from Lua, AC-4 degrades to AC-5 (warn only) for that entry. [NEEDS CLARIFICATION: full writable OSCBase property set on onPC 2.x]
- [ ] **How the plugin knows the expected ports** — the send/receive ports are chosen in the app; the plugin reads options from `GlobalVars`. Does the plugin already know the ports, or must the app inject them (e.g. via `SetVar`)? _Resolved 2026-07-19 (design): auto-create uses default ports 9003/9004 (the plugin can't learn app-chosen custom ports before OSC works); it warns when an entry exists by name but the port differs; custom-port setups stay covered by the app guide/wizard._
- [ ] **Merge mechanism** — can one MA3 UserPlugin expose the settings dialog (multiple components / an argument / an in-plugin menu) so AC-2 holds with a single pool entry? Verify against the MA3 plugin model. _(Design detail, not a contract blocker.)_

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| One plugin, not two | The two-entry import ("Start Stop" + "Settings") reads as two tools and adds a setup step for no user benefit | 2026-07-18 |
| Create-where-possible, warn-otherwise | Auto-create is the goal, but the Lua API's OSC-config surface is unverified; a loud warning is the honest floor we can always guarantee | 2026-07-18 |
