# PAM-16 — Design

**Date:** 2026-07-19

> Technical design (HOW). No code — implementation-grade precise. Contract lives in `spec.md`.

## Component Structure

```
App (main process, engine)
+-- ConfigBuilder — from the active mapping(s) computes:
|   +-- executor watch-set  (union of action.number for types "executor" + "display")
|   +-- merged feature flags (OR across active mappings)
|   +-- global fixedPage    (single App Settings value)
+-- ConfigSender — pushes the config to the plugin:
|   +-- on connect · on mapping/settings change · on a ~30s heartbeat
|   +-- via SetVar(GlobalVars(), "pamConfig", <payload>) + forceReload
Plugin (pam-OSC.lua)
+-- reads pamConfig each loop / on change → sets executorsToWatch + option flags
+-- no config yet → default watch-set (today's hardcoded ranges) until first push
```

## Data Model

Per-mapping flags (added to `mappingSchema`, `core/format/mapping.ts`) + one global setting. All local user data.

```
Mapping gains (per mapping):
- sendColors: boolean — default true.
- sendNames: boolean — default true.
- resendButtons: boolean — default false (the v1 automaticResendButtons workaround).
(enableTimecodeSend already exists per mapping — reused as the timecode flag.)

App Settings gains (global, one per installation):
- fixedPage: integer 1..9999, OPTIONAL — absent = follow the console's current page (default).
  Global, NOT per mapping, so two active mappings can't demand different pages.

Runtime config payload (transient, sent to the plugin, never persisted):
- executors: list of integers — the watch-set (union across active mappings; may include X-key
  ranges like 900+ if a mapping uses them).
- sendColors / sendNames / resendButtons / sendTimecode: booleans — OR-merged across active mappings.
- fixedPage: integer or 0 (0/absent = follow current page).

Merge rule (multiple active mappings): booleans OR together; executor sets union; fixedPage is the
single global value (not merged).

Transport: one GlobalVars string "pamConfig" set by the app over OSC (SetVar), consistent with the
existing pamCmdKey / pamPing / forceReload mechanism. The plugin parses it; no new OSC message type.
```

## Behaviors & Access

- **Watch-set from mapping (AC-1):** the app derives the executor list from the active mapping(s) and sends it; the plugin polls only those, not a fixed range.
- **Flags from app (AC-2):** merged per-mapping flags are sent; the plugin's feedback follows them. The console-side Settings dialog (PAM-13) stays as an offline fallback but the app's pushed config wins while connected.
- **Heartbeat re-sync (AC-3, AC-4):** the app re-sends `pamConfig` + sets `forceReload` on connect, on any mapping/settings change, and every ~30s; a stuck/reloaded plugin rebuilds its watch-set and flags from the next push — no manual restart.
- **Default before first sync (AC-5):** with no `pamConfig` yet, the plugin uses today's hardcoded ranges so it's never idle; once a real config arrives it uses that and does **not** clamp back to the default (EC-1).
- **Graceful version mismatch (AC-6):** an old plugin that doesn't read `pamConfig` keeps working on its defaults; a new plugin with an old app (no pushes) uses its default set. Rides the existing version handshake.
- **No flooding (AC-7):** the heartbeat sends only when the payload changed OR on the 30s tick (not every loop); guard against the PAM-12 BUG-4 log-flood by not logging unchanged re-sends.

**Access:** local; the config reflects the user's own active mappings + settings.

## Tech Decisions

- **GlobalVars transport, reuse forceReload:** the app already injects state via `SetVar(GlobalVars(), …)` and the plugin already has a `forceReload` resync path — extending that is lower-risk than inventing a new OSC message type.
- **Flags per mapping, OR-merged; fixedPage global:** matches the maintainer's decision (per-mapping, merged when several are active); fixedPage is inherently global (one console page) so it lives in App Settings to avoid two mappings disagreeing.
- **Watch-set derived from executor+display actions:** these are the only action types carrying an executor number that needs feedback; command actions are fire-and-forget and need no polling.
- **~30s heartbeat + on-change + on-connect:** cheap self-heal without spamming; exact interval tunable after the onPC cost check.

## Dependencies

- None new. Extends the engine (config build/send) and `pam-OSC.lua` (config parse). Depends on PAM-12's handshake for graceful degradation.

## Build Plan

```
Level 1 — Data:   T1  add sendColors/sendNames/resendButtons to mappingSchema (defaults) + fixedPage to settings · files: app/src/core/format/mapping.ts, app/src/core/settings/schema.ts · → AC-2
Level 2 — App:    T2  ConfigBuilder (watch-set + merged flags + fixedPage) + ConfigSender (connect/change/30s heartbeat, change-detection) · files: app/src/core/engine/* · → AC-1, AC-2, AC-3, AC-7
Level 3 — Plugin: T3  parse pamConfig → executorsToWatch + flags; default fallback; forceReload on new config; no-op/degrade for old app · files: pam-OSC.lua (+ regenerate XML, mini-bump) · → AC-4, AC-5, AC-6
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| -------- | --------- | ---------------------- | --------- | ---- |
| GlobalVars "pamConfig" + forceReload | Reuses proven app→plugin channel and resync path | New dedicated OSC message/address | Payload is a parsed string, not typed fields | 2026-07-19 |
| Per-mapping flags OR-merged; fixedPage global | Maintainer decision; fixedPage is a single console page | All flags global, or fixedPage per mapping | Merge logic needed; documented rule | 2026-07-19 |
| Watch-set from executor+display actions | Only these need feedback polling | Watch a fixed wide range | Command-action executors aren't polled (by design — no feedback) | 2026-07-19 |
| Default = today's hardcoded ranges | Never idle before first push; known-good | Idle until config arrives | A brief window watches more than needed | 2026-07-19 |

## Open Questions

- [ ] **onPC-pending — X-key / 900-range reachability:** confirm whether high executor numbers (X-keys, ~900) are returned by the `DataPool().Pages[page]:Children()` walk the plugin uses; if X-keys live in a different pool, the watch/poll path needs extending for them.
- [ ] **onPC-pending — heartbeat cost:** verify a 30s full-config re-send + forceReload doesn't cause a visible feedback hitch at 10 Hz; tune interval if needed.
- [ ] **Flag defaults (confirm):** sendColors=true, sendNames=true, resendButtons=false chosen to match typical v1 use — confirm these are the defaults you want for new mappings.
