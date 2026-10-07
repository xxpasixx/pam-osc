# Review — PAM-31

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean; the modifier state machine traced by hand through every transition; bundled mapping checked programmatically.
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: optional `factor`, absent = 10 — `mapping.ts:25` (`z.number().positive().max(1000).optional()`); the default is applied at both read sites (`input-router.ts:273`, `feedback-out.ts:74`) as `?? 10`, so existing mappings behave exactly as before. No `formatVersion` change. Probed the bounds: `0` and negatives rejected by `.positive()`, `1001` by `.max(1000)`, `NaN` by `z.number()`. Non-integer factors (e.g. `2.5`) are accepted — the AC only requires positive and ≤ 1000, so this is in-contract, and the division/multiplication is float arithmetic anyway.
- [x] AC-2: the **active** factor is applied — `input-router.ts:162-163`: `change / state.encoderFineFactor` then `change * state.encoderRoughFactor`, each gated on its own flag. The factor is stored on the state when a modifier button activates, not read from the encoder, which is what makes "the button that activated it" authoritative.
- [x] AC-3: switch-vs-toggle logic correct — `handleModifier` (`input-router.ts:277-293`). Traced all four transitions per modifier: off + any factor → on with that factor; on + **different** factor → factor swapped, stays on; on + **same** factor → toggles off; off again + factor → on. Matches the AC exactly.
- [x] AC-4: LED shows the active resolution — `feedback-out.ts:74-78` lights an entry only when `state.encoderFine && state.encoderFineFactor === factor` (and the rough equivalent), so exactly one factor button per modifier is lit and all others go dark. Refresh covers **all** units: `sendModifierLeds(context.allUnits(), state)` is called on every toggle branch. Test: "modifier factor (PAM-31): /2 button, switching to /10 keeps fine on, same button toggles off".
- [x] AC-5: `x-touch-compact-relative-1` Layer-A side buttons match the latest delta — Highlight | Clear (notes 49/50), `modifier encoderFine factor=2` | `modifier encoderRough factor=2` (51/52), `PAGE_DOWN` | `PAGE_UP` (53/54) ✓. **Note:** this deliberately contradicts PAM-30 AC-7 — see BUG-1.

### Edge Cases

- [x] Press-only: `handleModifier` is reached only after `if (value <= 0) return; // toggles must not double-fire on release` (`input-router.ts:244`). Checked specifically because PAM-24 switches the APC40 to *momentary* buttons, which start sending note-off — modifiers are immune.
- [x] Cross-unit: a factor button on unit A and another on unit B share one `RuntimeState`, and the LED refresh iterates all units, so the two boards stay consistent rather than each showing its own idea of the active factor.
- [x] Fine **and** rough both on: both apply (`/fineFactor` then `*roughFactor`). Pre-existing v1 semantics, unchanged by this feature and not something the AC constrains.
- [x] Toggling off also writes the pressing button's factor into state; harmless because every LED and arithmetic read is gated on the boolean flag first.

### Code Review

- The state machine is small and reads exactly like the AC — the comment at `input-router.ts:275-276` states the rule, and the code below is a direct transcription. Easy to keep honest.
- Storing the active factor in `RuntimeState` (`state.ts:19-21`) rather than deriving it from the pressed control is the right call: it survives the LED refresh across units and keeps `feedback-out` a pure function of state.
- `factor` is read via a narrowing check on `action.type === "modifier"` before access (`input-router.ts:273`), with a `10` fallback for the impossible branch — slightly defensive but type-honest.
- No editor UI for `factor`, as the spec's Out of Scope allows (hand-edited / bundled only).

### Security (red team)

- [x] `factor` bounded at load (positive, ≤ 1000), so a shared mapping cannot produce an absurd multiplier; the arithmetic is a local float, never a command string.
- [x] Attribute commands still go through the existing v1 command formatting; this feature changes only the numeric change value.
- [x] No auth/money/PII surface.

### E2E (critical journeys, optional)

- Status: **not run** — the observable behaviour (LED shows active resolution, encoder steps get finer) needs the physical X-Touch Compact in relative mode.

### Bugs

**BUG-1: PAM-30 AC-7 and PAM-31 AC-5 contradict each other, with no delta reconciling them**

- **Severity:** Low (documentation / traceability — no behavioural defect)
- **Steps to reproduce:** Read PAM-30 AC-7 ("the side-button block is re-assigned in **all three** Compact mappings … Highlight | Clear / **Prev | Next** / Page Down | Page Up"), then PAM-31 AC-5 (relative-1 row 2 = Fine ÷2 | Rough ×2), then inspect `resources/mappings/x-touch-compact-relative-1.json`.
- **Expected:** one contract per behaviour; a superseded AC carries a delta pointing at its replacement.
- **Actual:** the file follows PAM-31 AC-5 (correct — it is the later, deliberate decision), so PAM-30 AC-7 is now false as written for `relative-1`. PAM-27 AC-7's "Up | Down" delta likewise supersedes PAM-30 AC-7 for the MC mapping. PAM-30 AC-7 holds only for `default-1`. Fix by appending a delta to PAM-30 AC-7 noting it is narrowed to `default-1`; no code change.

### Verdict

- **ACs:** 5/5 passed · **Bugs:** 1 (0 C / 0 H / 0 M / 1 L) · **Security:** pass
- **Ship:** YES — the state machine is correct on every transition I could construct, LED feedback matches, and the bundled mapping follows the current contract. BUG-1 is a spec-hygiene fix in PAM-30's document, not a defect here.
