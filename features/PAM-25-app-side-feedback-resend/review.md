# Review — PAM-25

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean; static verification of the handshake payload and editor UI.
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: optional `resendFeedback`, default `false` — `device-definition.ts:216` (`z.boolean().default(false)`); device-level checkbox in the board editor at `BoardInspector.tsx:187-188`; new boards created with the field at `EditorView.tsx:245`. No `formatVersion` change in the diff. Test: "device resendFeedback is optional, defaults to false, accepts true (AC-1)".
- [x] AC-2: periodic cache replay, cache values only — `engine.ts:185-190` iterates `deviceManager.bound()` (so unbound units get nothing) and gates on `unit.device.resendFeedback` (so flagless boards get nothing); `replayCache` (`feedback-out.ts:219-227`) sends `cache.values()` verbatim — it has no way to compute or invent a value. Also gated on `animationDone`, so it cannot fight the startup animation (whose frames bypass the cache by design). Tests: "replays the cache periodically for a device with resendFeedback" / "sends nothing extra for a device without the flag".
- [x] AC-3: `r=0` always — `resendButtons: false` is a literal at the single payload-construction site (`config-handshake.ts:98-101`), downstream of the multi-mapping merge, so no combination of active mappings can set it. Field order in `serializePamConfig` (`:110-118`) unchanged: `v;e;c;n;r;t;p` — wire-compatible with the plugin's fixed-position v1 parser. Test: "pins resendButtons to 0 even when a mapping still sets it (PAM-25 AC-3/AC-4)".
- [x] AC-4: legacy field accepted, inert, absent from the editor — `mapping.ts:107` still accepts `resendButtons` (documented deprecated at `:105-106`); the mapping editor omits it with an explicit comment at `EditorView.tsx:1042`. Test: "mapping resendButtons stays accepted for older files (AC-4, deprecated)".

### Edge Cases

- Open question from the spec ("resend interval: default ~2 s") is **resolved**: `feedbackResendMs: 2000` (`types.ts:49`), against v1's console-side ~1.5 s. Reasonable and slightly gentler than v1.
- [x] Timer lifecycle: created in `start` (`engine.ts:185`), cleared and nulled on shutdown (`engine.ts:393-394`). No leak. Checked specifically because a stray `setInterval` holding `UnitRuntime` references would survive a restart.

### Code Review

- Clean, and the architecture argument in the spec holds up in the code: the app already owned the feedback cache, so this removes a second source of truth rather than adding a mechanism.
- `replayCache` returns (rather than continues) on a send throw — one yanked device aborts that unit's remaining replay, picked up on the next tick. Correct choice; a throwing connection means the port is gone.
- The plugin's dormant `automaticResendButtons` tick is untouched, as the spec's Out of Scope requires. Confirmed no `.lua` file and no `build-plugin-xml.mjs` change in the diff → correctly **no plugin version bump**.

### Security (red team)

- [x] No auth/money/PII surface. `resendFeedback` is a bool — nothing to inject.
- [x] The change strictly *reduces* what the app tells the console (`r` pinned off).
- [x] Payload values remain digits/`0`/`1`/commas only, so the string still embeds safely in the Lua literal (the escaping rationale documented at `config-handshake.ts:33-36` is unaffected by this change).

### E2E (critical journeys, optional)

- Status: **not run** — the observable effect is an LED staying lit on a board that clears it locally; needs the physical board (X-Touch Compact, which now ships `resendFeedback: true` via PAM-30 AC-8).

### Bugs

None.

### Verdict

- **ACs:** 4/4 passed · **Bugs:** 0 · **Security:** pass
- **Ship:** YES — fully implemented, tested at every AC, wire-compatible, timer cleanly managed. The one behavioural claim not machine-checked (LEDs actually stop going stale) is inherently hardware-observable, and the mechanism it depends on is verified.
