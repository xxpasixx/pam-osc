# Review — PAM-26

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean; every address in the bundled files checked programmatically against the AC text. No X32 connected during this review (wire scheme was hardware-captured 2026-07-26 per the spec).
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: bundled files match the AC number for number — verified programmatically against `resources/devices/x32-compact-cc.json`:
  - 17 faders, CC `0,1,…,7` + `70` + `72,…,79`, all channel 1, all `motorized: true` ✓
  - 17 buttons, all `kind: "cc"`, channel 2, on **exactly the same** controller numbers as the faders ✓ (the AC's "same numbers" claim holds literally)
  - no encoders, no displays, no further rows ✓
  - `x32-compact-cc-default-1`: 17 fader→executor with `fader-position`, 17 button→executor with `on-off`, zero dangling `controlId`s ✓
- [x] AC-2: CC buttons behave exactly like note buttons — **by construction, not by parallel implementation**: `handleCcEntry` detects `control.type === "button"` and delegates straight into `handleNoteEntry` (`input-router.ts:79-84`). Every semantic the AC lists (executor Key, `minValue` threshold, CMD-mode interception, press-only actions) is therefore literally the same code, and cannot drift. This is the right shape for the requirement. Test: "routes press and release to the executor Key like a note button".
- [x] AC-3: CC feedback on the control's own channel+number, note wire shape untouched — `sendButtonFeedback` (`feedback-out.ts:24-46`) branches on `midi.kind === "cc"` and returns early; the note branch below is unchanged and additionally guarded by `kind !== "note"`. Both `on-off` and `always-on` resolve through the shared `buttonFeedbackValue`, so CC buttons inherit both feedback types. Test: "mirrors the executor state on the button's own CC".
- [x] AC-4: bundled-content tests cover the new files and the inventory test names X32 Compact (CC remote) — `bundled.test.ts` inventory assertion, green.

### Edge Cases

- [x] Release semantics: the X32 sends value 0 on release; `handleNoteEntry`'s press-only guards (`value <= 0`) treat that identically to a note-off. No double-fire.
- [x] The spec's Out-of-Scope channel-2 state broadcasts (CC 40–43 / 60–63 / 80–85) are simply unmapped, and `handleMidiEvent` ignores unmapped events (`input-router.ts:52`, EC-1). No spurious routing.

### Code Review

- The delegation approach is the standout: three lines instead of a mirrored CC-button implementation, which is exactly why AC-2 can be asserted with confidence.
- Encoder decode below the button branch is unaffected (`input-router.ts:96-107`) — the PAM-20 `signed` and default `range` paths keep their guards.
- No dead code, no leftover probe scripts in the app tree.

### Security (red team)

- [x] Device/mapping files are community-shared → untrusted; all new fields go through `strictObject` schemas (21 uses in `device-definition.ts`, 18 in `mapping.ts`), so unknown keys are rejected.
- [x] Controller/channel values range-checked via `midiValueSchema` / `midiChannelSchema`.
- [x] Import paths capped at 1 MB.
- [x] No auth/money/PII surface; nothing sensitive logged.

### E2E (critical journeys, optional)

- Status: **not run.** Per the spec's own Verification section, wire scheme / motor-fader RX / mute-LED RX are hardware-verified, but **end-to-end (app → MA3 executor) is still pending**. That is a hardware step, not an automatable one.

### Bugs

None found in the code.

### Verdict

- **ACs:** 4/4 passed · **Bugs:** 0 · **Security:** pass
- **Ship:** YES, with one honest caveat — the code and the bundled data are correct and fully covered. The spec's own outstanding item (end-to-end app → MA3 executor against the real console) is unverified; the mapping is correctly still `community` rather than `tested`, so nothing overclaims to users.
