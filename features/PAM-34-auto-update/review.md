# Review — PAM-34

**Reviewed:** 2026-10-07
**Where tested:** worktree `feat/PAM-34-auto-update` @ 3e57309 — targeted Vitest (`updater.test.ts`, `core/update`, `apply-settings.test.ts`: 26/26 green), `tsc --noEmit` clean, a local **unsigned universal `dir` build** (`electron-builder --mac dir:universal`, merge succeeded), static review against the real `electron-updater` 6.8.9 / `app-builder-lib` sources, and a read-only look at the public GitHub release feed. Full suite not run (shared virtual MIDI ports); reported green at 491/491 by the build.
**Reviewer:** Review (AI)

> "verify on release" = can only be confirmed with a real signed release on GitHub (beta.3 → beta.4). Not a failure.

### Acceptance Criteria

- [x] AC-1: background check 30 s after the window is up, then every 6 h (`updater.ts:793-794`); manual `downloadUpdate()` after the fallback check (`autoDownload=false`, `:758`, `:862`); runs in the main process, no shared path with the engine. Test "AC-1". Real download: verify on release.
- [x] AC-2: every failure → quiet `error` state + session-log line, no dialog (`updater.ts:775`, `:865-869`). Retries at next scheduled check / next start. Minor: logged twice per failure (BUG-4). See BUG-1 for a permanent error state on the stable channel.
- [x] AC-3: sha512 verified by electron-updater during download, temp file removed on mismatch (`AppUpdater.executeDownload` → `removeFileIfAny`); macOS Squirrel.Mac checks the update's code signature against the running app's designated requirement. Code-level pass; verify on release.
- [~] AC-4: Settings "Updates" section shows installed version, last result, Check now (`UpdateSection.tsx`). **Caveat BUG-3**: the initial status fetch can race the IPC handler registration, leaving the section hidden.
- [x] AC-5: slim bar under the status bar in the flex column (never an overlay), "Update vX ready — installs automatically when you close pam-osc", Install now + dismiss (`UpdateBar.tsx`).
- [x] AC-6: `window.confirm` when engine is starting/running (`UpdateBar.tsx:961`, `policy.ts:270`); `installNow` only from `ready` (`updater.ts:838`). `quitAndInstall(true,true)`: NSIS `/S --force-run`, macOS native `quitAndInstall` (relaunch), AppImage spawns the new file. Verify on release.
- [x] AC-7: `autoInstallOnAppQuit=true`; install-on-quit uses `install(true,false)` (no relaunch); macOS Squirrel/ShipIt installs on quit. Searched every quit/relaunch path: the only `quitAndInstall` call is `installNow` behind the user's click; no `app.relaunch`, no timers that quit. Verify on release.
- [~] AC-8: channel mechanism correct (`allowPrerelease` from the preference, `updater.ts:761/824`; GitHubProvider uses `/releases/latest` when off, the Atom feed when on). **BUG-2**: an already-downloaded pre-release still installs on quit after the user switched betas off.
- [x] AC-9: `effectivePreferences` derives `receiveBetas` from the pre-release suffix when unset (`policy.ts:202-210`); tests.
- [~] AC-10: no downgrade — `allowDowngrade=false` plus own `isWorthInstalling` guard (`updater.ts:760/771/850`). But with betas off the check currently always fails (BUG-1) and a ready beta still installs (BUG-2).
- [~] AC-11: universal merge verified locally — main binary and the rebuilt `midi.node` are fat (x86_64 + arm64), the identical per-arch prebuilds are accepted by the `x64ArchFiles` glob, build exits 0. Artifact names (`…-mac-universal.dmg/.zip`), `latest*.yml` for all three OSes and signing/notarization of the universal app: verify on release. electron-builder writes channel `latest` for the GitHub provider (`updateInfoBuilder.computeChannelNames`); the client first requests `beta-mac.yml` (404), then falls back to `latest-mac.yml` — works, one extra request.
- [ ] AC-12: verify on release. Code path identical to macOS; no `publisherName` → no Windows signature check (see Security).
- [x] AC-13: `fallbackReason` → `not-writable` when the AppImage or its folder isn't writable (`update-wiring.ts:401-409`, `policy.ts:296-299`); link to the release page. Install itself: verify on release. Edge: BUG-5.

- [x] AC-14: auto-check off → state `disabled`, scheduled ticks return early (`updater.ts:844`), Check now still works (`:803`); both settings persisted via `setUpdatePreferences` and kept by Save. Tests "AC-14", "AC-8 / AC-14". No update request before the UI is up; dev builds never touch the updater.

### Edge Cases

- [ ] EC-1: OS shutdown during install-on-quit — verify on release (installer swaps only on success; NSIS/Squirrel behaviour).
- [~] EC-2: a half-finished download is dropped across restarts (electron-updater cache). Within a session, once `ready`, no further checks run (`updater.ts:807`, `:845`), so the older ready version installs on quit — deviates from design ("older pending download is replaced"). BUG-6.
- [x] EC-3: equal/older offered versions → `up-to-date`, also guarded on `update-downloaded` (`updater.ts:771`, `:850`). Test.
- [x] EC-4: macOS outside `/Applications` or `~/Applications` → fallback with move hint (`policy.ts:290-295`). Tests.
- [x] EC-5: drafts are not served (assets of drafts aren't public). Note: a tag pushed for CI shows up in `releases.atom` before the draft is published (seen live: `v2.0.0-beta.2` is in the feed while still a draft) → beta users get "Last check failed" until publish. Not offered, so EC-5 holds.

### Code Review

- ESM default import of the CJS module: correct. `out/main/index.js` keeps `import electronUpdater from "electron-updater"` (externalized), Node exposes `module.exports` as default; `autoUpdater` is a lazy getter, only touched when `app.isPackaged`. Confirmed with a Node ESM import.
- `allowPrerelease`: the library sets it from the current version in its constructor; the service overrides it right away — correct. `allowDowngrade=false` stays (the service never sets `channel`, which would flip it to true).
- State machine: `download-progress` is guarded by `state.kind === "downloading"`. `update-downloaded` is not state-guarded: on macOS it fires **before** Squirrel validates the signature (`MacUpdater.updateDownloaded` → `dispatchUpdateDownloaded`, then `nativeUpdater.checkForUpdates()`), so the bar can show "ready" and then flip to `error`. Clicking Install now in that window waits for Squirrel and quits later (still user-initiated). Acceptable, worth knowing.
- `checkNow` during `checking`/`downloading`/`ready` is a no-op; a preference change during a check doesn't re-run it with the new channel (the in-flight check may use the old channel until the next 6 h tick). Low.
- `setUpdatePreferences` / Save: `apply-settings.ts:81` keeps the `updates` block; test added. First-run write materializes settings.json — consistent with the onboarding flag.
- Tests use a fake updater that never rejects `checkForUpdates`; the real one emits `error` **and** rejects, so the "logged once" test doesn't model reality (BUG-4).

### Security (red team)

Risk work: the app downloads and runs code.

- [x] Network: only `github.com` / `api.github.com` / GitHub asset hosts, HTTPS. A network attacker without a TLS break can't inject an update. No identifiers sent beyond the library's `x-user-staging-id` header (a random UUID in userData, sent to GitHub with every update request). **Worth a line in the release notes / privacy wording**, because the spec says "no identifiers".
- [x] IPC: every update channel checks `event.sender === window.webContents`; preferences validated (`parsePreferences`); `openReleasePage` restricted to the prefix `https://github.com/xxpasixx/pam-osc/releases/` (host can't be escaped — authority ends at the first `/`). The Install-now confirmation lives only in the renderer — fine, the renderer is local trusted code.
- [x] Integrity in transit: sha512 from `latest*.yml`. That hash comes **from the same release**, so it doesn't protect against a compromised release.
- **Residual risks (stated honestly):**
  - **macOS:** Squirrel enforces the same Developer ID → an attacker needs the signing cert. That cert sits in the CI secrets (`MAC_CSC_LINK`), so a CI/repo compromise could still produce a validly signed malicious update.
  - **Windows / Linux:** no signature check at all (no `publisherName`, AppImage unsigned). Anyone who can publish a release on `xxpasixx/pam-osc` (maintainer account, a leaked PAT, or the workflow's `contents: write` `GITHUB_TOKEN` via a malicious workflow change/action) gets code execution on every Windows/Linux client with auto-check on (default **on**). The draft + manual publish step is the only human gate. Mitigations: 2FA/hardware key on the maintainer account, pin third-party actions by SHA (currently `@v7` tags), Windows signing (PAM-8) + `publisherName`.
  - AppImage install renames the file when the old name carried a version → desktop shortcuts to the old filename break (library behaviour).

### Bugs

**BUG-1: Betas off → every check fails, because GitHub "Latest" is the v1 release `v.1.3`**
- **Severity:** Medium
- **Where:** `app/src/main/updater.ts:761`, `:824` (channel), GitHub release state
- **Steps:** beta install, switch "Receive beta updates" off (or any future stable install), wait for a check.
- **Expected:** "Up to date" until a higher stable v2 exists (AC-10).
- **Actual:** GitHubProvider resolves `/releases/latest` → `v.1.3` (checked live), fetches `download/v.1.3/latest-mac.yml` → 404 → `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` → Settings permanently says "Last check failed", an error line every 6 h. Same trap later: any v1.x bugfix release marked "Latest" breaks the stable channel; a v1.x release created after the newest beta is the first Atom entry and breaks the beta channel too. Fix options: map these two error codes to `up-to-date` (with a log line), and/or a release rule "v1 releases never marked Latest".

**BUG-2: A downloaded pre-release still installs after betas are switched off**
- **Severity:** Medium
- **Where:** `app/src/main/updater.ts:817-834`
- **Steps:** stable 2.0.0 user turns betas on → `2.1.0-beta.1` downloads (`ready`) → turns betas off → quits.
- **Expected:** AC-8/AC-10: with betas off, only regular releases are considered.
- **Actual:** `ready` + `autoInstallOnAppQuit` stay armed → the beta installs, and the user is then on a beta with betas off. Fix: when `receiveBetas` goes off and the pending version is a pre-release, set `autoInstallOnAppQuit=false`, drop the state to idle, and recheck.

**BUG-3: The Settings update section can stay hidden because of a startup race**
- **Severity:** Medium (timing-dependent, confirm in a packaged build)
- **Where:** `app/src/main/index.ts:785-786` (handlers registered only after `await window.loadFile`), `app/src/renderer/src/components/useUpdateStatus.ts:1147` (no catch, no retry)
- **Steps:** start the app (Setup is the default tab, so `UpdateSection` and `UpdateBar` mount right after the snapshot loads).
- **Expected:** AC-4: version, last result and Check now are visible.
- **Actual:** if `getStatus` arrives before `did-finish-load`, Electron rejects it ("No handler registered"), the hook stays `undefined`, and the section renders `null` until the first push (30 s later). With auto-check off, or in dev builds, no push ever comes → no Check now and no way to switch auto-check back on until a tab switch remounts. Fix: register the update IPC handlers before `loadFile` (start the schedule after), and/or catch + retry in the hook.

**BUG-4: Each failure is logged and emitted twice**
- **Severity:** Low
- **Where:** `app/src/main/updater.ts:775` + `:812` / `:862`
- The library emits `error` **and** rejects the promise, so `fail()` runs twice (two "failed" lines, two pushes). The test fake doesn't reject, so the test "logged once" passes without modelling this.

**BUG-5: Linux without `APPIMAGE` (extracted run, Snap) gets stuck on "Checking …"**
- **Severity:** Low
- **Where:** `app/src/main/updater.ts:809-811`
- `AppImageUpdater.isUpdaterActive()` returns false → `checkForUpdates()` resolves `null` without any event → the state stays `checking` and Check now stays disabled forever. The `unsupported-platform` fallback is never reached. Fix: treat a `null` result as `fallback/unsupported-platform` (or disabled).

**BUG-6: EC-2 — a ready older update isn't replaced by a newer one within a session**
- **Severity:** Low
- **Where:** `app/src/main/updater.ts:807`, `:845`
- Once `ready`, checks stop, so the older version installs on quit and the newer one only comes on the next start. Safe, but it deviates from the design text. Either accept it (update design) or allow a re-check from `ready`.

**BUG-7: An update toggle overwrites a corrupt settings.json; rollback reads `updates` as invalid**
- **Severity:** Low
- **Where:** `app/src/main/settings-store.ts:370-375`, `app/src/core/settings/schema.ts:84`
- The corrupt-file notice promises "untouched until you save", but an update toggle overwrites the file with defaults (same pattern as the onboarding flag). And the root schema is `strictObject`, so rolling back to beta.2 (the documented rollback path) rejects a file that has `updates` → old version starts with defaults (file stays intact). Same pre-existing pattern as `fixedPage`.

### Verdict

- **ACs:** 9 pass (AC-1, 2, 3, 5, 6, 7, 9, 13, 14 — several also need release verification), 4 partial (AC-4, AC-8, AC-10, AC-11), 1 verify on release only (AC-12) · **EC:** 3 pass (EC-3, 4, 5), 1 partial (EC-2), 1 verify on release (EC-1) · **Bugs:** 7 (0 C / 0 H / 3 M / 4 L) · **Security:** pass with residual risks (Windows/Linux unsigned → release-publishing rights = code execution on clients)
- **Ship:** NO, not yet. No Critical/High, and the live-show rule holds: no self-quit or self-install path found. But this is gated risk work: fix BUG-1 (users on the stable channel see a permanent error), BUG-2 (beta installed against the user's choice) and BUG-3 (Settings section can be missing). Then do the release run: beta.3 → beta.4 on macOS (universal, Squirrel), Windows (NSIS install-on-quit) and Linux (AppImage), and check the `latest*.yml` + artifact names.

## Re-review — 2026-10-07 (fix commit 773ae25)

**Tested:** `git diff 3e57309..773ae25`, targeted Vitest (`updater.test.ts`, `core/update`, `apply-settings.test.ts`: 31/31 green, 5 new regression tests), `tsc --noEmit` clean, fixes checked against the electron-updater 6.8.9 / builder-util-runtime 9.7.0 sources.

| Bug | Status | Notes |
| --- | --- | --- |
| BUG-1 (M) | **Fixed** | `updater.ts` `NOTHING_NEWER_CODES` → `up-to-date`. The codes match the source: `newError(msg, code)` sets `.code` (`builder-util-runtime/out/error.js`); `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` = 404 on the yml, `ERR_UPDATER_LATEST_VERSION_NOT_FOUND` = `/releases/latest` failed, `ERR_UPDATER_NO_PUBLISHED_VERSIONS`. Side effect (Low, accepted): `LATEST_VERSION_NOT_FOUND` wraps *any* failure of the `/latest` request, so a transient error there (the Atom feed request before it already succeeded) shows as "up to date" instead of "last check failed". Being fully offline still fails on the feed request first → correctly "failed". |
| BUG-2 (M) | **Fixed on Windows/Linux, residual on macOS** | Both paths covered: the download finishes after betas were switched off (`update-downloaded` handler), and betas are switched off while `ready` (`setPreferences`). On Windows/Linux, `BaseUpdater`'s quit handler reads `autoInstallOnAppQuit` at quit time → the install is really disarmed. On macOS the first path works too: `dispatchUpdateDownloaded` runs synchronously before `if (this.autoInstallOnAppQuit) nativeUpdater.checkForUpdates()`, so Squirrel never fetches. **Residual (Low):** in the second path on macOS, Squirrel.Mac may already have staged the update. Squirrel applies a staged update on its own, and electron-updater has no API to unstage it, so the beta can still install while the UI shows `idle`. Narrow (a stable user opts into betas and back out before quitting; there are no stable v2 users yet). Suggestion: on darwin keep honest UI text ("already prepared, installs on quit") or document it. |
| BUG-3 (M) | **Fixed** | `startUpdates` now runs before `loadFile`/`loadURL` (`index.ts:779-781`). The handlers exist before the renderer can ask. The first network check is still 30 s later (no start-up delay). The hook also retries once. |
| BUG-4 (L) | **Fixed** | Same error object emitted + rejected → same message → second `fail()` is a no-op. Repeated failures on later checks still log (the state passes through `checking`). |
| BUG-5 (L) | **Fixed** | `checkForUpdates()` resolving `null` (verified: `isUpdaterActive()` false → `Promise.resolve(null)`, no events) now leaves `checking` with a plain error. Not the AC-13 link fallback, but no longer stuck. Acceptable. |
| BUG-6 (L) | **Accepted** | `design.md` updated (EC-2: a ready update is kept, the newer one comes next start). Safe trade-off. |
| BUG-7 (L) | **Accepted** | Rationale in `design.md` (same as the onboarding flag / `fixedPage`). |
| Staging-ID header | **Fixed** | `updater.requestHeaders = { "x-user-staging-id": "pam-osc" }`. `computeFinalHeaders` does `Object.assign(headers, this.requestHeaders)` after setting the real ID → overridden on the metadata requests. Downloads go through `computeRequestHeaders` → the same constant. The random ID file is still created in userData but never sent. |

### Updated verdict

- **Bugs open:** 0 C / 0 H / 0 M / 2 L residual (BUG-2 macOS edge, BUG-1 transient-error wording) + 2 L accepted (BUG-6, BUG-7). Security residuals from the first review are unchanged (Windows/Linux unsigned → release-publishing rights = client code execution; GitHub account 2FA + SHA-pinned actions recommended).
- **Status:** **Approved** for the release test. **Before Live:** the "verify on release" items — beta.3 → beta.4 on macOS (universal dmg/zip, Squirrel install-on-quit + Install now), Windows (NSIS install-on-quit, unsigned), Linux (AppImage); check that the release contains `latest-mac.yml` / `latest.yml` / `latest-linux.yml` and the `…-mac-universal.*` names (AC-11, AC-12, AC-13, EC-1).
