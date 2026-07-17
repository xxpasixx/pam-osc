# PAM-9: MA3 setup assistant — plugin install + in-app console setup guide

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-17 (promoted from the roadmap row "One-click Lua plugin install", scoped to the locally feasible variant)

## Why

The biggest v1 support pain is console-side setup: users must find and copy the plugin file by hand and configure the MA3 OSC entry correctly — both invisible from the app today. The PRD success metric is download → moving fader in under 10 minutes; this feature closes the console half of that: one click installs the bundled plugin into a local MA3/onPC installation, and an in-app guide shows the exact MA3 settings with the **user's real values** filled in.

## Dependencies

- PAM-3 (setup & settings UI — the guide reads console IP/ports from settings)
- PAM-4 (status & diagnostics UI — "plugin not answering" links into the guide)

## Decisions (maintainer, 2026-07-17)

1. **Local install only** — the app copies the plugin into MA3 installations on the same machine; pushing over the network to a real console stays an open P2 idea.
2. **Goal: a single OSC entry named `pam-osc`** — resolved by name, never by line number (matches PAM-12 AC-8); whether one entry can carry both directions is an open question to verify (below).
3. The guide is part of this feature (maintainer request 2026-07-17), not a separate one — install and configuration are one user journey.

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given MA3/onPC is installed on this machine, when I open the console setup assistant in the app, then it lists the detected MA3 plugin folders (all installed versions; standard install locations on macOS and Windows — exact paths are /design work).
- [ ] **AC-2** — Given a detected (or manually chosen) plugin folder, when I click "Install plugin", then the bundled `pam-osc.xml` is copied into `…/gma3_library/datapools/plugins/`; success shows the full target path and the next step (import via the console's plugin pool); an already-present `pam-osc.xml` is replaced only after confirmation.
- [ ] **AC-3** — Given the copy fails (permissions, folder vanished), then the app shows a friendly error with the exact source and target paths for manual copying, plus a "reveal bundled plugin file" button (Finder/Explorer).
- [ ] **AC-4** — Given no local MA3 installation is found (real-console setup), then the assistant shows the USB route instead: the folder layout to create on the stick (`gma3_library/datapools/plugins/`) and the reveal-file button.
- [ ] **AC-5** — Given the assistant's setup guide, then it walks through the MA3 configuration step by step **with live values from my settings**: create an OSC entry named exactly `pam-osc`, destination IP = this machine's IP (shown by the app), port(s) from settings, enable send/receive, import and start the plugin; when settings change, the shown values change.
- [ ] **AC-6** — Given the PAM-4 diagnosis reports "plugin not answering" (no pong), then it links directly into this setup guide.

## Out of Scope

- Pushing the plugin to the console over the network (feasibility unknown — stays a P2 roadmap idea)
- Auto-importing or auto-starting the plugin inside MA3 (chicken-and-egg: would require working OSC, which is what's being set up)
- Linux MA3 paths (onPC does not exist on Linux; the app on Linux gets the AC-4 USB route)

## Edge Cases

- **EC-1** — Multiple MA3 versions installed → each detected folder is listed; the user picks (newest preselected).
- **EC-2** — Machine has several network interfaces → the guide shows all candidate IPs (or the one matching the console subnet, if determinable) rather than guessing silently.

## Open Questions

- [ ] **The single-entry question** — can **one** MA3 OSC entry carry both directions? On separate machines presumably yes (one port, each side binds it locally once). The critical case is onPC on the **same** machine: app and MA3 would both bind the same local UDP port → likely conflict, which forces two ports. **Verify on onPC 2.x**; the guide then documents the verified minimal setup (goal: 1 entry named `pam-osc` if it works, otherwise the two-port setup, stated explicitly for both the same-machine and two-machine case). [NEEDS CLARIFICATION: blocks the final wording of AC-5's port steps, not the rest of the feature]

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Scope = local install + guide, not network push | Locally feasible today; network push feasibility is unproven and must not block the setup pain fix | 2026-07-17 |
| Guide shows live values instead of generic screenshots | Copy-paste-able concrete values are what cut setup time and Discord questions | 2026-07-17 |
