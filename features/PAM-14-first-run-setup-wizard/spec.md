# PAM-14: First-run setup wizard — launch to a verified connection

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-18 · **Last Updated:** 2026-07-18

## Why

The PRD's headline success metric is "download to a moving fader in under 10 minutes, without touching a terminal." Today a first-time user is dropped onto the plain Setup tab with `127.0.0.1` pre-filled and no signpost: the hardest task (console-side plugin + OSC setup) sits unadvertised on the second tab, and the engine is started from a *third* tab — so "Save & apply" silently dead-ends. This wizard sequences the screens that already exist into one linear first-run flow that ends in a verified connection and a "move a fader" success moment. It is the flagship fix from the UX review (§4) and resolves UX-C1 and UX-H1/H4.

## Dependencies

- PAM-3 (setup & settings UI — the wizard reuses the console fields)
- PAM-4 (status & diagnostics — the wizard reuses the live connection check)
- PAM-9 (MA3 setup assistant — the wizard reuses install + OSC guide)
- PAM-5 (v1 import — optional path in the controller step)
- PAM-13 (self-configuring plugin — hollows out the OSC step; soft dependency, not required to ship the wizard)

## User Stories

- As a **first-time user**, I want to be guided step by step from opening the app to a working fader, so that I never have to guess which tab to visit or read documentation.
- As a **returning user**, I want the wizard out of my way but re-openable, so that first-run help never becomes a nuisance.

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given the app is launched for the first time (no completed-wizard flag in settings), when it opens, then the setup wizard is shown automatically instead of the plain tabbed UI.
- [ ] **AC-2** — Given the wizard is open, when the user chooses, then they can skip it to the normal tabbed UI at any step; and once skipped or completed it is re-openable from a visible "Setup guide" action (it does not auto-open again on later launches).
- [ ] **AC-3** — Given the controller step, when the user picks a bundled board (or imports a v1 mapping), then an active mapping is created so there is something to bridge by the end of the wizard.
- [ ] **AC-4** — Given the connection step, when the user enters the console IP and ports and runs the in-step connection test, then they see a clear reachable / plugin-running / not-reachable result (reusing PAM-4 logic) before they can complete this step.
- [ ] **AC-5** — Given the console-files step, when a local onPC installation is detected, then the wizard installs the plugin + OSC config with one click (reusing PAM-9); when none is found, it shows the USB route instead.
- [ ] **AC-6** — Given the OSC step, then the wizard shows the guided OSC-entry setup with the user's live ports and IP (reusing PAM-9's guide); when PAM-13 self-configuration is present, the step reflects "the plugin sets this up itself — just run it" and shows the manual steps only as a fallback.
- [ ] **AC-7** — Given the final step, when the live connection check passes (console reachable, plugin running, feedback received), then the wizard shows a success state that invites the user to move a fader, and finishing marks the wizard complete.
- [ ] **AC-8** — Given the wizard is completed, then the bridge is running (or there is one obvious "Start bridge" action in the success step) — so a first-run user is never left needing to discover the Status tab to start the engine (resolves UX-H1 for first run).

## Out of Scope

- Redesigning the existing tabs — the wizard reuses them; any tab reorder/rename (UX-H4) is a separate small change.
- Onboarding multiple controllers in one pass — the wizard sets up one; more are added later via Setup.
- The console-side auto-configuration itself — that is PAM-13; the wizard only surfaces it.

## Edge Cases

- **EC-1** — The connection test never turns green (wrong IP, firewall, plugin not run) → the user can still finish/skip, but the wizard clearly flags that feedback isn't confirmed yet and links to diagnostics, rather than blocking them forever.
- **EC-2** — No bundled board fits the user's hardware → the controller step must offer a way forward (import v1, or proceed and build a mapping later) instead of a dead end.

## Open Questions

- [ ] **Auto-start on finish** — should completing the wizard auto-start the engine (AC-8 first reading), or land on Status with "Start bridge" emphasized? Leaning auto-start for the least friction; confirm during `/design`.
- [ ] **Completed-flag storage** — the wizard-done flag belongs in App Settings; confirm it survives updates and isn't wiped by a settings migration. _(Design detail.)_

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Reuse existing screens, don't rebuild | The MA3 guide, console fields, and connection check already work well; the gap is sequencing, not the screens | 2026-07-18 |
| End on a verify + "move a fader" moment | The PRD success metric is a moving fader; staging that proof is what turns setup into a win | 2026-07-18 |
