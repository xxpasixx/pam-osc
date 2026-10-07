# Review — PAM-24

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, 42 files, all green) + `tsc --noEmit` clean; static verification of the bundled APC40 mkII device file. **No APC40 mkII connected during this review.**
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: init SysEx sent once on bind as `{kind:"sysex"}` — `device-manager.ts:117-128`; covered by `device-manager.test.ts` ("sends initSysEx as the first output on bind").
- [x] AC-2: init precedes all other output — sent inside `tryBind` immediately after `transport.open`, and `callbacks.onBind` (startup animation / `restoreUnit`) only fires afterwards at `device-manager.ts:149`. Traced every write path to a freshly bound port: no ordering hole. Deliberately **not** cached (`connection.send` direct, not `sendToUnit`), so the PAM-25 cache replay can never re-order it.
- [x] AC-3: re-sent on every rebind — the hot-plug poll clears `connection` on disappearance (`device-manager.ts:162-166`) and re-enters `tryBind` on return (`:167-170`); both bind flavours (initial + poll) go through the same path. Test: "re-sends initSysEx after a disconnect/reconnect".
- [x] AC-4: bytes verified literally — `F0 47 7F 29 60 00 04 41 01 01 01 F7`, exact match with the AC (`resources/devices/apc-40-mk2.json`). Identifier `0x41` = Ableton Live Mode.
- [x] AC-5: field optional — `initSysEx: sysexFrameSchema.optional()` (`device-definition.ts:209`); no `formatVersion` change anywhere in the diff. Test: "sends nothing on bind when the device declares no initSysEx".
- [x] AC-6: validated at load — `sysexFrameSchema` (`device-definition.ts:34-50`) enforces first byte `0xF0`, last `0xF7`, inner bytes ≤ 127, length 2–64. Probed for escapes: array element type is `int().min(0).max(255)`, so a non-integer / out-of-range byte is rejected before the refine runs. Malformed files load as invalid; no runtime path.
- [x] AC-8(a): ring-type `initCC` sent right after the SysEx — `device-manager.ts:132-147`; the APC40 file declares exactly 16 entries on controllers `0x18`–`0x1F` + `0x38`–`0x3F`, all value `2` (Volume style), matching the AC number for number.
- [x] AC-8(b): live value on the knob's own controller — all 16 knobs sit on `0x10`–`0x17` / `0x30`–`0x37`, `type: fader`, `motorized: true` (the loader gates `fader-position` feedback on `motorized`, per the design's decision log).
- [ ] AC-7: **UNVERIFIABLE without hardware.** The AC requires the Mode-1 addressing correction to be "verified on real hardware before this feature is marked Live". Not done — see BUG-1.

### Edge Cases

- [x] EC-1: output-less unit — `connection.send` no-ops on an input-only connection; the log line explicitly appends "board has no bound output, init NOT delivered". No error surfaced, as specified.
- [x] EC-2: two units of the same board type — init runs per `UnitRuntime` inside `tryBind`, not once globally. Test: "sends its own init per unit for two units of the same board type (EC-2)".

### Code Review

- Clean. The "direct send, not cached" decision is correct and commented with its reason (`device-manager.ts:112-116`) — it is exactly what keeps AC-2 true under the PAM-25 replay.
- `try/catch` around both init sends swallows a mid-bind yank and leaves recovery to the hot-plug poll — consistent with `sendToUnit`'s existing behaviour.
- Minor: `defaultCacheKey` maps every `sysex` message to the constant key `"sysex"` (`device-manager.ts:34-35`). Harmless today (init bypasses the cache, nothing else sends SysEx), but a second cached SysEx sender would silently overwrite. Not a defect; noted for whoever adds one.

### Security (red team)

Not an auth/money/PII feature — no accounts, no network ingress, all data local. Relevant surface: device files are shared between users via PAM-7, so `initSysEx` is untrusted input that reaches hardware.

- [x] SysEx length capped at 64 bytes and inner bytes forced 7-bit → a shared file cannot push an oversized or malformed frame at a board.
- [x] `initCC` capped at 64 entries, controller/value range-checked, `strictObject` rejects unknown keys.
- [x] Import paths size-capped at 1 MB (`share.ts:11`, enforced `share-files.ts:17`, `index.ts:481`).
- [x] No secrets in source; nothing sensitive logged.
- The remaining hardware risk is not a security issue but a physical one: a hostile device file can send *some* valid 64-byte SysEx to a board. Bounded, board-specific, and unavoidable for a feature whose purpose is sending init blobs.

### E2E (critical journeys, optional)

- Status: **not run** — the critical journey here is physical (board switches to Mode 1) and cannot be automated without the device.

### Bugs

**BUG-1: AC-7 hardware verification outstanding**

- **Severity:** Medium (blocks Live, not the code)
- **Steps to reproduce:** Connect an APC40 mkII, start the engine, then exercise the Activator / Solo / Rec-Arm buttons and the Track-Select buttons.
- **Expected:** Mode 1 — all buttons momentary, no knob re-banking, host-controlled LEDs, encoder rings following mapped values.
- **Actual:** unknown. The spec's own AC-7 requires this check before Live; the whole feature exists to fix the "activate shifts everything" bug, and that fix is unconfirmed. The bundled `apc-40-mk2-default-1` mapping is still `community`, correctly reflecting that.

### Verdict

- **ACs:** 8/9 passed (AC-1…AC-6, AC-8 a+b), 1 unverifiable without hardware · **EC:** 2/2 · **Bugs:** 1 (0 C / 0 H / 1 M / 0 L) · **Security:** pass
- **Ship:** NO — code is correct and well-tested, but AC-7 is an explicit hardware gate the spec itself sets before Live. Everything except AC-7 is done; connect the APC40 mkII, confirm Mode-1 behaviour and the LED rings, then this is Approved.
