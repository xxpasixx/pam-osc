# PAM-12: Command-line aware executor buttons — Technical Design

<!-- Owner: /design. Plain language, no code. Two readers: the maintainer (approves)
     and /build (implements directly against it). -->

## Status: Designed (approved by the maintainer 2026-07-18)

**Created:** 2026-07-17 · **Spec:** [spec.md](spec.md)

## The one decision that shapes everything

**The CMD action executes inside the Lua plugin, not in the app.** The EvoFaderWing PR builds the macro from the device side by sending seven separate `/cmd` UDP messages with delays — that is exactly where the pre-mortem risks live (lost/reordered packets firing a stale macro, stale flags, stale occupancy). pam-osc already has a better channel: the app can run Lua on the console via a single `/cmd Lua '…'` message (the existing pamPing works this way). So:

- The **app** decides only *whether* to intercept (flags active?) and sends **one** small message per press: "executor N was pressed in CMD mode" (a GlobalVar the plugin watches).
- The **plugin** consumes that variable on its next tick and performs the whole action locally and synchronously: it re-reads the command line **fresh**, reads the target executor's occupancy **live**, builds the `pam-osc_CMD` macro with `/NoOops`, and fires it — ordered Lua `Cmd()` calls, no UDP between steps, no delays.

This resolves all three spec Open Questions and defuses EC-3/EC-4 by construction:

| Spec item | Resolution |
| --------- | ---------- |
| Open Q "atomic macro sequence" | One UDP trigger message; all plumbing runs synchronously in Lua on the console |
| Open Q "which page" | The plugin uses its own watched page (`fixedPageNr` if set, else current page) — consistent with what the board displays |
| Open Q "`Go+`-style tokens" | Keyword extraction ported verbatim from the PR (`letters-only` first word; `Go+` → keyword `go`, intercepted, auto-execute) — same proven behavior |
| EC-3 stale flags | The plugin re-parses the command line at execution time; if it is empty or holds no listed keyword by then, the action is a **safe no-op** (console log line, ack still sent) — never an unexpected executor trigger |
| EC-4 stale occupancy | Occupancy is read live from the executor object at execution time — the `At` vs `+` decision can't be stale |

**Trade-off:** up to one plugin tick (~100 ms) latency between button press and console action — irrelevant for programming actions. And more logic lives in Lua, which has no unit-test harness; mitigated by keeping the Lua functions small and porting the PR's proven parsing verbatim, with the engine-side protocol fully covered by fake-MA3 tests.

## A) Component Structure

```
Console (GrandMA3)
└─ pam-osc plugin v2 (pam-OSC.lua, protocol 2)
   ├─ cmd-line watcher: parses CmdObj().cmdtext each tick → sends /status/cmdFlags on change
   ├─ cmd-key consumer: watches GlobalVar "pamCmdKey" → executes the macro action, acks
   └─ existing loop (faders/buttons/colors/names/page/deskLock/pong) — pong now carries protocol 2,
      OSC entry resolved by name "pam-osc" only (numeric fallback removed)

App
├─ Engine (app/src/core/engine)
│  ├─ state.ts             + cmdFlags, pluginProtocol, CMD press queue, intercepted-press markers
│  ├─ feedback-router.ts   + /status/cmdFlags, /status/cmdKeyDone, pong version arg
│  ├─ connection.ts        + version evaluation → new state "plugin-outdated"
│  ├─ input-router.ts      + interception: executor-key press in CMD mode → queue, suppress Key send
│  └─ types.ts             + console-state event (deskLocked, cmdFlags, pluginProtocol)
├─ Main (engine-host.ts)     caches console state, includes it in snapshot + IPC event
└─ Renderer (StatusView.tsx) DeskLock chip, CMD-mode indicator, plugin-outdated error banner

Build tooling
└─ plugin XML generator: .lua sources → gma3_library/datapools/plugins/pam-osc.xml (version 2.0.0.0)
   + bundled-content test asserting XML ⇄ .lua parity
```

## B) Data Model

**Nothing is persisted.** All CMD state is runtime-only and mirrors the console — it fits the existing "Not persisted" rule in `docs/data-model.md` (no map change).

Engine runtime state additions (reset on every engine start):

| Field | Type | Meaning |
| ----- | ---- | ------- |
| cmdFlags | integer bitmask, default 0 | Last `/status/cmdFlags` value. Nonzero = interception active. Bits (PR-compatible): 2 = add-to-cmdline without execute · 4 = add + auto-execute · 8 = copy/move source selected · 16 = thru open |
| pluginProtocol | integer or unknown, default unknown | Version from the last plugin pong; 1 = v1 plugin (outdated), 2 = current. Interception requires exactly 2 |
| cmdQueue | ordered list of executor numbers, max 8 | Presses waiting for the plugin ack; overflow is dropped with a log line |
| cmdAwaitingAck | executor number or none | The press sent to the console, not yet acked |
| interceptedPresses | set of (mapping id, control id) | Controls whose press was intercepted — their release is swallowed too, even if flags changed in between (press/release always pair) |

Plugin v2 internal state (Lua, per run): last sent flags, last consumed `pamCmdKey` value. The GlobalVar `pamCmdKey` is numeric; 0 = consumed/idle.

## C) Behaviors & the OSC protocol v2 contract

### New/changed messages

| Message | Direction | Args | When |
| ------- | --------- | ---- | ---- |
| `/status/pluginPong` | console → app | integer protocol version (v2 sends 2; the v1 plugin sends 1) | Answer to pamPing, unchanged trigger |
| `/status/cmdFlags` | console → app | integer bitmask (0 clears) | On every change of the parsed command-line state, and on forceReload |
| `/cmd` with `Lua 'SetVar(GlobalVars(), "pamCmdKey", N)'` | app → console | N = executor number (101–4xx) | Per intercepted press, one at a time (queue) |
| `/status/cmdKeyDone` | console → app | integer executor number | After the plugin executed **or safely no-op'd** the pressed key — always acked |

Everything else (faders, buttons On/Off, colors, names, page, deskLocked, masterEnabled, timecode) is **unchanged** — the existing feedback contract stays intact.

### Interception decision (app, input-router)

A MIDI note press on a control whose assignment action is **executor** is intercepted **iff** `cmdFlags ≠ 0` **and** `pluginProtocol = 2` **and** the desk is not locked (the existing DeskLock guard already sits in front). Intercepted means: no `/Page…/Key…` is sent for press **or** release; the executor number goes into the CMD queue. All other action types (quickKey, command, modifier, timecodeSelect, attribute) and all faders/encoders are never intercepted (EC-2).

Queue behavior (AC-11): exactly one outstanding press; the next is sent when `/status/cmdKeyDone` arrives or after a 300 ms ack timeout (new EngineTiming constant, test-overridable). Queue capacity 8; drops are logged.

### Execution (plugin, per consumed key)

1. Read the command line fresh. No listed keyword and not ending in `At` → **no-op**: Printf one line, send ack, done (EC-3).
2. Determine the command text exactly per the PR matrix, using the plugin's watched page P and pressed executor N:
   - keyword with auto-execute → `Page P.N`, Execute Yes
   - `Copy`/`Move` without source → `Page P.N`, Execute No
   - `Copy`/`Move` with source, target **empty** → `At Page P.N`, Execute Yes
   - `Copy`/`Move` with source, target **occupied** → `+ Page P.N`, Execute No
   - open `Thru` → bare `N`, Execute No; completed thru range → treat as source-selected
   - command line ends in `At` → `Page P.N`, Execute Yes
   Occupancy = live read of executor N on page P: no assigned object → empty; object present → occupied.
3. Build and fire the macro synchronously: delete/store/set (`command`, `AddToCmdLine "Yes"`, `Execute Yes|No`)/go of macro `pam-osc_CMD`, every plumbing command with `/NoOops` (AC-6); no artificial delays (Lua `Cmd()` is synchronous — build verifies once on onPC).
4. Send the ack.

### Version handshake (AC-7)

The connection checker evaluates the pong's version argument: missing or ≠ 2 → new connection state **plugin-outdated** (reachable, plugin answers, wrong version). Status shows a prominent error naming both versions ("plugin is version 1, this app needs 2 — reinstall via the setup assistant"); diagnostics link to PAM-9. Bridging keeps running; interception stays off (it requires protocol 2). A pong without any argument counts as version 1.

### Console-state surface (AC-9, AC-10)

New engine event carrying `{ deskLocked, cmdFlags, pluginProtocol }`, emitted on change; engine-host caches it and includes it in the snapshot. StatusView renders: a DeskLock chip (locked = warning color, "MIDI input blocked"), a CMD indicator while `cmdFlags ≠ 0` ("console command line is waiting for a target — executor buttons now select"), and the plugin-outdated banner. All disappear when their state clears (AC-10); engine stop/restart resets everything (EC-5).

## D) Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| -------- | --------- | ---------------------- | --------- | ---- |
| Execute the CMD action in the plugin, triggered by one GlobalVar message | Atomic (synchronous Lua), fresh command line and occupancy at execution time — kills the pre-mortem's UDP loss/staleness risks by construction | 1:1 PR port: app sends 7 `/cmd` messages with delays | ~100 ms tick latency; more Lua (no unit tests console-side) | 2026-07-17 |
| Ack-based serialization (`cmdKeyDone` + 300 ms timeout, queue of 8) | AC-11 without the app ever reading console state; a lost ack only costs 300 ms | Fire-and-forget SetVar per press | Slightly slower rapid-fire targeting; strictly ordered | 2026-07-17 |
| Occupancy read live by the plugin — **no occupancy OSC message** (spec delta to AC-5) | The only consumer of occupancy is the `At`/`+` decision, which now runs console-side; a mirrored copy in the app would be the stale one | Plugin streams 3-state per executor (PR approach) | App never knows occupancy (fine — nothing else needs it; PAM-10 can add it later) | 2026-07-17 |
| Existing feedback messages untouched (Button stays On/Off) | Zero regression surface for LEDs/motor faders; protocol additions are purely additive | Consolidated 3-state exec status replacing Button | Slightly chattier protocol than a redesign | 2026-07-17 |
| Version = integer arg on the existing pong; exact match required; new state "plugin-outdated" | Maintainer chose the hard check; reusing the pong means zero new handshake round-trips; v1 pong (arg 1) is automatically "outdated" | Separate `/status/version` message | Pong overloading (documented here) | 2026-07-17 |
| Keyword parsing + copy/move/thru matrix ported **verbatim** from EvoFaderWing PR #12 Lua | Field-proven behavior, spec declares the PR the behavioral reference | Redesigning the keyword table | Inherits PR quirks (`Go+` → `go`) — accepted in spec Open Q3 | 2026-07-17 |
| Plugin resolves the OSC entry by name only; the app's connection-pong Lua **keeps** its numeric fallback | AC-8 targets the plugin; the app-side pong is a diagnostic that must work even on a half-configured console to tell the user *what's* wrong | Removing the fallback everywhere | A wrongly-named entry still answers the connection check (intended: better diagnostics) | 2026-07-17 |
| **Superseded 2026-07-18:** both the plugin **and** the app-side ping now use `SendOSC "pam-osc" "…"` — MA3 accepts the entry name directly, so there is no index lookup and no numeric fallback anywhere | Maintainer confirmed name-addressing works (EvoFaderWing plugin uses it); removes the whole `resolveOscEntry` walk and the fallback ambiguity. `sendOsc` checks the `Cmd()` return for `"OK"` and logs failures | Keep the index resolution + fallback | If the entry is missing, sends are logged failures and the app reports unreachable — clean diagnostics. Needs onPC confirmation | 2026-07-18 |
| Plugin XML generated by a build script from the `.lua` sources + parity test | The bundled XML already drifted (it embeds pre-v1.4 Lua today); generation makes drift impossible | Hand-maintained XML | One more build script to own | 2026-07-17 |

## E) Dependencies

No new packages. (XML generation uses Node's built-ins; base64 blocks match MA3's plugin file format.)

## F) Build Plan

- **Level 1 — Plugin v2 + tooling** (AC-1, 5→delta, 6, 8; files: `pam-OSC.lua`, new `app/scripts/build-plugin-xml.mjs`, `gma3_library/datapools/plugins/pam-osc.xml`, new parity test in `app/src/core/format/` test area): cmd-line watcher + flags message, `pamCmdKey` consumer + macro execution + ack, pong protocol 2, name-only entry resolution, XML regeneration + test.
- **Level 2 — Engine** (AC-2, 3, 4 app side, 7, 11; EC-2/3/5; files: `state.ts`, `types.ts`, `feedback-router.ts`, `connection.ts`, `input-router.ts`, `engine.ts`, `testing/fake-ma3.ts`, engine tests): state additions, new message handling, plugin-outdated state, interception + queue + release pairing; fake-MA3 learns cmdFlags/ack replay so the whole press→trigger→ack→next flow is E2E-testable.
- **Level 3 — Surface** (AC-9, 10; parts of 7; files: `engine-host.ts`, preload/IPC, `StatusView.tsx`): console-state event → snapshot → chips/banner.

Level 1 and 2 are file-disjoint and can build in parallel; Level 3 depends on 2. Final verification needs onPC + a real board (macro plumbing, `/NoOops`, no-delay assumption).

## Spec deltas required on approval

1. **AC-5** (edit in place): occupancy is evaluated live by the plugin at execution time; the plugin does **not** stream occupancy over OSC.
2. **Open Questions 1–3**: close with the resolutions above.
3. **EC-3 marker**: resolved — stale press degrades to a safe no-op with ack.
