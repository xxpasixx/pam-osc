# PAM-12: CMD mode (plugin v2) — Review

**Reviewed:** 2026-07-18 · **Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Reviewer pass:** AC verification + code review + adversarial red-team (interception pairing, queue/ack, version gate, plugin Lua error paths). Regression: shares the engine feedback/input path with PAM-2 (Approved) — existing engine suite green (313/313).

## Verdict: NOT READY — stays In Review

No Critical. **One High (F1 — plugin resilience)**, three Medium (F2/F3 ordering, F4 EC-5 gap), three Low. The app-side logic is well-covered by tests; the weaknesses are the plugin's un-guarded macro execution and the queue's trust of the ack value. All ACs pass by reading/tests, but AC-11 has a real ordering hole and EC-5 is not implemented for live loss. Console-side behavior (AC-3/AC-4/AC-6, SendOSC-by-name) still needs onPC certification regardless.

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
