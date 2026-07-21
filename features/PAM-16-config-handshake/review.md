# PAM-16 — Review (app-side, L1+L2)

**Date:** 2026-07-19 · **Commit:** 92e9b1c · **Verdict: app-side clean; feature stays Building** (L3 plugin parser + end-to-end deferred to onPC)

Regression baseline: typecheck clean, full suite **343 passing** (incl. 12 new ConfigBuilder/ConfigSender tests).

## AC verification

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 watch-set = union of executor+display action.number | **PASS (app-side)** | `config-handshake.ts:75-82` collect+dedupe+sort; plugin actually watching only those = L3 (onPC) |
| AC-2 flags OR-merged + sent | **PASS (app-side)** | OR-merge `:71-74`, serialized + sent; plugin honouring them = L3 |
| AC-3 heartbeat ~30s + on-connect + on-change | **PASS** | `DEFAULT_TIMING.configHeartbeatMs=30000`; connect push; change via engine reload |
| AC-4 self-heal end-to-end | **App-side verified; e2e pending onPC** | heartbeat re-sends config+forceReload; plugin rebuild = L3. Not a failure |
| AC-5 default before first sync | **Plugin-only → pending onPC** | nothing app-side to verify |
| AC-6 graceful with old plugin | **PASS (app-side)** | additive `SetVar(GlobalVars,…)` on the existing `/cmd` channel; sending can't throw |
| AC-7 no flood (change-detection) | **PASS** | compares the serialized payload string (`:152`), not identity; heartbeat log silenced when unchanged; test proves 3 ticks → 4 sends, 1 log |

## Security red-team — Lua injection: DISPROVEN

Sink: `config-handshake.ts:112` `Lua 'SetVar(GlobalVars(), "pamConfig", "${payload}")'`. Every field traced: executors come only from zod-validated mappings (`number: int 1..9999`, `mapping.ts:12,38`) → digits+commas only; flags → `0`/`1`; `fixedPage` validated int 1..9999 and re-guarded (`:87`). Payload always matches `^v=\d+;e=[\d,]*;c=[01];n=[01];r=[01];t=[01];p=\d+$` — no quote/backslash/`;`-in-value/space can be produced, the nested Lua string stays balanced. **A crafted malicious mapping cannot break out on current code.**

## Findings

- **F1 — Low (defense-in-depth):** the injection sink does zero escaping/assertion — safety is 100% upstream-coupled to the mapping schema. If the schema is ever loosened (new number-carrying action type, `.int()` dropped, string executor), the quote-free invariant breaks silently. **Recommend a hard local guard** at the sink (throw/skip if the final payload fails the safe-charset regex, or `Number.isInteger` per executor in `serializePamConfig`). Guarded-zone code — worth adding before this feature is "fully hardened", though not a current vulnerability. `config-handshake.ts:92,112`.
- **F2 — Low (robustness/onPC):** no cap on watch-set / payload length (dedupe caps at 9999 distinct → ~50 KB worst case). A large multi-mapping set could exceed MA3 `GlobalVars`/UDP limits and fail silently. Add an explicit cap or an onPC size check.
- Lifecycle clean: `startHeartbeat` is idempotent, `stopHeartbeat` clears+nulls the timer, `engine.stop()` disposes it → no timer leak. The 30s self-heal re-send is deliberate (AC-3/AC-4), not a flood; the only open risk (a feedback hitch at 10 Hz) is already noted as a one-line flip pending the onPC cost check.

## Verdict
All app-verifiable ACs PASS; AC-4/AC-5 + plugin consumption correctly bounded to the onPC session (L3). Lua injection disproven. Two Low hardening notes (F1 sink guard, F2 length cap). Feature **not complete** (L3 pending), stays **Building**; app-side is review-clean.

## Update 2026-07-19 — F2 resolved (app-side)

The watch-set is now capped at `MAX_WATCH_SET` (256) in `buildPamConfig` and the engine logs the cap once at start (`engine.ts` start) — no more silent drop, payload bounded <1.5 KB. Spec delta EC-4. Tests: `config-handshake.test.ts` → "watch-set cap (PAM-16 F2)". Still Building (L3 plugin parser + e2e onPC-pending).

## Update 2026-07-21 — L3 pamConfig parser built (off-console)

The deferred plugin parser is now implemented in `pam-OSC.lua`: `parsePamConfig` reads the combined `pamConfig` string, `applyWatchSet` swaps the executor watch-set (replacing the old hardcoded 101-122/201-222/301-322/401-422/191-198/291-298 range), and `loadConfig` applies it + the feature flags at start and on every `forceReload` (AC-3/AC-4). Falls back to the built-in range + legacy vars when no config is present (AC-5/AC-6).

An OSC probe against onPC confirmed the gap this closes: the old plugin only fed back the hardcoded range, missing the APC40 mapping executors 323-348 / 231-254, and sent no colours. Off-console Lua test `pam-OSC.config.test.lua` (15 checks) covers the parser; a Vitest wrapper (`app/src/pam-osc-lua.test.ts`) runs it in `npm test` when `lua` is present. Plugin bumped to 2.0.0.2.

**Still Building:** live onPC e2e (re-import the plugin, send pamConfig, confirm the watch-set + colours follow the mapping over OSC) — doable without the APC40 board.

## Update 2026-07-21 — onPC VERIFIED ✅ → Approved

Live OSC probe against the running onPC (new plugin v2.0.0.2, app stopped): pushed `pamConfig="v=1;e=501,502,503;c=1;n=1;r=0;t=0;p=0"` + forceReload and observed the feedback stream:
- Button feedback for **501/502/503** appeared → watch-set applied from `pamConfig` (AC-1);
- the old hardcoded range (101/201/301/401) **disappeared** → replaced, not appended;
- **`/Color`** messages arrived → the `sendColors` flag is applied (unblocks PAM-10 colours).

Both halves of the loop are now proven: app-side serialize (config-handshake.test.ts) + plugin-side parse (this probe + off-console Lua test). Verified with a synthetic watch-set via OSC (exact serialize format); the app-drives-it path is the same wire string. Feature moved Building → **Approved**.
