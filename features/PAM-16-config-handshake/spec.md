# PAM-16: Config handshake — app tells the plugin what to watch, with periodic re-sync

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-18 · **Last Updated:** 2026-07-18

## Why

Today the plugin polls a **hardcoded** set of executor ranges (101–122, 201–222, 301–322, 401–422, 191–198, 291–298) at ~10 Hz and reads its feature flags (send colors/names/timecode, resend buttons, fixed page) from `GlobalVars` set by the separate Settings dialog. The app — which actually knows the active mapping and the user's settings — never tells the plugin what it needs. So the plugin watches executors nobody mapped, the console-side Settings dialog is a second source of truth, and there is no recovery when the plugin's state drifts (missed message, reload). This feature makes the **app the source of truth**: on connect and on a periodic heartbeat (~30–60 s), the app sends the plugin the exact executors to watch (derived from the active mapping) and the feature flags, and the heartbeat re-aligns a stuck or desynced plugin without user action.

## Dependencies

- PAM-2 (bridge engine + the plugin poll loop that would consume the config)
- PAM-12 (existing `pamPing` / protocol handshake this extends)
- PAM-3 (settings — the feature flags the app sends)
- PAM-1 (mapping — defines which executors are actually used)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given an active mapping, when the app connects to the plugin, then the app sends the plugin the set of executors that mapping actually uses, and the plugin watches only those instead of a fixed hardcoded range.
- [ ] **AC-2** — Given the app's settings (send colors, send names, send timecode, resend buttons, fixed page number), when the app connects, then those flags are sent to the plugin so its feedback matches the app's configuration — the app, not the console-side Settings dialog, is the source of truth.
- [ ] **AC-3** — Given a connected plugin, when the heartbeat interval elapses (~30–60 s, exact value is `/design`), then the app re-sends the current config (executors + flags) so a stuck or desynced plugin re-aligns without user action.
- [ ] **AC-4** — Given the plugin missed an update or reloaded, when the next heartbeat arrives, then the plugin rebuilds its watch set and flags from that message and resumes correct feedback — no manual restart needed.
- [ ] **AC-5** — Given the plugin started before the app connected (no config received yet), then it watches a sensible default executor range until the first sync arrives, and never sits idle waiting.
- [ ] **AC-6** — Given the config handshake rides on the existing version handshake, when the app talks to an older plugin that doesn't understand config messages, then both degrade gracefully: the old plugin keeps working on its defaults and the app doesn't error.
- [ ] **AC-7** — Given the heartbeat runs continuously, then it must not flood the console or the traffic log (guard against the PAM-12 BUG-4 log-flooding failure mode).

## Out of Scope

- Which MA3 action a control is bound to — that's the mapping (PAM-1); this feature only communicates *which executors* and *which feature flags*, not the bindings.
- The OSC-entry self-configuration — that's PAM-13.
- Colored button feedback content itself — that's PAM-10; PAM-16 only carries the on/off flag for it.

## Edge Cases

- **EC-1** — The active mapping uses executors outside the default range (e.g. X-keys / high executor numbers) → the sent set must cover them; the plugin must not silently clamp to the default range once a real config has arrived.
- **EC-2** — Mapping or settings change while connected → the app pushes an updated config immediately (not only on the next heartbeat), so feedback tracks the change.
- **EC-3** — Two units / multiple active mappings → the executor sets must union correctly so no mapped executor is dropped.

## Open Questions

- [ ] **Exact executor ranges & defaults** — current hardcoded set is 101–122 / 201–222 / 301–322 / 401–422 / 191–198 / 291–298. Maintainer indicated a default "up to 210" plus X-keys around the "900" range. _Resolved 2026-07-19 (design): default before first sync = today's hardcoded set; the real watch-set is derived from the mapping's `executor` + `display` action numbers (so X-keys are covered automatically if a mapping uses them). Remaining is onPC-only verification, not a spec ambiguity: whether X-key/900-range executors are reachable via the `Pages[page]:Children()` walk, and the safe max at 10 Hz._
- [ ] **How the mapping exposes its executors** — the app must extract the executor numbers from the active mapping's control→action bindings. Confirm the mapping schema makes this cleanly derivable (which action types carry an executor number). _(Design detail.)_
- [ ] **Transport & interval** — carry the config over a dedicated OSC message vs `SetVar(GlobalVars(), …)` (like `pamCmdKey`)? Fixed heartbeat vs on-drift-only vs both? Leaning: push on connect + on change + a light periodic heartbeat. Confirm at `/design`, and verify the heartbeat cost on onPC.
- [ ] **Relationship to the Settings dialog (PAM-13)** — if the app drives the feature flags (AC-2), the console-side Settings dialog becomes a fallback/local override rather than the primary control. Cross-ref PAM-13 AC-2. _Resolved 2026-07-19 (design): flags live **per mapping** and **OR-merge** across active mappings; `fixedPage` is a single global App Setting; the console Settings dialog stays as an offline fallback but the app's pushed config wins while connected._

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| App is the source of truth for executors + flags | The app knows the active mapping and settings; the plugin should watch exactly what's needed, not a fixed guess | 2026-07-18 |
| Periodic heartbeat re-sync, not one-shot | Plugin state drifts on reload/missed messages; a light periodic push self-heals without the user restarting the plugin | 2026-07-18 |
