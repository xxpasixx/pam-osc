# Review — PAM-27

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean; every MIDI address in the bundled device and mapping checked programmatically against the AC text, using the **latest delta** of each AC as the binding contract.
**Reviewer:** Review (AI)

### Acceptance Criteria

Verified against the 2026-08-01 deltas (the newest amendment wins per the repo's delta rule).

- [x] AC-1: the captured MC wire scheme matches the file exhaustively — `resources/devices/x-touch-compact-mc.json`, `mode: "mc"`:
  - faders: 9 pitchbend controls, channels 1–9, all `motorized: true` ✓
  - top encoders: CC 16–23, `increment {1,8}` / `decrement {65,72}` ✓, push notes 32–39 (on `capabilities.push`) ✓, LED rings CC 48–55 with value range `{32,43}` (on `capabilities.ledRing`) ✓
  - button rows: notes 8–15, 16–23, 24–31 ✓ · fader buttons 0–7 ✓ · main fader button 50 ✓ · Layer A/B 84/85 ✓ · side buttons 91, 92, 86, 95, 93, 94 ✓
- [x] AC-2: MC quirks modeled honestly — encoders 9–14 exist only as push buttons on notes 40–45 ✓; encoders 15/16 are `mode: "note-pair"` **encoders** (per the 2026-08-01 delta, not buttons): `knob-15` note 47 / `decrementNote` 46, `knob-16` note 49 / `decrementNote` 48 ✓. Notes 46/48 are **not** additionally registered as buttons, so turning back cannot re-fire ✓. Engine routes both notes to the same encoder entry (`input-router.ts:64-70`, dispatching to `handleNotePairEntry`). Schema enforces the pairing: `decrementNote` required for `note-pair`, rejected otherwise, and must differ from the control's own note (`device-definition.ts:142-153`, `:244-248`).
- [x] AC-3: mapping targets verified — `x-touch-compact-mc-playback-1`, 74 assignments, zero dangling ids: faders → 201–208 + 209 (`fader-position`) ✓ · encoder turns → 401–408 (`encoder-ring`) with a second `part: "push"` assignment → same executor = Go ✓ · rows 8–15 → 401–408, 16–23 → 301–308, 24–31 → 201–208 (all `on-off`) ✓ · fader buttons → 101–108 + main 109 (`on-off`) ✓
- [x] AC-4: follows the **latest** delta, not the superseded XKeys version — side pushes notes 40–45 → executors 291–296 ✓; note-pair encoders → executors 297/298 ✓ (both directions, since the note-pair decode emits ±1 rather than a press).
- [x] AC-5: Layer A (note 84) → `PAGE_DOWN`, Layer B (note 85) → `PAGE_UP` ✓ — the swapped direction from the 2026-07-27 delta.
- [x] AC-6: loads through bundled-content validation, no layout overlaps, inventory test lists the board and mapping ✓ (`bundled.test.ts`, green).
- [x] AC-7: side buttons per the 2026-08-01 delta — Highlight | Clear / Prev | Next / **Up | Down** ✓ (notes 91/92, 86/95, 93/94). Page keys correctly live on Layer A/B instead, per AC-5.

### Edge Cases

- [x] Note-pair double-fire: the note-off half of a detent press is ignored, so one physical detent = exactly ±1. Covered by "ignores the note-off half of a detent press (no double-fire)".
- [x] Note-pair encoders never emit a Key press — asserted directly by "never emits a Key press — the notes are motion, not buttons". This matters: a stray Key on executor 297/298 would fire a cue.
- [x] Accumulator clamp at 0 instead of going negative ("clamps at 0 instead of going negative").

### Code Review

- `handleNotePairEntry` is a clean addition: the dispatch in `handleMidiEvent` branches on `entry.control.type === "encoder"` before falling through to button handling, so a note-addressed encoder and a note button cannot be confused.
- The `note-pair` encoding mode is properly a *format* concept with schema-level cross-field validation, not an engine special case keyed off the board id — the right altitude.
- 9 unit tests for the decode path, including the three schema rejection cases. Good coverage for the trickiest logic in this batch.
- The `capabilities.push` / `capabilities.ledRing` modeling (rather than separate sibling controls) keeps one physical knob as one control — consistent with the PAM-30 rationale that one definition describes one hardware configuration.

### Security (red team)

- [x] All new schema surface (`encoding.mode`, `decrementNote`) is range-checked and strict; cross-field refinements prevent a half-configured note-pair encoder from reaching the engine.
- [x] Untrusted shared files: 1 MB import cap, `strictObject` throughout.
- [x] No auth/money/PII surface.

### E2E (critical journeys, optional)

- Status: **not run** as automated E2E — but this feature has the strongest real-world evidence in the batch: several ACs carry deltas explicitly written *after* hands-on use ("after hands-on feedback", "after hands-on testing", "after hands-on use"), and `x-touch-compact-mc-playback-1` is one of only two bundled mappings self-declared `tested`.

### Bugs

None.

### Verdict

- **ACs:** 7/7 passed · **Bugs:** 0 · **Security:** pass
- **Ship:** YES — the most thoroughly grounded feature in this batch: every address matches the contract literally, the note-pair decode is unit-tested including its failure paths, and the ACs were iterated against real hardware.
