# PAM-37: Tray mode & launch at login — the bridge survives a closed window

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. -->

## Status: Spec'd

**Created:** 2026-10-07 · **Last Updated:** 2026-10-08 (approved by the maintainer)

> Lite spec. Direction from the maintainer in chat (2026-10-07: "Tray-Modus und optional
> 'beim Login starten' einplanen"). Product decisions approved by the maintainer on 2026-10-08.

## Why

Today the bridge _is_ the window: closing it stops the engine and quits the app. During a show that is the
single easiest way to lose every fader — one click on the wrong ✕, and nothing in the app warns you. An
external review of pam-osc named exactly this ("if one link in the chain fails, the faders stop; it has to
start reliably after every restart") as the main operational risk. pam-osc should keep bridging with the
window closed, and — if the user wants — come up on its own after a reboot of the show computer.

## Dependencies

- PAM-3 (App Settings — new preferences persist there; the bridge already auto-starts from saved settings)
- PAM-4 (connection/plugin status — shown in the tray)
- PAM-34 (auto-update — "install on next launch" must keep working when the launch is a login launch)

## Acceptance Criteria

- [ ] **AC-1** — Given the bridge is running, when the user closes the main window, then the app keeps
      running in the system tray (macOS: menu bar) and MIDI ↔ MA3 traffic continues uninterrupted.
- [ ] **AC-2** — Given the app is in the tray, when the user opens the tray menu, then it shows the live
      connection state (console / plugin, as in the Status tab) and offers **Open pam-osc**, **Start/Stop
      bridge** and **Quit pam-osc**.
- [ ] **AC-3** — Given the window is closed for the first time, then a one-time notice tells the user that
      pam-osc keeps running in the tray/menu bar and how to quit it — never a silent disappearance.
- [ ] **AC-4** — Given the user wants the old behaviour, when they switch off **"Keep running when the window
      is closed"** in Settings, then closing the window quits the app as today. Default: **on**.
- [ ] **AC-5** — Given **"Start pam-osc at login"** is switched on in Settings (default: **off**), when the
      user logs in to the computer, then pam-osc starts in the tray without opening its window and the bridge
      starts from the saved settings (as on a normal launch).
- [ ] **AC-6** — Given pam-osc is already running in the tray, when the user launches it again (dock, start
      menu, app icon), then the existing instance opens its window — no second instance, no second bridge.
- [ ] **AC-7** — Given the user quits explicitly (tray menu **Quit**, ⌘Q / app menu Quit), then the app
      stops the bridge and exits exactly as quitting does today (session log closed, engine shut down).

## Out of Scope

- Starting the **MA3 plugin** automatically — console side, PAM-15.
- Running pam-osc as a headless OS service/daemon without a logged-in user.
- A full status dashboard in the tray — the tray shows state and the three actions, the window stays the UI.

## Edge Cases

- **EC-1** — An update is scheduled to "install on next launch" (PAM-34) and the next launch is a login
  launch → the install behaves as on a normal launch; a login launch must never silently skip or loop it.
- **EC-2** — Linux desktops without a tray (some GNOME setups) → closing the window must not leave an
  invisible, unreachable app: without a tray, AC-4's quit-on-close behaviour applies.
- **EC-3** — The bridge is stopped and the window is closed → the app still goes to the tray (AC-1 holds
  regardless of bridge state, so "Start bridge" stays reachable).
- **EC-4** — "Start at login" was switched on, then the app is moved or uninstalled → no broken login item
  left behind that the OS reports as an error (as far as the OS allows).

## Open Questions

- [x] Default for AC-4 — **on** (show safety beats habit; the AC-3 notice explains it once). Confirmed by the maintainer 2026-10-08.
- [x] Linux "start at login" — Electron's login-item API covers macOS/Windows only; Linux needs an XDG
      autostart entry. **Resolved 2026-10-08: macOS/Windows in this feature; Linux login-start is a
      follow-up** (parked in `docs/ideas.md`). AC-5 applies to macOS and Windows.

## Decision Log

### Product Decisions

| Decision                              | Rationale                                                                      | Date       |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| Tray mode on by default               | An accidental window close must not end the show; the notice prevents surprise | 2026-10-07 |
| Start at login opt-in, off by default | Starting software at login is the user's call, not ours                        | 2026-10-07 |
| Linux login-start as a follow-up      | Electron covers macOS/Windows; XDG autostart is separate work (maintainer)     | 2026-10-08 |
| Spec approved as written              | Maintainer accepted all recommendations                                         | 2026-10-08 |
| Login launch starts hidden, bridge on | A reboot of the show computer should come back bridging without a click        | 2026-10-07 |
