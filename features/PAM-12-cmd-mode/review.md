# PAM-12: CMD mode (plugin v2) — Review

**Reviewed:** 2026-07-18 · **Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Reviewer pass:** AC verification + code review + adversarial red-team (interception pairing, queue/ack, version gate, plugin Lua error paths). Regression: shares the engine feedback/input path with PAM-2 (Approved) — existing engine suite green (313/313).

## Verdict: fix round applied 2026-07-18 → Approved (app-side); onPC certification required before /ship

**First pass:** no Critical, one High (F1), three Medium (F2/F3, F4), three Low. **All fixed in the fix round below** (commit follows this file). No Critical/High remain → status **Approved**. The console-side behavior that can only be proven on hardware (macro plumbing/Oops cleanliness AC-3/AC-4/AC-6, SendOSC-by-name AC-8, the plugin-side pcall/log/page fixes) is **not** review-blocking but **is** a hard `/ship` gate per AGENTS.md (release-ready only after onPC + real device).

### Fix round outcomes

- **BUG-1 / F1 (High) — FIXED.** `pam-OSC.lua` `executeCmdKey`: the macro plumbing is now wrapped in `pcall`; on error it logs and still sends `/status/cmdKeyDone` so the app queue advances. A raising `Cmd()` can no longer unwind the main loop. (Console-verify on onPC that the happy path still stores/fires the macro.)
- **BUG-2 / F2+F3 (Medium) — FIXED.** `cmd-keys.ts` `onCmdKeyAck` now advances only when `executor === awaitingAck`; late/duplicate/bogus acks are logged and ignored. New test `ignores an ack for a different executor…`.
- **BUG-3 / F4 (Medium) — FIXED.** `cmd-keys.ts` counts consecutive ack timeouts; after 2 with no success it resets CMD state (flags 0, queue clear, interceptedPresses clear, UI notified) so a dead console self-heals; a live plugin re-sends flags on reconnect (forceReload). New test `disables CMD mode after consecutive ack timeouts…`.
- **BUG-4 / F5 (Low) — FIXED.** `sendOsc` now logs a `SendOSC` failure only once (latched until the next success) — no ~10 Hz flooding. Still the top onPC watch item.
- **BUG-5 / F6 (Low) — FIXED.** `input-router.ts` cleans up an intercepted press's release *before* the `minValue` guard, so min-valued executor buttons no longer leak `interceptedPresses` entries.
- **BUG-6 / F7 (Low) — WON'T FIX (by design).** A release in CMD mode with no recorded press falls through to a normal Key 0 — this is required so a press made *before* CMD started still gets its release (covered by the "press/release pair normal when CMD starts in between" test). MA3 ignores a truly unmatched release. Documented in the code.
- **BUG-7 / F8 (Low) — FIXED.** `pam-OSC.lua` consumes `pamCmdKey` *after* the page recompute, so a key pressed on the same tick as a page change targets the current page.

315/315 tests, typecheck, build green.

## AC results

| AC | Verdict | Notes |
| -- | ------- | ----- |
| AC-1 | PASS | `getCmdFlags` + change-driven `/status/cmdFlags`; parity-tested (real cmdline read pending onPC). |
| AC-2 | PASS | Press+release suppression, one SetVar per press; tested. (F6/F7 are edge leaks, not AC-2 failures.) |
| AC-3 | PASS (by reading; onPC) | copy/move context matrix (`At`/`+`) in `executeCmdKey`. |
| AC-4 | PASS (by reading; onPC) | thru / completed-range / trailing-`At` handling present. |
| AC-5 | PASS | `isExecutorOccupied` is a live read at execution time; no occupancy streamed (matches the AC-5 delta). |
| AC-6 | PASS-with-caveat | plumbing is `/NoOops`; the final `Go Macro` is deliberately not — verify onPC that one Oops undoes exactly the user action and no plumbing shows. |
| AC-7 | PASS | hard version gate; pong without arg → protocol 1 → terminal `plugin-outdated`; bridging survives; tested. |
| AC-8 | PASS | name-only `SendOSC "pam-osc"`; missing entry logged (F5 is the flip-side risk). |
| AC-9 | PASS | DeskLock blocks all MIDI before interception + console-state event; tested. |
| AC-10 | PASS | console event carries `cmdFlags`, clears to 0; UI chip renders it. |
| AC-11 | PASS-with-risk | serialization + timeout + cap work in tests, but F2/F3 can silently drop a press on late/duplicate/bogus acks. |
| EC-2/EC-6 | PASS | quickKey/command/fader/encoder never intercepted; desk-locked blocks first. |
| EC-3 | PASS | plugin re-parses cmdline at execution → safe no-op with ack. |
| EC-5 | **FAIL** | see F4 — only session-end resets state, not live connection loss / plugin stop. |

## Bugs

- **BUG-1 / F1 (High)** — `pam-OSC.lua` `executeCmdKey` (the seven `Cmd('… Macro "pam-osc_CMD" …')` calls) runs **unguarded** inside the main `while` loop. `getCmdFlags`/`isExecutorOccupied` are `pcall`-wrapped, the macro plumbing is not. If any macro `Cmd()` raises (pool full, name collision, odd show state) the exception unwinds `main()` and the loop terminates → **all feedback dies** (faders, LEDs, colors, page, pong) until the user restarts the plugin, and the ack on line 231 is skipped so the app queue stalls (recovers only via the 300 ms timeout). Fix: wrap the execution body in `pcall`, always send `/status/cmdKeyDone`. _(PLAUSIBLE — depends on whether MA3's `Cmd()` raises vs returns an error string; the defensive wrap is cheap and correct either way. Rated High because a dark plugin mid-programming is the worst outcome for a live-show tool.)_
- **BUG-2 / F2 + F3 (Medium)** — `cmd-keys.ts:42-49` `onCmdKeyAck` advances the queue on **any** ack, even when `executor !== awaitingAck`. A late ack (plugin tick > 300 ms timeout), a duplicate UDP ack, or a bogus `/status/cmdKeyDone,i,999` (forwarded unchecked by `feedback-router.ts:56-59`) advances prematurely and overwrites the not-yet-consumed `pamCmdKey` → a press is silently lost, violating AC-11 ordering. Fix: gate the advance on `executor === awaitingAck`; ignore mismatches (the timeout self-heals a genuinely stuck queue).
- **BUG-3 / F4 (Medium)** — EC-5 gap: `cmdFlags`/`pluginProtocol` reset only on engine stop/reconfigure (`createRuntimeState`), never on live connection loss or plugin stop, and the `ConnectionChecker` stops polling once connected so mid-session loss isn't even detected. Consequence: console dies with a keyword active (flags=4) → `cmdModeActive` stays true → executor presses keep being swallowed into a queue aimed at a dead console. Self-heals only when a *changed* flags value next arrives. Fix: reset CMD state on detected loss, or reconcile the spec (EC-5) with the no-heartbeat reality.
- **BUG-4 / F5 (Low, onPC-verify)** — `pam-OSC.lua:42-48` `sendOsc` logs a `Printf` whenever `Cmd('SendOSC …') ~= "OK"`. If MA3 returns anything but the literal `"OK"` in normal operation, this floods the log at ~10 Hz across all feedback. Pattern was taken verbatim from the maintainer's working EvoFaderWing plugin, so likely fine — **top onPC verification item**.
- **BUG-5 / F6 (Low)** — `input-router.ts`: an executor button with `options.minValue` set gets its press intercepted (added to `interceptedPresses`) but its release is dropped by the `minValue` guard before the delete runs → the Set entry leaks (bounded by the count of such buttons). No functional misbehavior; latent smell.
- **BUG-6 / F7 (Low)** — `input-router.ts`: a release-without-recorded-press in CMD mode falls through to a normal `/Page/Key0` send (MA3 ignores an unmatched release; impact low).
- **BUG-7 / F8 (Low)** — `pam-OSC.lua`: `executeCmdKey` uses `destPage` from before the page-update block, so a key pressed on the same tick as a page change targets the previous page (~100 ms window).

## Checked, OK (non-issues)

`cancelCmdTimers` clears ackTimer/awaitingAck/queue on shutdown (no leak). Queue overflow caps at 8 with a log (tested). `/status/cmdFlags` validation (integer ≥0, dedupe, malformed ignored) solid. DeskLock guard runs before interception (EC-6). Version gate requires protocol 2 exactly. Plugin resets `pamCmdKey` at start and before executing (no re-fire); safe no-op path still acks.

## Recommendation

Fix **BUG-1 (High)** and **BUG-2 (Medium, AC-11)** before onPC certification — both are cheap, high-value. **BUG-3 (EC-5)** is a genuine contract gap: decide implement-vs-respec. BUG-4 is the first thing to watch on onPC. BUG-5/6/7 are polish. Then re-review and run the onPC pass (macro plumbing, Oops cleanliness, SendOSC-by-name).
