# PAM-15: Plugin auto-start / OSC re-arm (best effort)

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-18 · **Last Updated:** 2026-07-18 · **Priority: P1 — later** (maintainer flagged this as "maybe later")

## Why

The plugin must be run by hand after every session / showfile load — a recurring annoyance. GrandMA3 has **no native autostart hook** for plugins, so a guaranteed "always running" is impossible and we must not pretend otherwise. What *is* possible: once OSC-in is configured, the app can re-trigger the plugin with an OSC command-line call when it detects the console is reachable but the plugin isn't answering. This is a **best-effort** convenience, explicitly not a guarantee.

## Dependencies

- PAM-4 (status & diagnostics — detects the "reachable but plugin not answering" state that triggers a re-arm)
- PAM-13 (self-configuring plugin — the OSC entries must be reliably present for the re-arm call to reach the console)
- PAM-2 (bridge engine)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given the console is reachable but the plugin is not answering (PAM-4 plugin-missing state) and re-arm is enabled, when the app is running, then it attempts an automatic re-trigger instead of only telling the user to run the plugin by hand.
- [ ] **AC-2** — Given the app attempts a re-trigger, when it sends the trigger, then it issues an OSC command-line call that runs the plugin (e.g. `Plugin "pam-osc"`) through the already-configured OSC-in entry. _[verify on onPC — see Open Questions]_
- [ ] **AC-3** — Given the re-arm feature, then it is an explicit, off-by-default (or clearly opt-in) option labeled honestly as **best effort** — e.g. "Try to re-run the plugin automatically (best effort)" — and never promises guaranteed always-on.
- [ ] **AC-4** — Given repeated failures, when re-arm attempts don't restore the plugin, then the app backs off and stops retrying after a bounded number of attempts, falling back to the existing "please run the plugin" guidance — it must not spam the console or flood the traffic log.
- [ ] **AC-5** — Given the plugin is running normally, then the re-arm mechanism sends nothing and does not disturb normal operation.

## Out of Scope

- True OS/console-level autostart on showfile open — no native hook exists; the DMX-remote and scheduler/agenda workarounds are documented *guidance* for the user, not app features.
- Auto-starting the app's own bridge engine — a separate concern.
- Session-master vs non-master handling on multi-station setups beyond documenting the limitation.

## Edge Cases

- **EC-1** — The console is a real console (not onPC) where external OSC command input may be restricted → re-arm may simply never succeed; AC-4's backoff + guidance is the fallback.
- **EC-2** — Multiple pam-osc units / mappings active → a single `Plugin "pam-osc"` call still targets the one console-side plugin; confirm it doesn't double-fire per unit.

## Open Questions

- [ ] **Can OSC command input call a plugin?** — the linchpin. **Verify on onPC** that an OSC message on the Receive-Command entry can execute `Plugin "pam-osc"` (or an equivalent command) and actually start the plugin loop. If OSC command input cannot invoke a plugin, AC-2 is infeasible and this feature degrades to improved guidance only. [NEEDS CLARIFICATION: OSC command-line → plugin call on onPC 2.x]
- [ ] **Session-master limitation** — external OSC inputs and agenda events are processed only on the session-master station; document that re-arm only works reliably there.
- [ ] **Which entry carries the command** — confirm the Receive entry with *Receive Command* on is the one that executes an arbitrary command string sent by the app.

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Best-effort re-arm, not "always on" | MA3 has no native plugin autostart; over-promising would erode trust when it inevitably fails | 2026-07-18 |
| Opt-in, honestly labeled | Silently re-firing commands at a live console is surprising; the user must choose it knowingly | 2026-07-18 |
