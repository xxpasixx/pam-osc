# Review — PAM-13

**Reviewed:** 2026-10-08
**Where tested:** worktree `feat/PAM-13-self-configuring-plugin` at `20386f0` (PAM-13 implementation `57c964a` plus a merge of `v2` at `9fc300f`). `git diff 9fc300f HEAD` is exactly the PAM-13 diff, so the merge carried nothing extra in.

**What I ran:**

- `tsc --noEmit`: clean.
- `vitest run plugin-xml.test.ts connection.test.ts wizard-logic.test.ts ma3-checklist.test.ts`: 4 files, 44 tests, all green.
- `luac -p pam-OSC.lua` (Lua 5.5.1): syntax OK.
- `lua pam-OSC.config.test.lua`: ALL PASS (25 checks, 10 of them new planner checks).
- `node scripts/build-plugin-xml.mjs`, then `git diff --exit-code` on `pam-osc.xml`: in sync. The XML has one `UserPlugin Name="pam-osc"` with Version `2.0.0.4` and the former Start Stop GUID.
- `luac -l` global scan: `myHandle` is the only undefined lowercase global (BUG-1).

I did not run the full suite. Everything that touches the MA3 API is static review only. **Not tried on onPC or a desk.**

**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] **AC-1:** the generator emits exactly one `UserPlugin "pam-osc"` with one component. It keeps the former Start Stop plugin and component GUIDs (`build-plugin-xml.mjs:25-34`), and that is tested. _Verify on onPC:_ the import shows one pool entry, and re-importing over an existing v2.0.0.3 "pam-osc Start Stop" replaces it.
- [ ] **AC-2: fails (BUG-1).**
  - All five options are still in the merged dialog: resend, colors, names, timecode, fixed page (`pam-OSC.lua:461-878`).
  - Two entry points reach it: the popup shown while running, and the `"settings"` argument.
  - But every control binds `PluginComponent = myHandle`, and `myHandle` is never defined in the merged file. The settings controls therefore can't call their handlers.
- [x] **AC-3** (statically): `runOscSelfCheck()` runs on every start (`:1140`) and on `check` (`:1346`). It reads `ShowData().OSCBase` children, checks the receive entry and the send entry named `pam-osc`, and prints `ok` lines or warnings. _Verify on onPC:_ `Children()` and `:Get()` return what `readOscEntries` expects.
- [~] **AC-4: verify on onPC.**
  - Missing entries get `base:Append()`, then `:Set()` for each property from the maintainer's export, and every value is read back (`:1012-1033`).
  - Whether `Append()` without a class name creates an `OSCData` object, and whether `Mode`, `DestinationIP` and the toggles can be written and read back, is still unverified.
  - The failure path leaves a half-configured entry behind (BUG-2).
- [x] **AC-5** (statically):
  - Each failure path warns through `ErrPrintf`, falling back to `Printf`, and names the entry, its port and the toggles: no OSCBase, unreadable children, Append refused, a property that doesn't read back.
  - The warning also points to MENU > In & Out > OSC or the app's OSC config import.
  - Every MA3 call sits inside a pcall, so a refused Append can't abort the plugin start.
- [x] **AC-6:** `gma3_library/inout/osc/pam-osc.xml` contains both entries. `pam-osc-receive` is on 9003 with Send and SendCommand off, so Receive and ReceiveCommand stay at their default Yes. `pam-osc` is on 9004 with Receive, ReceiveCommand and Send off, so SendCommand stays at its default Yes. The generated config from PAM-35 has the same shape.
- [x] **AC-7** (statically): the `pamPing`, `pamConfig`, CMD-key and SendOSC paths are unchanged. Only the loop start changed: `opdateOSC` is now set before the self-check and the QuickKey setup instead of after, and a heartbeat was added. The protocol and connection tests are green. _Verify on onPC:_ the handshake, feedback and CMD mode work end to end with 2.0.0.4.

### Edge cases

- [~] **EC-1: partial.**
  - Pass: an entry with the right name on the wrong port warns and is not duplicated, and a receive entry without Receive Command warns (both tested).
  - Not checked on the `pam-osc` send entry: its toggles (SendCommand on, Receive and ReceiveCommand off) and its Mode (UDP). If one of these is wrong, the plugin still prints "ok" (BUG-4).
- [x] **EC-2** (per the design resolution): auto-create uses 9003/9004, and a port mismatch on an existing entry gives a "fine if you changed …" warning. But the receive-side fallback can accept an unrelated OSC line (BUG-3).

### Console safety (red team)

- **Overwrite or delete of user OSC lines:** pass. Existing entries are only read. There are no `Set` calls on existing children, no `Delete` or `Remove` anywhere, and `Append` only adds at the end of the list.
- **Duplicates on every start:** pass on the happy path, because entries are found by name. On the degraded path it fails: a failed or partial create can leave an entry behind that the next start doesn't recognise, so a new one is appended each start (BUG-2).
- **Running unexpectedly during a show:** pass. The self-check runs only on plugin start or an explicit `check`. It never runs periodically or from the loop. It writes to show data only when an entry is missing. _Verify on onPC / in a multi-user session:_ whether the created OSCData syncs to the other stations, and whether a new line becomes active without toggling OSC.
- **Append refused while a show is running:** pass. Every OSCBase access is pcall-guarded, the plugin warns and continues into the QuickKey setup and the loop.
- **Network exposure (Info):** the plugin now turns on a Receive Command line on UDP 9003 on its own, which lets anyone on the network run commands on the console. That used to be a deliberate manual step. It is needed and is printed ("created OSC receive entry … Receive + Receive Command"). Worth one line in the README or release notes for venue networks.
- **Upgrade, old "pam-osc Settings" plugin:** it stays in the pool. It is harmless, because it writes the same GlobalVars, and the MA3 setup guide now says it can be deleted. Macros calling `Plugin "pam-osc Start Stop"` by name break after the rename; there are no references in the app or README. This belongs in the release notes.
- **Upgrade, running v2.0.0.3 loop:** the old loop writes no heartbeat. If the user re-imports while it runs and then presses the new plugin, `isLoopRunning()` is false, so a second loop starts (BUG-5).

### Bugs

**BUG-1: the settings dialog is dead because `myHandle` is undefined**

- **Severity:** High (AC-2 fails; Settings is one of the three popup actions)
- **Where:** `pam-OSC.lua:16` captures only `signalTable = select(3, ...)`. `myHandle` is used at `:608, :645, :682, :719, :785, :812` (`checkBoxN.PluginComponent = myHandle`, `pageInput`, `closeButton`). The old `SettingsPage.lua` had `local myHandle = select(4, ...)`; it was dropped in the merge.
- **Steps:** start pam-osc → run it again → Settings (or `Plugin "pam-osc" "settings"`) → click a checkbox or Close.
- **Expected:** the checkbox toggles, the GlobalVar is set and `forceReload` fires.
- **Actual:** `PluginComponent` is nil, so no signal reaches `signalTable`. Depending on MA3, either the nil assignment raises and the half-built dialog stays on the overlay, or the controls silently do nothing. Escape still closes it.
- **Fix hint:** add `local myHandle = select(4, ...)` next to `signalTable`. Consider a CI check that fails on undefined globals in the `luac -l` output. Neither the plugin-xml string test nor the Lua test catches this today.

**BUG-2: a failed or partial create leaves an entry behind, which can duplicate on every start**

- **Severity:** Medium (degraded path only; verify on onPC)
- **Where:** `pam-OSC.lua:1012-1033` (`createOscEntry`)
- **Detail:**
  - After `Append()` succeeds, failing `Set` calls only add to a `failed` list. The entry is never rolled back.
  - A fresh OSCData carries MA3 defaults. Judging by the export, which omits default values, those are Receive, ReceiveCommand, Send, SendCommand and Echo all **Yes**.
  - If `Name` doesn't land, the next start doesn't find `pam-osc` and appends again, every start.
  - The leftover blank entry also has command receive and send switched on until someone cleans it up.
  - The same window exists for a moment on the success path, before the `Set` calls land.
- **Fix hint:** on any failed property, delete the appended child. Or set `Name` first and abort and roll back if it doesn't read back. Or set the toggles to No first.

**BUG-3: the receive-side fallback accepts any command-receiving line, so a default-port user may not get the 9003 entry**

- **Severity:** Medium
- **Where:** `pam-OSC.lua:936-938`
- **Steps:** the console already has an OSC line for another tool (Companion, TouchOSC, …) with Receive + Receive Command on port 8000. The user runs pam-osc with the app's default send port 9003.
- **Expected:** `pam-osc-receive` on 9003 is created.
- **Actual:** the port-8000 line is taken as "the" receive entry and nothing is created. The console prints a soft "fine if you changed the send port" warning plus an `ok` line. The app stays on "no response from GrandMA3".
- **Fix hint:** in the fallback, only accept entries on 9003. Otherwise create `pam-osc-receive`, which is additive and harmless.

**BUG-4: the `pam-osc` send entry's toggles and mode are not checked (EC-1 partial)**

- **Severity:** Low
- **Where:** `pam-OSC.lua:959-971`; `readOscEntries` doesn't read `SendCommand` or `Mode`.
- **Detail:** a `pam-osc` entry with SendCommand off, or set to TCP, gets reported as "ok". SendOSC failures are still logged (PAM-12), so it isn't fully silent.

**BUG-5: the start guard depends on `os.time` and the heartbeat, so a second loop can start**

- **Severity:** Low (verify on onPC)
- **Where:** `pam-OSC.lua:1085-1094`, `:1123-1141`
- **Cases:**
  - (a) If `os.time` isn't available, `now()` returns 0 and `isLoopRunning()` is always false. Every press then starts another loop, the opposite of the "degrades to old stop" promise in `design.md`.
  - (b) If the self-check plus first-run QuickKey creation takes more than 3 s, a second press in that window starts a second loop.
  - (c) An old 2.0.0.3 loop that is still running writes no heartbeat (see the upgrade note above).
- **Fix hint:** when `now()` returns 0, fall back to `opdateOSC` alone. Refresh the heartbeat between the self-check and the QuickKey setup. Add a release note: stop the old plugin, or restart MA3, before re-importing.

### Verdict

**Not approved.** BUG-1 (High) breaks AC-2: the merged Settings dialog can't work as shipped. The fix is one line.

- Once BUG-1 is fixed, a **beta test build is OK** for the onPC session tonight. The OSC self-check is read-only on existing entries and pcall-guarded throughout, so it can't damage a show.
- BUG-2 and BUG-3 should be fixed, or explicitly accepted, before Approved. BUG-2 should be fixed before a public beta.
- Still open, verify on onPC: AC-4 (Append/Set/read-back for every property), the PopupInput return value, `os.time`, `HostType()`, whether a new line becomes active without toggling OSC, session sync, AC-1 re-import replaces the old Start Stop plugin, and AC-7 end to end.
