# PAM-34: In-app auto-update

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md. -->

## Status: Spec'd

**Created:** 2026-10-07 · **Last Updated:** 2026-10-07 (delta after the beta.3 UI preview)

> Full spec. The updater downloads and executes code from the internet — treated as
> risk work: `/design` and `/review` before it goes live.

## Why

Today every new version means: find the GitHub release, pick the right file, reinstall by
hand. Most users stay on whatever they installed first, and beta testers lag behind the
fixes they are supposed to test. pam-osc should notice a new release by itself, fetch it in
the background and install it with one click or on the next quit — without ever disturbing
a running show.

## Dependencies

- PAM-8 (code signing) — partially done: macOS builds are signed + notarized since
  v2.0.0-beta.2 (required — the macOS updater refuses unsigned updates). Windows stays
  unsigned; the updater must still work there.
- Release pipeline (`.github/workflows/release.yml`) — must publish the update metadata
  the app reads.

## User Stories

- As an operator, I want pam-osc to tell me when an update is ready and install it when I
  close the app, so I stay current without hunting for downloads.
- As an operator in a live show, I want the app to never restart or install on its own
  while I am working, so an update can never interrupt a show.
- As a beta tester, I want to receive new betas automatically, so I always test the latest
  build.
- As a stable user, I want to never receive a beta unless I opt in.
- As a first-time Mac user, I want one Mac download that just works, so I can't pick the
  wrong file for my chip.

## Acceptance Criteria

**Format:** **AC-N** — Given / When / Then

### Checking and downloading

- [ ] **AC-1** — Given the app starts with internet access and "check for updates
      automatically" is on, when a newer release exists for the user's channel (AC-8),
      then the app downloads it in the background without blocking the UI, the MIDI
      engine or OSC traffic.
- [ ] **AC-2** — Given a check or download fails (no internet, GitHub unreachable,
      timeout — common on isolated lighting networks), when it fails, then the app keeps
      running normally, shows no error dialog or blocking notice, and records the failure
      only in the session log / support package. It retries at the next start (and at
      most periodically while running — interval decided in `/design`).
- [ ] **AC-3** — Given an update was downloaded, when its integrity check fails (checksum
      mismatch, or on macOS the code signature is not the expected Developer ID), then the
      update is discarded, never installed, and the failure is logged.
- [ ] **AC-4** — _(delta 2026-10-07: moved from the Setup view to the app menu)_ Given the
      app is running, when the user opens the **Help** menu, then it offers **Check for
      Updates…**, shows the installed version, and a manual check answers with a short
      dialog ("up to date" / "available — downloading" / "couldn't check: …"). No update
      card in the Setup view.

### Installing — never during a show

- [ ] **AC-5** — _(delta 2026-10-07)_ Given an update has been downloaded, when it is ready,
      then the app shows a slim, non-blocking bar "Update v… is available" with
      **On next launch** and **Install now**. The bar can be dismissed and does not cover the
      board editor or status views.
- [ ] **AC-6** — Given an update is ready, when the user clicks **Install now**, then the
      app asks for confirmation if the bridge is connected/active ("this restarts pam-osc
      and interrupts MIDI ↔ MA3"), and only on confirm quits, installs and relaunches the
      new version.
- [ ] **AC-7** — _(delta 2026-10-07: no more install-on-quit)_ Given an update is ready,
      when the user quits the app, then **nothing is installed**. The app never quits,
      restarts or installs without the user clicking Install now (AC-6) or choosing On
      next launch (AC-15).

### Channels

- [ ] **AC-8** — Given the setting "receive beta updates" is off, when a check runs, then
      only regular (non-pre-release) GitHub releases are considered. Given it is on, then
      GitHub releases marked **pre-release** are considered as well. The maintainer
      controls the channel solely through GitHub's "Set as a pre-release" flag.
- [ ] **AC-9** — Given a user installed a beta version (version with a pre-release suffix,
      e.g. `2.0.0-beta.3`), when the app starts for the first time with this setting
      unset, then "receive beta updates" defaults to **on**; for stable installs it
      defaults to **off**.
- [ ] **AC-10** — Given a beta user turns "receive beta updates" off, when a check runs,
      then the app does not downgrade; it stays on the installed beta until a stable
      release with a higher version exists, then updates to it.

### Release artifacts

- [ ] **AC-11** — Given a release is built, when the pipeline finishes, then macOS ships
      **one universal** installer (`pam-osc-<version>-mac-universal.dmg`, runs natively on
      Apple Silicon and Intel) instead of separate per-arch files, and the release
      contains the update metadata for macOS, Windows and Linux that the app reads.
- [ ] **AC-12** — Given the Windows build is unsigned, when a Windows user receives an
      update, then download, integrity check (AC-3, checksum part) and install-on-quit
      work the same as on macOS.
- [ ] **AC-13** — Given the Linux AppImage, when an update is ready, then it is applied
      the same way; if the AppImage location is not writable, the app falls back to a
      notice with a link to the release page instead of failing silently.

### Control

- [ ] **AC-14** — Given the setting "check for updates automatically", when it is off,
      then the app makes no update request at all unless the user clicks **Check for
      Updates…**. Both update settings are checkboxes in the **Help** menu _(delta
      2026-10-07)_ and persist with the other App Settings.

### Install on next launch (delta 2026-10-07)

- [ ] **AC-15** — Given an update is ready, when the user clicks **On next launch**, then the
      bar reads "Update v… installs on next launch"; at the next start the app installs
      that version **before the bridge starts** (bar: "Installing update v…"), restarts
      once and runs the new version. The schedule is forgotten before installing, so a
      broken update never loops.
- [ ] **AC-16** — Given a scheduled install at start fails, finds nothing to install, cannot
      install from this location, or has not restarted the app within 2 minutes, when that
      happens, then the schedule is cleared, the bridge starts normally and the reason is
      logged — the user is never left without a running bridge.

## Out of Scope

- Updating the **MA3 Lua plugin** on the console — stays with PAM-9 / PAM-23 (the app can
  only point out a plugin version mismatch, as today).
- Delta/partial updates, rollback to a previous version from inside the app — rollback
  stays "install the previous release manually".
- Windows code signing / SmartScreen — PAM-8.
- Users on v2.0.0-beta.2 or older get no automatic update to the first updater version —
  they install it once by hand (release notes say so).
- A self-hosted update server — GitHub Releases only.

## Edge Cases

- **EC-1** — App is closed by the OS (shutdown/logout) while an update is ready → install
  on quit may or may not run; either way the old version must still start correctly.
- **EC-2** — Two releases appear while the app is running → only the newest is installed;
  a half-finished older download is dropped.
- **EC-3** — User installs a version manually that is newer than the downloaded update →
  the pending update is discarded, never "downgrades".
- **EC-4** — macOS app runs from the mounted dmg or outside `/Applications` → updater
  cannot replace it; show the same link-fallback notice as AC-13 and a hint to move the
  app into Applications.
- **EC-5** — The release has been created but is still a **draft** → never offered (drafts
  are invisible to the updater); the maintainer publishes when ready.

## Technical Requirements

- Update requests go only to GitHub (`github.com` / its release asset hosts); no other
  server, no telemetry, no identifiers sent beyond what an HTTPS download implies.
- No network activity related to updates before the UI is up; must not delay app start.
- The updater must never touch the MIDI/OSC engine state; installing implies a normal
  app quit (ports closed cleanly as today).
- App Settings gain two fields (auto-check, beta updates) — `/design` updates
  `docs/data-model.md`.

## Open Questions

- [x] Default for "check for updates automatically": **on** — confirmed by the maintainer
      2026-10-07 (the check contacts GitHub only; AC-14 lets users turn it off).
- [ ] Release notes in the "update ready" notice (short text from the GitHub release) —
      nice to have, decide in `/design` (rendering untrusted markdown → plain text only).

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| --- | --- | --- |
| GitHub Releases as the only update source (electron-updater) | Releases already live there; no server to run; pre-release flag gives channels for free | 2026-10-07 |
| Install only on quit or on explicit click — never self-restart | Live-show safety: a restart interrupts MIDI ↔ MA3 | 2026-10-07 |
| Beta channel = GitHub "pre-release" flag + Settings toggle; beta installs default to on | Maintainer already sets the flag for betas; testers stay on betas without extra steps | 2026-10-07 |
| One universal macOS dmg instead of apple-silicon / intel files | Testers picked the wrong file; separate per-arch builds also overwrite each other's macOS update metadata | 2026-10-07 |
| Updates live in the Help menu, only a slim bar appears when one is available | Updates are not a core feature; the Setup card was visual noise (maintainer, beta.3 preview) | 2026-10-07 |
| No install on quit — "On next launch" instead | Closing after a show and reopening must not be slowed down by a surprise install; the user decides (maintainer) | 2026-10-07 |
| "Check for updates automatically" defaults to on | The feature is pointless if off by default; only GitHub is contacted, and it can be switched off | 2026-10-07 |
