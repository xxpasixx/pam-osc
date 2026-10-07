# PAM-34 — Design

**Date:** 2026-10-07

> The technical design (HOW). Covers spec ACs AC-1 … AC-14 and EC-1 … EC-5. No code.
> Built on its own branch `feat/PAM-34-auto-update` (a parallel session edits the shared
> UI/main files for PAM-35 on `v2`) — PAM-34 logic therefore lives in **new files**; the
> shared files only get small wiring hunks.

## Component Structure

```
Main process
+-- Update Service (new, app/src/main/updater.ts)
|   +-- wraps electron-updater (GitHub provider, repo xxpasixx/pam-osc)
|   +-- state machine (see Data Model → Update Status)
|   +-- check scheduler: first check 30 s after the window is shown, then every 6 h
|   +-- install-on-quit (normal quit only) / install-now (on user request)
|   +-- writes every transition to the session log
+-- Update policy (new, pure, app/src/core/update/policy.ts — unit-tested)
|   +-- beta default from the installed version (AC-9)
|   +-- "may install now?" decision (AC-6, AC-7)
|   +-- fallback decision (AC-13, EC-4)
+-- wiring in main/index.ts (3 IPC handlers, start service, quit hook)

Renderer
+-- Update notice bar (new component, UpdateBar.tsx)
|   +-- shown only when status = ready (or fallback)
|   +-- "Update v… ready — installs when you close pam-osc"  [Install now] [×]
|   +-- confirm dialog when the bridge is active (AC-6)
+-- "Updates" panel in the Settings view (new component, UpdateSection.tsx)
    +-- installed version · last check result · [Check now]
    +-- [x] Check for updates automatically      (AC-14)
    +-- [x] Receive beta updates                 (AC-8)
```

The notice bar sits in the same slot as the existing status bar row, never over the editor
or status views (AC-5). It is dismissable; dismissing only hides it until the next app start —
install-on-quit stays armed.

## Data Model

**App Settings** (existing entity, `settings.json`) gains one optional, additive block — no
format-version bump, an older file simply lacks it:

```
updates (optional block):
- checkAutomatically — yes/no; absent = yes (spec decision: default on)
- receiveBetas       — yes/no; absent = derived: yes if the installed version has a
                       pre-release suffix (e.g. 2.0.0-beta.3), otherwise no (AC-9)
```

Both are written by the Settings view through a dedicated update-settings call — NOT through
the existing Save/applySettings transaction, so toggling them never restarts the engine or
dirties the console/mapping form.

**Update Status** (runtime only, never persisted — like all runtime state):

```
state — one of:
  disabled     auto-check off and no manual check yet
  idle         nothing checked yet this session
  checking
  up-to-date   with: checkedAt
  downloading  with: version, percent (0–100)
  ready        with: version, releaseName
  fallback     with: version, releaseUrl, reason (one of: not-writable, not-in-applications,
               unsupported-platform)
  error        with: checkedAt, message (short, plain text; never shown as a dialog)
installedVersion — text, from the app
```

Pushed main → renderer on every change; also part of the snapshot for initial render.

## Behaviors & Access

```
Operations (renderer → main, own-window sender check as for every IPC call):
- getUpdateStatus            — returns Update Status
- checkForUpdatesNow         — allowed in any state except checking/downloading; also
                               works when auto-check is off (AC-14 exception "Check now")
- setUpdatePreferences       — { checkAutomatically, receiveBetas }, both booleans,
                               validated; persisted immediately; changing receiveBetas
                               triggers a fresh check if auto-check is on
- installUpdateNow           — only in state ready; the renderer has already asked the
                               confirm question when the bridge is active (AC-6)

Main → renderer: update status changed (event).
```

Behaviour rules:

- **Download**: automatic after a successful check finds a newer version (AC-1). Download
  runs in the main process at normal priority; it does not share any code path with the
  MIDI/OSC engine.
- **Channel** (AC-8, AC-10): `receiveBetas = no` → the updater only looks at GitHub's
  "latest" (non-pre-release) release; `yes` → it considers pre-releases too. Downgrades
  are never allowed — a beta user who turns betas off stays until a higher stable exists.
- **Integrity** (AC-3, AC-12): checksums from the release metadata are always verified by the
  updater; on macOS the downloaded app must carry the same Developer ID as the running one
  (the OS-level updater enforces this). Any failure → state error, file discarded.
- **Install on quit** (AC-7): when state is ready and the user quits normally (window close
  / Cmd+Q), the update is installed during quit and the new version starts next time; the
  app never relaunches itself in this path. OS shutdown (EC-1) may skip it — the old
  version stays intact because the installer only swaps on success.
- **Install now** (AC-6): quit cleanly (same shutdown path as today: engine stops, ports
  close, session log flushes), install, relaunch.
- **Fallback** (AC-13, EC-4): Linux AppImage not writable, or macOS app not located in an
  Applications folder (running from the dmg / Downloads) → state fallback with the release
  page link; the user downloads manually. No silent failure.
- **Errors** (AC-2): state error + one session-log line; next attempt at the next scheduled
  check or the next start. No notice, no dialog.
- **Dev builds** (`npm run dev`, unpackaged): the service stays disabled — no checks.
- **Newer version already running** (EC-3): a pending download is discarded when its version
  is not greater than the running version.
- **Several releases** (EC-2): each check targets the newest one; an older pending download
  is replaced.
- **Drafts** (EC-5): invisible to the updater by GitHub's design — nothing to build.

Network: only github.com and GitHub's release-asset hosts; no other server, no telemetry.

## Release artifacts (pipeline)

- macOS: **one universal build** — targets `dmg` (for people) and `zip` (required by the
  macOS updater), artifact names `pam-osc-<version>-mac-universal.dmg/.zip`; signed and
  notarized as today. Replaces the two per-arch builds from 78039ce — those also made the
  second build overwrite the first one's macOS update metadata.
- Windows: NSIS installer as today (unsigned); update metadata `latest.yml`.
- Linux: AppImage as today; update metadata `latest-linux.yml`.
- All metadata files and blockmaps stay in the release — they are what the updater reads.
- The maintainer controls the channel solely with GitHub's "Set as a pre-release" flag.

## Tech Decisions

- **electron-updater with the GitHub provider**: the releases are already on GitHub, the
  pipeline already writes the metadata this library reads, and GitHub's pre-release flag
  gives the beta channel for free. No server to run, nothing extra to pay.
- **One "latest" channel + client-side pre-release switch** instead of electron-builder's
  named channels: named channels on GitHub need the channel set explicitly per release —
  an extra manual step that is easy to get wrong. The pre-release flag is already set.
- **Install only on quit or on click**: live-show safety (spec decision).
- **Universal macOS build**: one file for every Mac, one update feed; costs ~double the
  download size.
- **Preferences outside the Save transaction**: toggling an update option must never
  restart the engine during a show.

## Dependencies

- `electron-updater` 6.8.x — the updater (pinned; matches electron-builder 26).

## Build Plan

```
Level 1 — Data/logic:  T1  settings schema: optional updates block      · core/settings/schema.ts · AC-9, AC-14
                       T2  pure update policy + tests                   · core/update/policy(.test).ts · AC-6, AC-7, AC-9, AC-10, AC-13, EC-3, EC-4
Level 2 — Main:        T3  Update Service + session-log lines           · main/updater.ts · AC-1, AC-2, AC-3, AC-7, AC-8, EC-2
                       T4  IPC contract + preload + wiring              · shared/ipc.ts, preload/index.ts, main/index.ts · AC-4, AC-6, AC-14
Level 3 — UI:          T5  UpdateBar + UpdateSection + slot in App      · renderer components, App.tsx, styles.css · AC-4, AC-5, AC-6, AC-14
Level 4 — Pipeline:    T6  universal dmg+zip, names                     · electron-builder.yml, release.yml · AC-11, AC-12, AC-13
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| electron-updater, GitHub provider | Releases + metadata already there; no server | Own update server; manual "new version" notice only | Tied to GitHub's release feed and rate limits (unauthenticated, fine at our scale) | 2026-10-07 |
| Client-side pre-release switch, no named channels | Uses the flag the maintainer already sets | electron-builder channels (beta.yml) | Beta users see every pre-release, no finer channels (alpha/rc) | 2026-10-07 |
| Universal macOS dmg + zip | One file per Mac, single update feed | Per-arch files with merged metadata | ~2× download size | 2026-10-07 |
| First check 30 s after start, then every 6 h | Never delays start-up; long-running show sessions still learn about fixes | Check only at start | A 6 h interval means an update can appear mid-session — it only becomes a notice, never an install | 2026-10-07 |
| Update preferences saved outside applySettings | Must not restart the engine | Part of the settings form | Two save paths in Settings | 2026-10-07 |
| Updater disabled in dev builds | No packaged app to replace | Dev override flag | Local testing needs a packaged build | 2026-10-07 |
