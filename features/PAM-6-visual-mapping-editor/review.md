# Review — PAM-6

**Reviewed:** 2026-07-17
**Where tested:** local (Vitest suite 217/217, typecheck, production build, dev-boot smoke on macOS); code-level verification against commit `e52bd06`. Real-window onPC/hardware verification remains the user's release gate per AGENTS.md — the user has exercised the editor manually ("works, feedback given").
**Reviewer:** Review (AI) — independent red-team subagent for code review, security, and regression; findings merged by the review owner.

### Acceptance Criteria

- [x] AC-1: Board view renders controls at 2D positions, shows assignments, click selects — pass (BoardCanvas + summaries; unassigned dimmed; verified in code + user's manual session)
- [x] AC-2: Assign/change/remove MA3 action + feedback, save writes valid file, engine reloads — pass (`catalog-editor.test.ts` in-place save; reload via PAM-3 apply transaction; feedback filtered by capabilities)
- [x] AC-3: Add/move/resize/delete controls, save writes valid definition — pass (drag/resize math verified, snap 0.5, clamps correct)
- [x] AC-4: MIDI learn captures type/number/channel; manual entry always possible — pass (7 learn-session tests: temp open, engine tap, capture rules, endings) — see BUG-4 for a selection-change quirk
- [x] AC-5: Editing bundled files creates a suffixed user copy, bundled stays untouched — pass (tests: copy `test-map-2`, board copy `test-board-2`, retarget opt-in, bundled never written)
- [x] AC-6: New board from scratch → empty layout → user file, selectable — pass (createNew test incl. id auto-suffix)
- [x] AC-7: Invalid states block save with anchored errors; delete-of-assigned-control warns with affected mappings — pass (17 editor-rules tests; orphan cleanup verified) — see BUG-2/BUG-3 for two gaps in the warning semantics

### Edge Cases

- [x] EC-1: Dirty close prompts save/discard/cancel — pass in the normal path; **BUG-1** covers a failure path where "Save & close" can still lose the draft

### Code Review

- Matches design.md incl. its Implementation Notes (compatibility.ts split, deviceSources, midiInput tap, UI-only snapping, orphan cleanup across retargets).
- Validation runs twice (renderer live, main enforced) from one pure module — renderer stays untrusted. Write paths validate before writing; writes are atomic.
- No leftover mocks, no dead code, no secrets. One inconsistency: the board save path ignores its result (BUG-1); the mapping save path handles it correctly.

### Security (red team)

- [x] Path traversal blocked: every id that becomes a filename passes `idSchema` (kebab-case) before `join()`; `suffixedCopy` only appends `-N`
- [x] Bundled files can never be written (user-dir targets for bundled/new; `origin === "user"` guard on in-place, retarget, and orphan writes)
- [x] Prototype pollution blocked (zod `strictObject` rejects unknown keys)
- [x] IPC sender check on every new handler (shared `handle()` wrapper)
- [x] No credentials/PII anywhere near URLs; local single-user app, no auth surface
- [ ] BUG-5: no size cap on editor writes (loader refuses >1 MB on read-back → file saves but vanishes) — integrity gap, relevant for PAM-7 sharing

### E2E (critical journeys)

- Status: **not run** — no E2E harness in the project yet (Vitest integration via virtual MIDI + fake-MA3 covers the engine path). Recommendation: when PAM-6 stabilizes after the pending spec delta, lock "open editor → remap control → save → engine reload" in as an E2E journey.

### Regression

- 217/217 Vitest incl. all PAM-1..PAM-5 suites; typecheck clean; production build green. Loader `deviceSources`, engine `midiInput`, `BoardInfo.origin` are additive — no behavior change detected in existing features.

### Bugs

**BUG-1: Board "Save & close" closes and discards the draft even when the save failed**

- **Severity:** Medium
- **Steps to reproduce:** 1. Edit a user board; delete/rename its file on disk (or any condition where main-side save rejects while client validation passes). 2. Close the editor with unsaved changes. 3. Choose "Save & close".
- **Expected / Actual:** Editor stays open showing the error / editor closes, draft lost (EC-1's "never a silent loss"). Cause: the board branch of `save()` returns `true` unconditionally (`EditorView.tsx`), unlike the mapping branch.

**BUG-2: In-place edit of a user device that a *bundled* mapping references can break that mapping without cleanup**

- **Severity:** Medium
- **Steps to reproduce:** 1. Have a user device shadowing an id that a bundled mapping references (hand-edited shadow file). 2. In the editor, delete a control that bundled mapping assigns; confirm; save.
- **Expected / Actual:** Warning says bundled mappings break "if retargeted later" / the bundled mapping breaks immediately (loader skips it on refresh; visible only in the invalid-files list, or as an engine issue if active). Orphan cleanup correctly skips bundled files — the *warning text* must state the immediate consequence.

**BUG-3: Delete warning overstates the consequence when editing a bundled board**

- **Severity:** Low
- **Steps to reproduce:** Edit a bundled board (copy-on-edit), delete an assigned control — the dialog claims assignments will be removed from user mappings, but the save creates a copy with a new id; original-referencing mappings are untouched unless retargeted.
- **Expected / Actual:** Wording should reflect the copy-on-edit case / current text is misleading.

**BUG-4: MIDI-learn capture lands on the control selected at capture time, not at Learn-start time**

- **Severity:** Low
- **Steps to reproduce:** 1. Select control A, press Learn. 2. Click control B. 3. Move a fader.
- **Expected / Actual:** Address should go to A (or the session should cancel on selection change) / address is written to B.

**BUG-5: No write-size cap on editor saves; >1 MB drafts save, then silently vanish on reload**

- **Severity:** Low
- **Steps to reproduce:** Craft a draft just over 1 MB (renderer-trusted today; real risk arrives with PAM-7 shared files). Save succeeds, `refresh()` drops the file (loader max 1 MB), post-save reload error is silently ignored.
- **Expected / Actual:** Reject oversized drafts at save / silent disappearance.

**BUG-6: `createNew` can overwrite an existing *invalid* user file with the same id**

- **Severity:** Low
- **Steps to reproduce:** Have a broken `my-board.json` in the user devices folder (fails validation, so its id isn't loaded). Create a new board that slugs to `my-board`. Save.
- **Expected / Actual:** Suffix or warn / broken file silently overwritten. (Same latent pattern exists in PAM-3 `duplicate()` — pre-existing, noted for completeness.)

**BUG-7: Canvas drag can clamp a control to negative coordinates when it is larger than the board**

- **Severity:** Low
- **Steps to reproduce:** Hand-edit a device file so a control is wider than the layout; open the editor; drag the control.
- **Expected / Actual:** Position stays ≥ 0 / clamp with a negative max yields negative positions. Cosmetic — validation still blocks saving.

### Verdict

- **ACs:** 7/7 passed (+ EC-1 with one failure-path gap) · **Bugs:** 7 (0 Critical / 0 High / 2 Medium / 5 Low) · **Security:** pass, no Critical/High
- **Ship:** YES — READY. No Critical/High; the two Mediums are narrow failure paths with workarounds (save normally before closing; bundled-shadow scenario is rare). Note: a user-requested spec delta (boards tab, format-level push-encoder combo, Compact layer offsets, indicate mode) is queued — fixing BUG-1..BUG-4 in that same build round is the economical path.
