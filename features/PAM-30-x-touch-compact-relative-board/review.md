# Review — PAM-30

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean; both board files and all three Compact mappings checked programmatically against the AC text, using the latest delta of each AC.
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: `x-touch-compact-relative` models side knobs 9–16 as full push-encoders — all 8 present as `type: "encoder"` on CC 18–25, scheme `increment {1,7}` / `decrement {121,127}`, integrated push notes 8–15 on `capabilities.push` ✓ (every number matches the AC).
- [x] AC-2: the standard board lost its twins — zero controls matching `^knob-\d+-rel$` remain in `x-touch-compact.json` ✓; the eight standalone `knob-N-push` buttons survive on notes 8–15 ✓. `x-touch-compact-default-1` resolves every `controlId` against the board with zero dangling references, so existing mappings keep working ✓.
- [x] AC-3: `x-touch-compact-relative-1` retargeted — `deviceDefinitionId: "x-touch-compact-relative"` ✓, zero remaining `-rel` control references ✓, zero dangling `controlId`s ✓.
- [x] AC-4: setup instructions for the X-TOUCH-Editor path — present (550 chars) and it does name the repo preset `xTouchCompactRltv1LayerA.bin` ✓, as the AC requires.
- [x] AC-5: v1 import converts against the new board — `converter.test.ts:37` maps `xTouchCompactRltv1.json` → `x-touch-compact-relative`, and the suite is green ✓.
- [x] AC-6: Layer B is fully relative on the relative board — `knob-1-b`…`knob-16-b` all present (16/16) as `type: "encoder"` on CC 37–52 with the relative2 scheme `{1,7}` / `{121,127}` ✓, matching the 2026-08-01 delta. **Caveat the spec itself raises:** the CC 37–52 layer offsets are chart-derived and marked "to verify on hardware" — that verification is still open (BUG-2).
- [~] AC-7: **superseded in two of the three mappings.** `x-touch-compact-default-1` matches the AC exactly (Highlight | Clear / Prev | Next / Page Down | Page Up ✓). `x-touch-compact-relative-1` instead carries Fine ÷2 | Rough ×2 in row 2 per **PAM-31 AC-5**, and the MC mapping carries Up | Down in row 3 per **PAM-27 AC-7** — both later, deliberate decisions. The files are right; this AC's text is stale. See BUG-1.
- [x] AC-8: `resendFeedback` — `x-touch-compact: true` ✓, `x-touch-compact-relative: true` ✓, `x-touch-compact-mc: false` ✓ (host-controlled LEDs need no replay), exactly as the AC specifies.

### Edge Cases

- [x] Control-id stability: the AC-2 promise that `default-1` keeps working is the real regression risk of this split, and it holds — verified by resolving every assignment id against the board rather than trusting the file to be consistent.
- [x] The `knob-N-abs` ids were deliberately **not** renamed (spec Out of Scope) — confirmed still present, so third-party mappings built on the standard board are unaffected.

### Code Review

- The split follows the stated principle (one definition = one hardware configuration) and removes a documented PAM-1 wart rather than working around it. The precedent boards (`x32-compact-cc`, `x-touch-compact-mc`) make this consistent rather than ad-hoc.
- No engine change was needed — this is data plus an import retarget, which is the right outcome for a configuration split.
- The converter fixture update (AC-5) is the piece most likely to have been forgotten in a data-only change; it is there.

### Security (red team)

- [x] Data-only feature; all values flow through the existing range-checked, `strictObject` schemas.
- [x] `setupInstructions` renders as escaped text (see PAM-28 review — no `innerHTML` anywhere in the renderer).
- [x] No auth/money/PII surface.

### E2E (critical journeys, optional)

- Status: **not run** — needs the physical unit reconfigured via the X-TOUCH Editor.

### Bugs

**BUG-1: AC-7 is stale — superseded by PAM-31 AC-5 and PAM-27 AC-7 with no delta recording it**

- **Severity:** Low (documentation / traceability; the files are correct)
- **Steps to reproduce:** Read AC-7's "all three Compact mappings … Prev | Next", then inspect `x-touch-compact-relative-1.json` (Fine ÷2 | Rough ×2) and `x-touch-compact-mc-playback-1.json` (Up | Down).
- **Expected:** a superseded AC carries a delta pointing at its replacement, per the repo's delta rule (never rewrite, never renumber — append).
- **Actual:** AC-7 still claims all three. Fix: append a delta narrowing AC-7 to `default-1` and naming PAM-31 AC-5 / PAM-27 AC-7 as the successors. No code change.

**BUG-2: AC-6's Layer-B CC range is chart-derived and unverified on hardware**

- **Severity:** Medium (blocks Live for this board, not the code)
- **Steps to reproduce:** Connect an X-Touch Compact configured for relative mode, switch to Layer B, turn `knob-1-b`…`knob-16-b`.
- **Expected:** CC 37–52 with the relative2 scheme, as declared.
- **Actual:** unknown — the spec's own AC-6 text marks the offsets "**to verify on hardware**". If the real offsets differ, all 16 Layer-B encoders are silently dead. `x-touch-compact-relative-1` is correctly still `community`, not `tested`.

### Verdict

- **ACs:** 7/8 passed, 1 stale-but-superseded (AC-7) · **Bugs:** 2 (0 C / 0 H / 1 M / 1 L) · **Security:** pass
- **Ship:** NO — not because of a code defect (the data is internally consistent and the import retarget is tested), but because AC-6's Layer-B wire scheme is explicitly unverified and would fail silently. Confirm Layer B on the real unit, append the AC-7 delta, then this is Approved.
