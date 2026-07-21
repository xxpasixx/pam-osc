# PAM-20 — Review

**Verdict:** Approved (no Critical/High). Ship gate: on-hardware verification of
the turn direction with a real APC40 mkII still pending (release rule).

## AC verification

| AC | Result | Evidence |
| -- | ------ | -------- |
| AC-1 additive mode, range files unchanged | ✅ | `encoding.mode` defaults to `"range"`; full suite incl. all X-Touch relative-encoder tests green (363/363). Schema `superRefine` only requires increment/decrement in range mode. |
| AC-2 signed decode | ✅ | `signed-encoder.test.ts` → `signedDetents`: 0→undefined, 1→1, 63→63, 64→−64, 127→−1, 128/−1→undefined. |
| AC-3 correct direction + magnitude through an executor | ✅ | `signed-encoder.test.ts` routing: turn(5)→Fader211=5, turn(127)→4 (−1), turn(64)→0 (−64 clamped); value 0 ignored. |
| AC-4 Cue Level + Tempo on the board, Cue→211 | ✅ | `apc-40-mk2.json` cue-level (CC 0x2F) + tempo-knob (CC 0x0D) are `encoder mode:"signed"`; mapping binds cue-level→executor 211; bundled load test green (0 issues). |

## Code review

- Decode branch in `input-router` guards the range path (`increment && decrement`)
  even though the schema guarantees them — defensive, cannot NPE.
- `signedDetents` labelled as new behaviour (not v1 parity), beside the v1
  `relativeDetents` it complements.
- No change to accumulator / `MA3_KNOB_THRESHOLD` / amount paths → executors
  >300 still also emit `/Encoder`, unchanged.

## Notes / parked

- Direction convention (which way the Cue knob raises the value) is the one thing
  only the hardware can confirm — flagged for Pascal's check.
