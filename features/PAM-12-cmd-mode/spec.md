# PAM-12: Command-line aware executor buttons (CMD mode, plugin v2)

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17 (pre-mortem findings folded in)

## Why

The maintainer proved this workflow in EvoFaderWing PR #12 ([stagehandshawn/EvoFaderWing#12](https://github.com/stagehandshawn/EvoFaderWing/pull/12)): type a keyword on the console command line (`Store`, `Copy`, `Delete`, …), press an executor button on the hardware — and the button **targets** that executor instead of triggering it, with a clean Oops history. Porting this to pam-osc turns any MIDI board into a programming surface, not just a playback surface. It requires the MA3 plugin to become **v2**: command-line polling, per-executor occupancy status, a version handshake, and OSC-entry resolution strictly by name.

Reference implementation for all interception behavior: EvoFaderWing PR #12 (`lua/EvoFaderWing0.4.lua` `getCmdFlags()` + `src/KeyCmdHandler.cpp`) — in pam-osc the interception logic lives app-side (engine), the detection logic lives in the plugin.

## Dependencies

- PAM-2 (bridge engine — input routing, feedback state)
- PAM-4 (status & diagnostics UI — surfaces version mismatch, CMD indicator, DeskLock)

## Decisions (maintainer, 2026-07-17)

1. **1:1 PR behavior** — full keyword list, context-aware copy/move (`At`/`+`), thru handling, `/NoOops` macro plumbing. The PR is the behavioral reference.
2. **Hard version check** — app requires the matching plugin protocol version; mismatch is a prominent error, not a quiet hint. Basic bridging keeps working (never brick a running show).
3. **OSC entry by name only** — the numeric fallback (line 2) is removed; the entry must be named `pam-osc`.
4. **Colors/LED-brightness improvements from the PR are excluded** — parked in `docs/ideas.md` (appearance colors) and PAM-10 (LED brightness).

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given plugin v2 is running, when the MA3 command line starts with a listed keyword (store, delete, fix, update, on, off, toggle, release, rel, load, select, go, top, temp, flash, deactivate, kill, activate, lock, label, edit, assign — the PR's `CMD_KEYWORDS` list), then the plugin sends the CMD flags via OSC within one poll tick; when the command line is cleared or starts with an unlisted word, the flags return to 0 within one poll tick.
- [ ] **AC-2** — Given CMD flags with auto-execute are active, when I press a button whose action is an executor key, then the app fires the oops-clean macro sequence that appends `Page <page>.<execNo>` to the console command line and executes it — the normal `/Page<page>/Key<execNo>` press is fully suppressed (press **and** release), and the executor is not triggered.
- [ ] **AC-3** — Given the command line holds `Copy`/`Move` context, then the button press is context-aware: no source yet → append `Page X.Y` **without** execute; source selected and target executor **empty** → `At Page X.Y` **with** execute (one press completes the copy); source selected and target **occupied** → `+ Page X.Y` without execute.
- [ ] **AC-4** — Given the command line ends with an open `Thru`, then a button press appends only the bare executor number (no `Page` prefix), without execute; given a completed range (`Copy Page 1.X Thru Page 1.Y`), the next press behaves like AC-3 source-selected; given a command line ending in `At` (destination prompt), the press appends `Page X.Y` and executes.
- [ ] **AC-5** — Given plugin v2 is running, then it reports each watched executor as one of **empty / occupied / active** (today's plugin only knows active-playback on/off); the app uses this to decide `At` vs `+` in AC-3.
- [ ] **AC-6** — Given a CMD-mode action was performed, when I press Oops once on the console, then exactly the user-visible action is undone; the macro plumbing (delete/store/set/go of the `pam-osc_CMD` macro) runs with `/NoOops` and never appears in the Oops history.
- [ ] **AC-7** — Given the app expects plugin protocol version N, when the plugin pong reports an older version or the v1 pong (plain `1`), then Status and diagnostics show a prominent "plugin update required" error naming both versions, and CMD mode stays disabled; basic bridging (faders, buttons, feedback) keeps working.
- [ ] **AC-8** — Given plugin v2 starts, then it resolves the feedback OSC entry **only** by the name `pam-osc` (case-insensitive, any line number) — the numeric fallback is removed; if no such entry exists, the plugin prints a clear error naming the required entry name, and the app-side diagnosis points to the setup guide (PAM-9).
- [ ] **AC-9** — Given the desk is locked, then the app blocks all MIDI→console traffic (existing v1 behavior, kept as regression) **and** the Status tab shows the DeskLock state; when the desk is unlocked, a full resend re-syncs motor faders and LEDs.
- [ ] **AC-10** — Given CMD flags are active, then the Status tab shows a clear indicator ("console command line is waiting for a target — executor buttons now select"); the indicator disappears when the flags reset.
- [ ] **AC-11** — Given two executor-key buttons are pressed in quick succession while CMD flags are active, then the app serializes the macro sequences (never two interleaved rebuilds of `pam-osc_CMD`); both presses are applied in order.

## Out of Scope

- Appearance-color improvements from PR #12 (cue/pool/theme fallbacks) — parked in `docs/ideas.md`
- LED brightness sync from MA3 `DeskLightsCollect` — belongs to PAM-10 (colored button feedback), parked in `docs/ideas.md`
- Pushing the plugin to the console over the network (PAM-9 stays local-install + guide)
- MA2 support (PRD non-goal)

## Edge Cases

- **EC-1** — Command line holds an unlisted keyword or free text → no interception, buttons behave normally.
- **EC-2** — Buttons whose action is a QuickKey or free-text command, plus faders and encoders → never intercepted, regardless of CMD flags.
- **EC-3 (stale flags)** — User clears the command line on the console (Please/Esc) in the same moment as the button press: the flags on the app side may be one poll tick old. The design must bound this window (poll tick ≤ plugin tick, flags reset on connection loss/session end) and choose a macro construction that degrades harmlessly when the command line turns out empty. [NEEDS CLARIFICATION → /design: exact stale-flag guard]
- **EC-4 (stale occupancy)** — A copy just filled the target executor but the occupancy update hasn't arrived: the press sends `At Page X.Y` + execute and MA3 shows its native overwrite/merge prompt — acceptable, but the design should minimize the window (occupancy resend on CMD actions).
- **EC-5** — Connection loss, plugin stop, or session end → CMD flags and occupancy state reset app-side; no interception until fresh flags arrive.
- **EC-6** — Desk locked while CMD flags active → input is blocked by AC-9 before any interception logic runs.

## Technical Requirements

- `gma3_library/datapools/plugins/pam-osc.xml` is **regenerated from the repo's `.lua` sources** as part of this feature — the currently bundled XML embeds a pre-v1.4 Lua (sends `faderValue * 1.27`); plugin version bumps to 2.0 and carries the protocol version used by the AC-7 handshake.
- Exact OSC message shapes (flags message, occupancy message, pong-with-version) and the macro sequencing are `/design` work.

## Open Questions

- [ ] **Atomic macro sequence** — the PR sends 7 separate `/cmd` UDP messages with `delay(10)`/`delay(50)`; UDP guarantees neither order nor delivery, and a lost message can fire a stale macro. Can the sequence be collapsed into fewer/one `/cmd` message (`;`-chained commands) or otherwise made loss-tolerant? (→ /design, verify on onPC)
- [ ] **Which page for `Page X.Y`** — with the plugin's `fixedPageNr` setting, the watched page differs from the console's current page; define which page the CMD macro targets. (→ /design)
- [ ] **`Go+`-style tokens** — keyword extraction uses `%a+` (letters only); confirm behavior for `Go+`, `GoFast` etc. matches the PR reference. (→ /design, low risk)

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Interception logic lives app-side (engine), detection in the plugin | Keeps the plugin a thin sensor; app knows mappings/pages and can serialize; mirrors the PR split (Lua detects, firmware acts) | 2026-07-17 |
| Hard version check over graceful degradation | Maintainer choice — a half-working CMD mode is worse to support than a clear "update the plugin" | 2026-07-17 |
| OSC entry strictly by name, no numeric fallback | Maintainer request — setups must not depend on line numbers | 2026-07-17 |
