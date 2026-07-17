# Review — PAM-1

**Reviewed:** 2026-07-17
**Where tested:** local (macOS), Vitest suite + standalone verification scripts; no MA3/hardware surface exists yet for this feature (pure data layer)
**Reviewer:** Review (AI) — two independent reviewer agents (AC/code lane, red-team/fidelity lane) + merging owner

### Acceptance Criteria

- [x] AC-1: five bundled board types with controls, MIDI address, 2D position — pass (six definitions: apc-mini mk1 + mk2, sanctioned; 0 controls outside layout bounds; displays carry `index` per documented design deviation)
- [x] AC-2: mapping = device reference + one port binding + actions + predefined feedback, no executable code — pass (every schema object is strict; `buttonFeedbackMapper`-style fields rejected; no `any`/`passthrough`/code path exists)
- [x] AC-3: complete v1 feature set expressible, proven by the 10 bundled mappings — pass (independent diff resolved all **973 assignments** through the devices to MIDI addresses against v1: **0 real mismatches**; all 8 action types and all 5 feedback types in use; 5 sanctioned deltas confirmed, each documented in `notes`)
- [x] AC-4: invalid file → clear error with file + location + problem, loading continues; newer formatVersion rejected — pass (broken JSON, schema violations, unknown keys, future versions all verified; app-side "keeps running" is loader-level here — UI surfacing is PAM-3/4)
- [x] AC-5: two units of one board type run side by side via two mappings with different ports — pass (capability tested; bundled pairs are layout variants, not a two-unit example)
- [x] AC-6: hand-edited user files load exactly like bundled ones; format documented — pass (shadowing with info notice tested; both `docs/file-format.md` examples parse against the real schemas; doc is field-accurate with minor gaps → BUG-6)

### Code Review

- Correct against design (including the three documented deviations: display `index`, `ledRing.controller`, minimal scaffold). No dead code, no over-engineering, exhaustive feedback-compatibility switch. Error-message quality good (path like `controls[1].midi.number`).
- Performance probed: 100k controls in ~300 ms, 50k duplicate ids in ~212 ms, 5 MB strings in ~13 ms — no quadratic behavior.
- Test gaps found in review were closed as part of the review pass (AC-3 inventory now asserts `attribute` + `encoder-ring`; loader compatibility branches pinned: encoder-ring without ring, LED feedback on LED-less button, display action mismatches both ways). Suite: **40/40 green**, typecheck clean.

### Security (red team)

- [x] No prototype pollution (`__proto__`/`constructor` payloads inert — see BUG-2 for a consistency nit)
- [x] No path traversal via ids (kebab regex; ids never used as paths — files come from `readdir`)
- [x] No crash/DoS: huge files, `/dev/zero` symlink, top-level non-object JSON, absurd sizes — all "report and continue"
- [x] No secrets in source; no network, no credentials, no PII (local files only)
- [ ] BUG-1 (shadowing footgun), BUG-4 (symlink content echo) — see below

### Regression

- v1 untouched on this branch (`git diff main..v2` contains no `*.js`/`*.lua`/`mappings/` changes); v1 module still parses. No Live features in INDEX yet.

### E2E (critical journeys)

- Status: **not applicable yet** — no UI/runtime surface. The loader-level journeys (load bundled inventory, reject invalid file, shadowing) are locked in as integration tests (`bundled.test.ts`, `loader.test.ts`). Revisit E2E at PAM-3 (first real UI).

### Bugs

**BUG-1: A user file shadowing a bundled device can silently knock out bundled mappings**

- **Severity:** Medium
- **Steps to reproduce:** 1. Put a `x-touch.json` with different/missing control ids into the user devices folder. 2. Load. → All bundled x-touch mappings are skipped (each with an error issue), only an `info` notice marks the shadowing.
- **Expected / Actual:** Expected a conscious decision: either validate bundled mappings against bundled devices, fall back to the shadowed valid entry, or warn explicitly ("your override broke N mappings"). Actual: mappings vanish with per-mapping errors only. Same family: a broken user _mapping_ override deletes the working bundled one (reproduced).

**BUG-2: `__proto__` key is silently dropped instead of rejected**

- **Severity:** Low
- **Steps to reproduce:** device JSON with a top-level `"__proto__": {...}` → loads with 0 issues; a `"constructor"` key errors.
- **Expected / Actual:** strict schemas reject unknown keys — except exactly `__proto__` (inert, no pollution, but inconsistent for hand-editors).

**BUG-3: Non-integer `formatVersion` gets the misleading "newer pam-osc" message**

- **Severity:** Low
- **Steps to reproduce:** `formatVersion: 1.5` → "made with a newer pam-osc — please update".
- **Expected / Actual:** should say "invalid format version"; the newer-check runs before schema validation and only compares `> CURRENT`.

**BUG-4: Symlinks are followed and parse errors echo the first bytes of the target**

- **Severity:** Low
- **Steps to reproduce:** symlink `leak.json` → a non-JSON secret file in the user folder → issue message contains the first ~10 characters of the target.
- **Expected / Actual:** consider not following symlinks in scanned folders (the snippet-in-error itself is useful for AC-6 hand-editing).

**BUG-5: Loader accepts feedback that can never fire when `midiPort.output` is missing**

- **Severity:** Low
- **Steps to reproduce:** user mapping with `on-off` feedback but no `output` port → loads with 0 issues.
- **Expected / Actual:** expected a warning; the invariant is asserted for bundled content only (`bundled.test.ts`). May resolve itself if PAM-3 makes ports UI-picked.

**BUG-6: Doc gaps in `docs/file-format.md`**

- **Severity:** Low
- **Detail:** `enableTimecodeSend` appears only in the example without explanation; mc-mode-only nature of timecode features unstated; unknown-key errors carry an empty `path` (field named in the message only). Also `options.minValue`/`amount` are schema-legal on any control type (design scopes them narrower) — harmless data, PAM-2 will ignore where meaningless.

**BUG-7: Same-CC twin controls (`knob-N-abs`/`knob-N-rel`) can both be assigned in one mapping**

- **Severity:** Low
- **Detail:** X-Touch Compact models each knob twice (absolute + relative variant on the same CC, sanctioned). A hand-edited mapping assigning both loads silently → ambiguous routing. PAM-2 must define precedence or the loader should warn; bundled mappings are clean (verified).

### Verdict

- **ACs:** 6/6 passed · **Bugs:** 7 (0 Critical / 0 High / 1 Medium / 6 Low) · **Security:** pass (no pollution, traversal, DoS; two Low hardening notes)
- **Ship:** YES — the contract is fully met with independently verified content fidelity; all findings are hardening/UX items for hand-edited files, none block PAM-2 building on this format. BUG-1 should be decided (product call) before PAM-7 sharing goes live; BUG-7 needs a PAM-2 precedence rule.
