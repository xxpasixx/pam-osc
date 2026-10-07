# Review — PAM-32

**Reviewed:** 2026-10-07
**Where tested:** local — static review of the uncommitted diff (`pam-OSC.lua`, `app/scripts/build-plugin-xml.mjs`, `gma3_library/datapools/plugins/pam-osc.xml`); `luac -p pam-OSC.lua` clean; the new resolver/reader block extracted and exercised in stock Lua 5.5 against mock objects (new build, 2.x with nil-on-unknown-key, 2.x with raising-on-unknown-key, raising read, stale first object); XML regenerated with `node scripts/build-plugin-xml.mjs` and byte-compared to the working-tree file; `vitest run src/plugin-xml.test.ts` (7/7 green). Full Vitest suite deliberately not run (virtual MIDI ports in use elsewhere). **No GrandMA3 console / onPC connected during this review.**
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1 (code): `resolvePlaybackReader` (`pam-OSC.lua:360-368`) selects `o:IsRunningPlayback()` when the object exposes it and falls back to `o:HasActivePlayback()` otherwise; the only former call site (`pam-OSC.lua:590`) now goes through `isRunningPlayback()`. Mock run: new build → 1000 calls, all via the new method, the deprecated one never touched; 2.x mock (both nil-on-unknown-key and raising-on-unknown-key `__index`) → fallback taken, correct values returned. Presence is tested by indexing inside `pcall`, not by calling, which is the right choice (a raising new method does not latch onto the deprecated name). **Console-only:** that `IsRunningPlayback` really is an Obj method with the same return semantics as `HasActivePlayback`, that the System-Monitor flood is gone on the new build, and that a real 2.x console still lights buttons — needs onPC/console (see BUG-1).
- [x] AC-2: resolution is latched in the file-level `playbackReader` upvalue on the first object and never re-probed; the hot path costs one `pcall` + a closure call per watched executor. Confirmed in the mock run (exactly one resolution, one log line over 1000 reads). Trade-off noted in BUG-2.
- [x] AC-3: the read is `pcall`-wrapped (`pam-OSC.lua:375-383`); a raising read returns `false` ("Off") and the loop continues (mock: raising method → `false`, no error escapes). The resolver itself only does a guarded index plus static `Printf`, so it cannot raise either. Note: other reads in the same loop (`GetFader`, `getApereanceColor`, `getName`, `Children`) remain unguarded — explicitly out of scope per spec, not counted against AC-3.
- [x] AC-4: exactly one `Printf` at resolution time, naming the chosen method ("playback state via IsRunningPlayback()" / "IsRunningPlayback() unavailable, falling back to HasActivePlayback()"). Visible in the System Monitor; whether it reaches the app's support package depends on the user copying console logs — not a code gap.
- [x] AC-5: `PLUGIN_VERSION` 2.0.0.2 → 2.0.0.3 with changelog comment; `PLUGIN_PROTOCOL` stays `2` (`pam-OSC.lua:29`), matching `EXPECTED_PLUGIN_PROTOCOL = 2` in `app/src/core/engine/types.ts:57`. Regenerated XML is byte-identical to the working-tree `pam-osc.xml` (in sync with both Lua sources), both plugin entries carry `Version="2.0.0.3"`, `DATA_VERSION` unchanged.

### Edge Cases

- [x] No executor has an object on the first ticks → resolver is simply not invoked until an object appears (call is inside `if myobject ~= nil`). No premature latch on nil.
- [x] Plugin stop/start within one session → `playbackReader` survives as an upvalue; no re-log, no re-probe. Harmless.
- [~] First object raises on index (stale/invalid handle) → latches onto the fallback for the whole session (BUG-2).

### Code Review

- Clean, small, well-commented; the comment at the call site was updated to match reality.
- `return result and true or false` preserves the old boolean normalisation exactly.
- Failures inside the guarded read are swallowed silently (BUG-3).
- The spec says the 104-executor / 10 Hz efficiency question is "parked in `docs/ideas.md`" — it is not there (the `docs/ideas.md` diff has no such line). Doc gap only; see BUG-4.

### Security (red team)

Not an auth/money/PII feature; no new input surface. The change adds no OSC parsing, no string interpolation of external data (both `Printf` strings are static), no file or network access. A hostile app/OSC sender cannot influence which method is chosen. The added `pcall` reduces the plugin's crash surface (DoS of the bridge via a raising read is now impossible on this path). **Pass.**

### E2E (critical journeys, optional)

- Status: **not run** — the critical journey (no deprecation flood, pong arrives, app shows "plugin running") is console-side and cannot be automated here.

### Bugs

**BUG-1: Console verification outstanding (new build + 2.x)**

- **Severity:** Medium (blocks Live, not the code)
- **Steps to reproduce:** Import the regenerated `pam-osc.xml` on (a) the maintainer's newer MA3 build and (b) a GrandMA3 2.x onPC; start "pam-osc Start Stop"; watch the System Monitor; run the app's connection check; toggle a few watched executors.
- **Expected:** (a) one "via IsRunningPlayback()" line, zero deprecation warnings, pong arrives, app reports plugin running, button LEDs follow; (b) one "falling back" line, behaviour unchanged from 2.0.0.2.
- **Actual:** unknown. Also answers the spec's open question whether the ping timeout needs raising once the flood is gone. Additional unknown: whether merely indexing an unknown key on a 2.x Obj emits a one-time console warning (acceptable if once).

**BUG-2: Transient index failure latches the deprecated method for the whole session**

- **Severity:** Low
- **Steps to reproduce (mock-confirmed):** first object passed to the resolver raises on `obj.IsRunningPlayback` (e.g. a handle invalidated between `exec.Object` and the index) on a build that has the new method.
- **Expected:** new method selected.
- **Actual:** `ok == false` is treated the same as "absent" → fallback latched, deprecation flood (the original bug) returns until the plugin chunk is reloaded; the log says "unavailable", which would mislead support. Unlikely in practice (the handle was read the same tick), and retrying on every raise would risk the per-call probing AC-2 forbids. Cheap hardening option: latch the fallback only on `ok and method == nil`; on `ok == false` either re-probe a bounded number of times or log the error text distinctly.

**BUG-3: Raising reads are swallowed without any trace**

- **Severity:** Low
- **Steps to reproduce:** any build where the selected method consistently raises (wrong signature, API change).
- **Expected:** degrade to "not running" (met) and leave a diagnostic.
- **Actual:** every button silently stays "Off" with nothing in the System Monitor. Suggest a one-time `Printf` of the first error message.

**BUG-4: Spec references a parked idea that is not in `docs/ideas.md`**

- **Severity:** Low (docs)
- **Actual:** Out-of-Scope bullet 2 says the watch-set/tick efficiency question is parked in `docs/ideas.md`; no such line exists. Add the one-liner so the claim holds.

### Verdict

- **ACs:** 5/5 pass in code (AC-1's runtime behaviour on real consoles is console-only, tracked as BUG-1) · **EC:** 2/3 clean, 1 Low · **Bugs:** 4 (0 C / 0 H / 1 M / 3 L) · **Security:** pass
- **Ship:** Approved for code — no Critical/High findings. Before Live, BUG-1 (onPC/console check on the new build and on 2.x) must be done; it is the whole point of the fix. BUG-2/3/4 are optional hardening/docs.
