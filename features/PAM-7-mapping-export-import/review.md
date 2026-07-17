# Review — PAM-7

**Reviewed:** 2026-07-17
**Where tested:** local — Vitest suite (285/285, incl. 51 new PAM-7 tests) + typecheck + production build + dev-boot smoke on macOS (session log captured the real engine start/device bind end-to-end); native menu verified by code trace and the user's own successful export (`launchpad-playback.mapping` produced live). Two parallel red-team lanes (security, regression) via the reviewer subagent; findings merged by the review owner. Adversarial share-gate probes (path traversal, prototype pollution, unknown keys, hybrid objects) run empirically and then removed.
**Reviewer:** Review (AI) — main reviewer + security lane + regression lane.

### Acceptance Criteria

- [x] AC-1: Export mapping → raw `.mapping` file (byte copy of the loaded file), size-capped — pass (`index.ts` exportShare; user produced a real export)
- [x] AC-2: Import mapping → strict-validated, lands as user file, not auto-activated — pass (`share-files.test.ts`; import never touches `activeMappingIds`)
- [x] AC-3: Id collision → suffixed, never overwrites — pass (`claimImportSlot`; test: `twin` → `twin-2`, both files kept)
- [x] AC-4: Missing board → refused, names the id + "import its device file first" — pass (test-verified, nothing written)
- [x] AC-5: Invalid / oversized (>1 MB) / malformed → friendly error, nothing written; export refuses oversized — pass (double cap: stat pre-check + byte recheck; export-side check)
- [x] AC-6: Imported mapping activates via the normal PAM-3 port-rebind — pass by construction (import doesn't activate; copy-on-activate unchanged)
- [x] AC-7: Free-text command caution in the import summary — pass (`commandCaution`, fires on `command` actions; surfaced as a warning notice)
- [x] AC-8: Export board → raw `.device` file — pass (`index.ts` exportShare)
- [x] AC-9: Import device; bundled-id collision suffixed, never shadowed — pass (test: `test-board` → `test-board-2`, bundled stays origin=bundled)
- [~] AC-10: Support package `.zip` with all device/mapping files (split by origin) + settings + session logs + manifest — **pass with a gap (BUG-4):** valid content, settings, logs and manifest all ship (`support-package.test.ts` via yauzl read-back), but **invalid user files are omitted** — the exact files a support case is usually about. AC-10 says "all … visible in the app" and invalid files are visible (Boards tab).
- [x] AC-11: Session log on disk (lifecycle + errors), size cap + previous-session rotation — pass (`session-log.test.ts`; dev-boot smoke wrote a real log)
- [x] AC-12: Import picker filtered to the custom extension, `.json` also accepted — pass (`filters: [ext, "json"]`)
- [x] AC-13: Kind detected from CONTENT not extension; wrong/foreign files refused with a specific message — pass (share.test + share-files.test + adversarial probe: hybrid detects-then-strict-rejects)
- [x] AC-14: Native File menu — Import Mapping/Board, Export Mapping ▸ / Board ▸ (live catalog), Export Support Package; menu imports update the UI — pass (code trace; rebuildMenu driven by buildSnapshot; menu imports push notices + catalogChanged snapshot)

### Edge Cases

- [x] First run (no settings/logs yet): support package skips missing files, no error — pass (test)
- [x] Menu action after window closed: returns "canceled", no crash — pass (`if (!window)` guards)
- [x] Beyond-spec: a schema-valid mapping whose assignments don't fit the board is refused before writing (would otherwise strand an invalid file) — pass (added `validateMappingDraft` in `importMapping`, test-covered)

### Code Review

- Matches design.md. Export = byte copy of the real loaded file (no re-serialization); import = size → JSON → content-kind → strict schema → catalog, every failure a specific friendly message.
- `core/sharing/share.ts` is a pure, well-isolated gate; the Electron-bound pieces (dialogs, menu) are thin and delegate to the tested modules. Imports reuse the PAM-5 `ImportSerializer` (one write path at a time).
- `rebuildMenu()` is a side effect of `buildSnapshot()` — confirmed it reads only pure catalog arrays (safe on empty/mid-init) and cannot throw into the snapshot.
- No leftover mocks, no dead code, no secrets. Additive IPC surface.

### Security (red team) — no Critical/High

- [x] Path traversal blocked: every id is `idSchema` (kebab-case) before `join()`; `claimImportSlot` only appends `-N`. Probed `../../etc/passwd`, absolute paths, unicode, dots, empty — all rejected.
- [x] Prototype pollution blocked: `strictObject` top-level and nested; only the zod-rebuilt object flows downstream, no untrusted merge/spread; `Object.prototype` stayed clean under a `__proto__` payload.
- [x] Support package embeds only catalog-supplied real paths + hardcoded settings/log paths; entry names via `basename`; the renderer never supplies a path.
- [x] Session log records only versions, states, notice/issue text, and `imported/exported <kind> "<id>"` — no command strings, no file bodies; settings hold only IP/ports (no secrets).
- [x] Size cap enforced on read (stat + byte recheck, closes the TOCTOU) and write; symlink-to-large caught via stat-follows-link.
- [x] IPC sender check on all five handlers (shared `handle()` wrapper); no `ipcMain.on`; no renderer-supplied paths.
- [x] No `child_process`/`eval`; `command` actions are OSC payload data, not shell.

### E2E (critical journeys)

- Status: **not run** — no UI E2E harness in the repo (engine E2E runs in Vitest). The export→re-import round trip and the share gate are covered at the module level; the dialog/menu glue was verified by code trace + dev-boot smoke + the user's real export. Recommended manual pass before /ship: File menu → Export a mapping → Import it back (expect a `-2` suffix), and Export support package → open the .zip.

### Regression

- 285/285 Vitest, typecheck clean, production build green. Diff of shared surfaces (`catalog.ts`, `index.ts`, `ipc.ts`, `App.tsx`, `BoardInspector.tsx`) is additive or behavior-preserving. Approved neighbours PAM-1/2/3/5/6/11 all traced clean; `CatalogEntry` and the `Snapshot` shape intact; the shared `ImportSerializer` serializes v1 and share imports rather than interfering.

### Bugs

**BUG-4: Support package omits invalid user files — the ones support most needs**

- **Severity:** Medium
- **Steps to reproduce:** 1. Have a user mapping/device file that fails validation (broken JSON, or references a missing board — the classic "my mapping won't load"). 2. It shows under Boards → "Invalid mapping files". 3. Export a support package. 4. Open the .zip.
- **Expected / Actual:** the broken file is in the package so a helper can reproduce it / it's absent. `catalog.allFiles()` returns only `deviceSources`/`mappingSources` (validation survivors); the session log records the *load error* but not the file's *content*. AC-10 says "all … visible in the app," and invalid files are visible. Fix: add the user folders' invalid files (or a `raw/` dump of the user device/mapping dirs) to the zip.

**BUG-1: Export size pre-check is a TOCTOU (advisory)**

- **Severity:** Low
- **Steps to reproduce:** Have a source file grow past 1 MB between `stat` and `copyFile` during an export.
- **Expected / Actual:** oversized export refused / it copies anyway. Practically unreachable — the source already passed the ≤1 MB loader cap on load, single-user self-export. AC-5 robustness note, not a security issue. (`index.ts` exportShare)

**BUG-2: Auto-dismiss timers are never cleared**

- **Severity:** Low
- **Steps to reproduce:** Generate many notices in one session.
- **Expected / Actual:** timers cleaned up / they run to completion. Harmless — the `WeakSet` keyed by notice identity prevents duplicate timers and the backlog is bounded; no visual glitch, no unbounded growth. (`App.tsx` NOTICE_DISMISS_MS effect)

**BUG-3 (informational): session log depends on PAM-2 keeping command payloads out of `onLog`**

- **Severity:** Low (boundary note, outside PAM-7 code)
- PAM-7 forwards engine `onLog`/`onIssue` text verbatim into the session log that ships in the support package. PAM-2 is documented to keep per-message traffic in the in-memory buffer only; if that ever changes, command payloads would reach a shared package. Keep the boundary.

**BUG-5: v1 imports aren't written to the session log**

- **Severity:** Low
- Share import/export and package export all `sessionLog.log(...)`; `importV1Mapping` (`index.ts`) doesn't. A catalog-changing, occasionally-failing operation leaves no trace in the log the package ships. One line to fix.

**BUG-6: the "session ending" log line is enqueued but never flushed**

- **Severity:** Low
- `before-quit` calls `sessionLog.log("session ending")` fire-and-forget; the app can quit before the queued `appendFile` lands, so the end marker is often lost. Harmless (last line only; the flush-before-zip path is correct), but the marker is unreliable.

**BUG-7: menu export submenus stay fresh only via a renderer round-trip**

- **Severity:** Low
- design.md calls `buildSnapshot()` "the one choke point every catalog change passes," but `duplicateMapping` and `createMapping` handlers mutate the catalog and `refresh()` without calling `buildSnapshot`/`rebuildMenu`. The menu stays current today only because the renderer follows those with `getSnapshot()`. No current bug — a fragile invariant. Fix: call `rebuildMenu()` from `catalog.refresh()` or after every mutating handler.

### Verdict

- **ACs:** 13/14 clean + AC-10 pass-with-a-gap (BUG-4) · **Bugs:** 7 (0 Critical / 0 High / 1 Medium / 6 Low) · **Security:** pass, no Critical/High (path traversal + prototype pollution verified empirically) · **Regression:** none (285/285, six Approved neighbours intact)
- **Ship:** YES — READY by the rule (no Critical/High). But **BUG-4 undercuts the support package's main purpose** (debugging broken setups), so the economical path — PAM-7 isn't live yet — is one more `/build` round for BUG-4 plus the two trivial log Lows (BUG-5, BUG-6), then ship. Also recommend the 60-second manual menu round-trip (the one surface without automated coverage). Go-live is the user's call.

---

# Re-review — fix round (BUG-4…BUG-7)

**Reviewed:** 2026-07-17 · **Commit:** `e3385b7` · **Where tested:** local — 286/286 Vitest, 64/64 in the touched suites (catalog, session-log, support-package, share-files, sharing), typecheck clean, production build green, dev-boot smoke. Fixes are small and file-scoped, so reviewed inline (no fan-out).

### Fix verification

- [x] **BUG-4 fixed** — `catalog.invalidUserFiles()` returns the full paths of error-severity issues under the user dirs (deduped via Set; bundled and info-level issues correctly excluded); `writeSupportPackage` adds each existing one under `invalid/<basename>`, missing paths skipped. Wired into `exportSupportPackage`. Tests: `catalog.test.ts` asserts both broken user files' paths are returned and all are under the user dirs; `support-package.test.ts` asserts `invalid/broken.json` is in the zip and a missing path is skipped. **AC-10 now passes cleanly** — the support-relevant broken files ship.
- [x] **BUG-5 fixed** — the v1 import handler logs success id / failure to the session log, matching the share-import path.
- [x] **BUG-6 fixed** — `SessionLog.logSyncFinal` uses `appendFileSync`; `before-quit` calls it so the "session ending" marker lands without awaiting the async queue. Test asserts it's on disk with no `flush()`.
- [x] **BUG-7 fixed** — `duplicateMapping`, `createMapping`, and the v1 import call `rebuildMenu()` after a successful mutation; the menu's Export submenus no longer depend on the renderer's follow-up getSnapshot.
- Parked unchanged: BUG-1 (export TOCTOU — unreachable), BUG-2 (auto-dismiss timers uncleared — bounded/harmless), BUG-3 (PAM-2 onLog boundary — outside PAM-7).

### New findings

- **BUG-8 (Low):** `invalid/<basename>` can collide if an invalid device file and an invalid mapping file share a basename (e.g. both `broken.json`) — yazl then writes two same-named entries. Cosmetic for a support artifact; a `invalid/devices|mappings/` split (as the valid files already use) would remove it.
- Ultra-low note (no ID): `invalidUserFiles` uses `startsWith` on the dir path without a trailing separator — a theoretical sibling dir sharing the prefix would false-match, but no such sibling exists (dirs are the fixed `userData/devices|mappings`). Not worth a guard here.

### Regression

- Full suite 286/286, typecheck clean, build green. The fix touches only additive catalog/package/log surfaces plus two IPC handlers that gained a post-success `rebuildMenu()` — behavior-preserving for the Approved neighbours (confirmed in the round-1 regression lane; no existing method changed here).

### Verdict (fix round)

- **ACs:** 14/14 clean (AC-10 gap closed) · **Bugs:** BUG-4/5/6/7 fixed; 1 new Low (BUG-8) + 3 parked Lows (BUG-1/2/3) · **Security:** unchanged, pass · **Regression:** none
- **Ship:** YES — READY. No Critical/High/Medium open. BUG-8 and the parked Lows are cosmetic/robustness only. Recommend the 60-second manual menu round-trip (Export a mapping → Import it back → expect `-2`; Export support package → open the .zip and confirm an `invalid/` entry when a broken file exists) before `/ship`; go-live is the user's call.
