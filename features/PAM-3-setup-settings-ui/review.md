# Review — PAM-3

**Reviewed:** 2026-07-17
**Where tested:** local (macOS) — Vitest suite (116/116), typecheck clean, live dev-mode app boot (window up, renderer served, first-run behavior observed), live second-instance check, failing repro written for the EC-2 finding (removed after confirmation; steps below)
**Reviewer:** Review (AI) — inline AC/code/regression lanes + independent security red-team agent, merged by one owner

### Acceptance Criteria

- [x] AC-1: fresh install → dark-theme setup view, v1 prefills (127.0.0.1 / 9003 / 9004), engine not started — pass (settings-store tests; live boot smoke: window up, no engine on first run; `index.ts:88` starts only with persisted settings + ≥1 active mapping)
- [x] AC-2: picker lists bundled + user mappings, binds to connected MIDI ports, several active at once incl. two units (Duplicate), reveal-folder — pass (catalog tests: listing, copy-on-activate, duplicate suffix; cross-mapping port uniqueness in `validate.ts`; `shell.openPath` on the fixed user mappings dir)
- [x] AC-3: Save persists + applies via reconfigure without restart; unapplied edits never take effect — pass (apply-transaction tests; draft lives renderer-only until Save)
- [x] AC-4: valid persisted settings → engine auto-starts before the window — pass (code trace `index.ts:87-95`; start path exercised through the EngineHost apply tests; **real onPC auto-start still unverified** — release gate per AGENTS.md, due before /ship)
- [x] AC-5: vanished MIDI port → row visibly unbound, rebindable, Save binds — pass (`snapshot.ts` empty-input row; PortPicker "(not connected)" marker; validation forces a pick; engine binds on apply)
- [x] AC-6: invalid input → inline error naming the problem, nothing persisted/applied — pass (validate tests cover all design rules; same pure module enforced main-side in the Save transaction; field errors render at the causing field)
- [x] AC-7: engine status events → always-visible indicators — pass (StatusBar covers stopped/starting/running and all four connection states incl. attempt counter/gave-up; device rows show bound/missing LEDs)
- [x] EC-1 no MIDI ports: picker empty state, no error; rows keep their config for hot-plug — pass
- [ ] **EC-2 corrupt settings file: defaults + notice + no crash — pass; "not silently overwritten until Save" — FAIL (BUG-1)**
- [x] EC-3 engine failure on apply: error surfaced, previous working state keeps running (rollback to last-known-good; first-run no-lastGood case stays stopped) — pass (apply tests)
- [x] EC-4 invalid mapping file: listed greyed out with its validation error, not selectable, no crash — pass (catalog + dialog)
- [x] EC-5 second instance: exits immediately, first instance keeps running — pass (**verified live**: second `electron .` exited code 0 while the dev instance kept running; focus-restore is code-traced `index.ts:32-36`)

### Code Review

- Implementation matches design.md closely: IPC contract is exactly the designed surface (5 handlers, 5 events, no generic invoke), Save transaction implements steps 1–5 in order with the designed rollback semantics, copy-on-activate/duplicate/shadowing per design, hardened Electron defaults present on the only BrowserWindow.
- Validation is one pure module used live in the renderer and enforced in the main process — the renderer stays untrusted, as designed.
- PAM-1 loader delta (`mappingSources`) is purely additive; all 44 format tests untouched and green.
- No dead code, no mocks left behind, no `any`/`@ts-ignore`. Complexity is proportionate — no over-engineering findings.
- Test gap: `EngineHost.autoStart` and `MidiPortLister` have no direct unit tests (autoStart is exercised only indirectly). Add alongside the BUG-1 fix.

### Security (red team — independent agent, all paths read)

- [x] Path traversal via mapping ids/names: closed — ids are strict kebab-case (`envelope.ts:7-9`), writes only for catalog-validated ids, duplicate target built from the on-disk id, never the renderer string
- [x] Prototype pollution: closed — `z.strictObject` everywhere rejects unknown keys incl. `__proto__`; no recursive merges
- [x] XSS: closed — all untrusted strings render as JSX text (React-escaped); zero `dangerouslySetInnerHTML`; strict CSP (`default-src 'self'; script-src 'self'`)
- [x] IPC escape: closed — preload exposes exactly the typed API, no `ipcRenderer` leak, no generic channels
- [x] `shell.openPath`: hard-coded userData path, not renderer-controlled; no `openExternal`
- [x] Secrets/PII: none persisted or logged (console IP + ports only); nothing sensitive in URLs
- [ ] Three Low hardening gaps → BUG-7

### Regression

- Full suite 116/116 green (includes all PAM-1 format tests and PAM-2 engine/E2E suites); typecheck clean; production build green (from /build, unchanged since).
- v1 files untouched by the PAM-3 commit. No Live features exist yet — no live-flow regression surface.

### E2E (critical journeys)

- Not locked in yet. Recommended after the fix round: one Playwright-Electron journey "first run → add device → save → engine starts (fake console)" — the flow every new user hits. Needs a small harness (Playwright `_electron`); propose setting it up in the next /review round and recording the command in AGENTS.md.

### Bugs

**BUG-1: Closing the window silently overwrites a corrupt settings.json — EC-2 violated, and the shown notice is factually wrong**

- **Severity:** High
- **Steps to reproduce:** break `settings.json` (e.g. truncate the JSON) → launch the app → notice correctly says "the file stays untouched until you save" → close the window without saving → the file now contains defaults + window bounds; the user's broken-but-recoverable config (console IP, active mapping list) is gone. Confirmed with a unit repro: `SettingsStore.load()` (corrupt) followed by `saveWindowBounds()` replaces the file.
- **Where:** `app/src/main/index.ts:153-156` (unconditional bounds save on `close`) → `app/src/main/settings-store.ts:90-94` (`saveWindowBounds` writes `this.current`, which is defaults after a corrupt load).
- **Side effect:** on a plain first run, closing without ever saving also writes a defaults `settings.json`, so the next launch is no longer first-run state.
- **Fix direction (for /build):** suppress bounds persistence while the store holds defaults from a missing/corrupt load (until the first successful Save), or persist bounds in a separate file (`window-state.json`) so UI state never touches the settings contract.

**BUG-2: Console address is validated trimmed but persisted and applied untrimmed**

- **Severity:** Medium
- **Steps to reproduce:** paste `" 192.168.0.10 "` (copy-paste whitespace is common) → inline validation passes (`validate.ts` trims for its checks) → Save applies and persists the raw string → the engine gets an address with spaces → connection shows "unreachable" although the visible IP looks correct. Workaround exists (delete the space) but nothing points the user at it.
- **Where:** `app/src/core/settings/validate.ts:38-45` (trim only inside validation) vs `app/src/main/apply-settings.ts:66-71` (persists `draft.console` raw).
- **Fix direction:** normalize (trim) the draft once at the start of the Save transaction — main-side, so the rule holds for any client.

**BUG-3: Dismissed notices reappear after every successful Save**

- **Severity:** Low
- **Detail:** the main process keeps `notices[]` (up to 100) and `buildSnapshot` returns them all; a successful apply adopts the fresh snapshot, resurrecting everything the user dismissed. Dismissal is renderer-only. `app/src/main/index.ts:54-59,107`, `App.tsx:92,120`.

**BUG-4: MIDI port poll is unguarded — a native easymidi throw crashes the main process**

- **Severity:** Low
- **Detail:** `MidiPortLister` calls `getInputs()/getOutputs()` inside `setInterval` with no try/catch; an exception there is uncaught in the main process. `app/src/main/midi-ports.ts:27-34`, `app/src/transports/easymidi-transport.ts:48-50`.

**BUG-5: Restored window bounds are not validated against connected displays**

- **Severity:** Low
- **Detail:** bounds from a disconnected monitor restore the window off-screen (classic Electron gotcha; macOS partially self-heals, Windows does not). `app/src/main/index.ts:133-138`.

**BUG-6: `snapshot.firstRun` is captured once at boot and never refreshed**

- **Severity:** Low
- **Detail:** stays `true` in snapshots after a successful Save. Currently unused by the renderer — drop the field or derive it live. `app/src/main/index.ts:102`.

**BUG-7: Defense-in-depth hardening gaps (security lane, none exploitable today)**

- **Severity:** Low
- **Detail:** (a) no `setWindowOpenHandler`/`will-navigate` deny-guard on the window; (b) IPC handlers don't validate `event.senderFrame` (single trusted window today); (c) loader and settings store read JSON files unbounded — a huge file OOMs the main process. (c) becomes material with PAM-7 (community mapping import) — put a size ceiling on ingest before that lands. `index.ts:134-150`, `index.ts:112-131`, `core/format/loader.ts` / `settings-store.ts:41`.

**BUG-8: Input cosmetics**

- **Severity:** Low
- **Detail:** port fields accept `"9003x"` → silently 9003 (`Number.parseInt`, `ConsoleSection.tsx:34-37`); duplicating a duplicate names it "X (2) (2)" (`catalog.ts:125`); renderer `save()` has no catch — a rejected invoke (only reachable with a malformed draft) would surface nowhere (`App.tsx:86-102`).

## First-pass verdict (2026-07-17, commit 846cf74): **NOT READY** — 1 High (BUG-1)

12/12 AC/EC verified; 11 pass, EC-2 fails on its overwrite clause. Security: no Critical/High/Medium. Regression green.

---

# Re-review — fix round `6031f1d` (2026-07-17)

**Where tested:** local (macOS) — Vitest 127/127 (11 new tests, one per fix claim), typecheck clean, production build green, dev-mode boot smoke rerun with the fixed code. Scope: the full fix diff (15 files) read line by line, adversarially probed for newly introduced defects; the first-pass architecture findings were not re-litigated.

### Fix verification

- **BUG-1 (High) — fixed.** `SettingsStore.hasPersisted` gates `saveWindowBounds`; the first-pass repro is now a permanent test ("corrupt file: window-bounds save is a no-op until a real Save") and passes, plus a first-run-leaves-no-file test. The load notice's "stays untouched until you save" is now true. **EC-2 → pass.**
- **BUG-2 — fixed.** Save transaction step 0 trims the address main-side before validate/apply/persist; test proves engine and disk both get the trimmed value. A non-string address from a hostile renderer throws into a rejected invoke (renderer now surfaces it) — the main process survives.
- **BUG-3 — fixed.** Notices adopted only at mount; post-save snapshots no longer resurrect dismissed ones. Residual (accepted): a millisecond-window race where an event-notice arriving between subscribe and snapshot adoption could be dropped — informational only, pre-existing class.
- **BUG-4 — fixed.** Poll survives throwing enumeration, serves last-known list, retries; three tests incl. fake-timer tick.
- **BUG-5 — fixed.** Saved position reused only when it intersects a connected display's work area (size survives either way).
- **BUG-6 — fixed.** `firstRun` derived live from `hasPersisted`.
- **BUG-7 — fixed.** `setWindowOpenHandler` denies popups; `will-navigate` blocks non-dev/non-file targets; all five IPC handlers reject foreign senders; 1 MB ingest ceiling in loader + settings store (tested both). Note (accepted): `file://` navigation remains broadly allowed — only reachable with script execution the CSP already prevents; sandbox holds.
- **BUG-8 — fixed.** Digits-only port fields; duplicate-of-duplicate counts up from the original with a base-exists guard for legit trailing-number ids; renderer `save()` catches rejected invokes into an error notice.

### Regression (re-run)

Full suite 127/127 (all PAM-1 format + PAM-2 engine/E2E suites included); loader change remains additive (new error path only for >1 MB files); typecheck and production build green; boot smoke on macOS rerun after the fixes.

### Still open (unchanged, non-blocking)

- E2E critical journey ("first run → add device → save → engine starts") not locked in yet — recommended as Playwright-Electron setup in a later round.
- AGENTS.md release gate before `/ship`: real onPC + hardware verification of AC-4 end-to-end.

## Verdict: **READY** — 12/12 AC/EC pass, no Critical/High. **Approved.**
