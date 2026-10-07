# PAM-35: Setup flow in testable order — wizard, MA3 tab and generated OSC config

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-10-07 · **Last Updated:** 2026-10-07

## Why

The setup flow asks for a connection test before anything is set up on the console. The check needs both OSC entries on MA3 to get any answer, and the plugin to get a green one, so the first test is guaranteed to fail and a new user's first impression is "it doesn't work". The console-side steps are also mixed up: the plugin import hides under "Set up OSC", the USB route for real consoles is missing from the wizard, and the bundled OSC config only fits onPC on the same machine with default ports. This feature reorders setup so that every test comes **right after** the step it verifies: first the console answers, then the plugin runs, then a fader moves. The app also **generates** the OSC config for the user's actual setup (local onPC or a remote console), so the console side shrinks to "import, pick interface". _(Maintainer review of the setup flow, 2026-10-07.)_

## Dependencies

- PAM-14 (first-run wizard — reordered here; its AC-4 is superseded by AC-6/AC-8 below)
- PAM-9 (MA3 setup assistant — install + guide reused; the OSC config it installs becomes generated, AC-5)
- PAM-23 (USB export — reused; the OSC config it copies becomes generated, AC-5)
- PAM-4 (connection check — reused for the staged tests)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given the setup wizard, then its steps run in this order: **Welcome → Controller → Where is your MA3? → Copy the files → OSC on the console → Start the plugin**. The step header and the "Step N of 6" counter agree, and no card inside a step shows a numbering of its own that conflicts with the wizard's.
- [ ] **AC-2** — Given the Controller step with one or more chosen controllers, then each one shows **live** whether its MIDI input port is connected on this computer (it updates on hot-plug). The MIDI in/out ports can be re-picked from the connected ports right there. Next stays disabled while a chosen controller has no input port selected.
- [ ] **AC-3** — Given the "Where is your MA3?" step, then the user picks **"onPC on this computer"** (the console address becomes `127.0.0.1`) or **"a console or onPC on another computer"** (an IP/hostname field). Ports sit behind an "Advanced" disclosure with their current values. This step runs **no** connection test. Next saves and applies the settings.
- [ ] **AC-4** — Given the "Copy the files" step, then it follows the choice from AC-3: **this computer** → one-click install of the plugin and OSC config into the detected onPC installation (PAM-9); **another computer** → copy to a USB stick or chosen folder (PAM-23). The other route stays reachable as a secondary option. When "this computer" is chosen but no onPC installation is found, the step says so and offers the USB/folder route.
- [ ] **AC-5** — Given the app installs (onPC) or copies (USB / folder) the OSC config, then it writes an OSC config **generated from the current values**, not the static bundled file. It contains both entries: a receive entry on the **send port**, and a send entry named exactly `pam-osc` with destination = **this computer's address** and port = the **receive port**, with the same toggle set as the maintainer's working export. The destination is `127.0.0.1` when the console runs on this computer. Otherwise it is this computer's address **on the console's network**: picked automatically when exactly one local address shares the console's subnet. When several addresses could apply, the user can pick from a list, and a visible hint asks them to check it; the app never guesses silently. When no network address exists, the app explains why the config cannot be written. The main process rejects anything that is not a valid IPv4 address or a port in 1–65535.
- [ ] **AC-6** — Given the "OSC on the console" step, then the guide leads with **importing the generated pam-osc OSC config** on the console and picking the network interface. The manual two-entry setup (PAM-9 AC-5, with live values) is a fallback. A live check targets **"console reachable"**: when the console answers but the plugin doesn't yet, the step shows that as **success for this step** ("OSC works — next: start the plugin"), not as an error.
- [ ] **AC-7** — Given the "Start the plugin" step, then it guides importing and running the plugin, and a live check targets **"connected"** (console reachable + plugin running). On success it invites the user to move a fader. Each chosen controller shows bound/missing, and a missing controller is named explicitly instead of a blanket "you're live". An outdated plugin shows the update hint.
- [ ] **AC-8** — Given a step with a live check (wizard steps 5–6, or the MA3 tab while not connected), when it is shown, then the app starts the bridge if it is stopped and something is bound, re-checks **immediately**, and then re-checks about **every 5 s** until the target state is reached. The result appears without the user pressing "Re-check". Between polls the shown result does not flicker back to "checking". Repeated identical results do not flood the session log.
- [ ] **AC-9** — Given the MA3 tab, then it follows the same order and numbering: **1 — Copy the files** (onPC install and USB/folder copy, in the order that fits the console address), **2 — OSC on the console** (with the AC-8 live check, target "reachable"), **3 — Import & start the plugin** (live check, target "connected").
- [ ] **AC-10** — Given the Status tab reports "no response from GrandMA3", then its hints describe the **correct** console setup: a receive entry on the send port with Receive + Receive Command; a send entry named exactly `pam-osc` → this computer, on the receive port, with only Send Command. There is no v1 "line 2" fallback and no "port = send port" for the send entry, and the hints offer a button into the MA3 setup guide.
- [ ] **AC-11** — Given the console fields (Setup tab and wizard), then the port labels say **which side listens**: "Send port — MA3 listens here" and "Receive port — pam-osc listens here (feedback)".

## Out of Scope

- The plugin creating its own OSC entries / merging into one plugin — that is PAM-13; this feature only makes the manual/import path logical.
- Pushing files to the console over the network (still a parked idea).
- A "press a key" MIDI confirmation in the Controller step — parked in `docs/ideas.md`; port presence + the final "move a fader" moment cover it for now.
- Persisting the chosen "this computer" address — it is re-derived each time (auto-pick, or the user's pick for the session).

## Edge Cases

- **EC-1** — No controller was chosen (the user continued without one) → the bridge cannot run, so the live checks in steps 5–6 cannot either. The steps explain that and link back to the Controller step. Next and Finish still work (PAM-14 EC-1 spirit: never block).
- **EC-2** — The console address is a hostname, so no subnet match is possible → fall back to the single local address, or to the user's pick when there are several (AC-5).
- **EC-3** — The setup is already working when the guide is re-opened → steps 5–6 show their success state right away.
- **EC-4** — An OSC config already exists at the target → the existing replace/keep confirmation applies (PAM-9 AC-2, PAM-23 AC-5).

## Open Questions

- [ ] **Generated config on a fresh console (verify on onPC + a real desk)** — inherits PAM-9's open question. Does importing the generated file keep DestinationIP, Port and the Receive / Receive Command / Send Command toggles? The generator copies the attribute style of the maintainer's working export (toggles left at their default are omitted), so the semantics match today's bundled file. Also confirm the console gesture for importing an OSC config (the import action in MENU → In & Out → OSC). The guide wording follows whatever the onPC test shows.

## Decision Log

### Product Decisions

| Decision                                                              | Rationale                                                                                                                                          | Date       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Test only after the console-side step it verifies; two staged checks | The check can't answer before OSC exists; "reachable" (OSC ok) and "connected" (plugin ok) are separately detectable — each step proves one thing | 2026-10-07 |
| Generate the OSC config per setup, also for remote consoles (USB)     | Maintainer: "grandios" — removes the hand-typed IP/ports, the most error-prone console step; the static file only fit onPC-on-this-machine        | 2026-10-07 |
| New feature PAM-35 instead of a PAM-14 delta                          | Touches three approved features (PAM-14, PAM-9, PAM-23) plus Status hints; PAM-14 AC-4 is superseded on purpose                                     | 2026-10-07 |
| Auto-pick "this computer" by subnet, visible pick when ambiguous      | PAM-9 EC-2 already forbids silent guessing; most setups have exactly one address on the console's network                                         | 2026-10-07 |
