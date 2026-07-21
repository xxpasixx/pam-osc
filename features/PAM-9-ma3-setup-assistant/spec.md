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
- [ ] **AC-2b** — Given a detected installation, when I click "Install" on the **OSC config**, then the bundled OSC-config `pam-osc.xml` is copied into `…/gma3_library/inout/osc/` (same overwrite-confirm and error rules as AC-2/AC-3), so the console's OSC entry can be created by import instead of by hand. _(Delta 2026-07-18: maintainer exported a ready-made OSC config to bundle.)_
- [ ] **AC-3** — Given the copy fails (permissions, folder vanished), then the app shows a friendly error with the exact source and target paths for manual copying, plus a "reveal bundled plugin file" button (Finder/Explorer).
- [ ] **AC-4** — Given no local MA3 installation is found (real-console setup), then the assistant shows the USB route instead: the folder layout to create on the stick (`gma3_library/datapools/plugins/`) and the reveal-file button.
- [ ] **AC-5** — Given the assistant's setup guide, then it walks through the MA3 configuration step by step **with live values from my settings**, opening at **MENU → In & Out → OSC** and telling me to pick the right network card in the Interface list, then set up **two entries**: a **Receive** entry (name irrelevant) on the send port with *Receive* + *Receive Command* on, and a **Send** entry named exactly `pam-osc` with destination IP = this machine's IP (shown by the app), destination port = the receive port, and only *Send Command* on; when settings change, the shown values change. _(Delta 2026-07-18: corrected navigation + two-entry setup from the maintainer.)_
- [ ] **AC-6** — Given the PAM-4 diagnosis reports "plugin not answering" (no pong), then it links directly into this setup guide.
- [ ] **AC-7** — Given a pam-osc plugin is already installed in a detected MA3 folder, when the install card renders, then it compares the installed plugin version against the bundled version and clearly shows a **version mismatch** on/near the install button (e.g. "installed 2.0.0.0 · bundle 2.0.0.1 — update available"), not just a generic "already exists". _(Delta 2026-07-18: maintainer wants the mismatch visible; plugin versions are patch-bumped on every change — see [[ma3-plugin-version-bump]].)_
- [ ] **AC-8** — Given a local onPC installation is detected and the plugin is missing or outdated, when the app starts (first run / setup wizard), then it can install/update the bundled plugin + OSC config **automatically** (opt-in), so the user need not trigger each install by hand. _(Delta 2026-07-18: "auto-install the plugin when installing pam-osc". Installing during the app's OS installer is out of scope — MA3 may be absent, paths/permissions unreliable — so auto-install runs on app launch when a real install is detected.)_

- [ ] **AC-9** _(delta 2026-07-21)_ — Given a detected local MA3 install has a `pam-osc` plugin **older than the bundled** version, then in addition to the install-card mismatch (AC-7), a dismissible **"MA3 plugin update available"** notice appears in the app's notification bar ([NoticesArea]) — bundled version vs. installed version — so the user sees the update without opening the setup assistant. When the installed version equals the bundled one, no notice is shown. _(Maintainer 2026-07-21: surface the "new plugin version not yet installed" state globally, both for the local disk here and for the USB stick in PAM-23 AC-8.)_

## Out of Scope

- Pushing the plugin to the console over the network (feasibility unknown — stays a P2 roadmap idea)
- Auto-importing or auto-starting the plugin inside MA3 (chicken-and-egg: would require working OSC, which is what's being set up; a best-effort OSC re-arm is PAM-15)
- Installing the plugin during the app's **OS installer** — MA3 may not be present and paths/permissions are unreliable at install time; auto-install runs on first app launch instead (AC-8)
- Linux MA3 paths (onPC does not exist on Linux; the app on Linux gets the AC-4 USB route)

## Edge Cases

- **EC-1** — Multiple MA3 versions installed → each detected folder is listed; the user picks (newest preselected).
- **EC-2** — Machine has several network interfaces → the guide shows all candidate IPs (or the one matching the console subnet, if determinable) rather than guessing silently.

## Open Questions

- [x] **The single-entry question** — _Resolved by the maintainer (2026-07-18): it is **two** entries, not one — a Receive entry (name irrelevant, Receive + Receive Command on) and a Send entry named exactly `pam-osc` (only Send Command on). The name matters only on the Send entry, which is the one the plugin/ping address by name. AC-5 reworded accordingly._
- [x] **Bundled OSC config completeness** — _Resolved 2026-07-18: the maintainer re-exported the OSC config with **both** entries and it was copied into `gma3_library/inout/osc/pam-osc.xml` (receive `pam-osc-recive` on 9003; send `pam-osc` on 9004). AC-2b one-click OSC install now ships both entries — but see the toggle caveat below before calling it turnkey._
- [ ] **OSC send-entry toggles (verify on onPC)** — in the re-exported bundle the send entry `pam-osc` has `Send="No"` and **no** `SendCommand` attribute, and the receive entry omits `Receive`/`ReceiveCommand`. MA3 likely treats absent attributes as defaults, but this must be confirmed by **importing the bundled file into a fresh console** and checking both entries end up with the right toggles (receive: Receive + Receive Command on; send: Send Command on) and feedback actually flows. If import doesn't yield working toggles, the guide's manual step 2 stays the source of truth. [NEEDS CLARIFICATION: confirm exported-file toggle semantics on fresh import]
- [ ] **SendOSC by name on the console** — the plugin and the connection ping now address the feedback entry as `SendOSC "pam-osc" …` (no index lookup, AC-8). Maintainer confirmed MA3 accepts the entry name; **verify on onPC 2.x** that the pong and live feedback actually arrive this way.

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Scope = local install + guide, not network push | Locally feasible today; network push feasibility is unproven and must not block the setup pain fix | 2026-07-17 |
| Guide shows live values instead of generic screenshots | Copy-paste-able concrete values are what cut setup time and Discord questions | 2026-07-17 |
