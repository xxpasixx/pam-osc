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

### Verdict (round 1)

- **ACs:** 7/7 passed (+ EC-1 with one failure-path gap) · **Bugs:** 7 (0 Critical / 0 High / 2 Medium / 5 Low) · **Security:** pass, no Critical/High
- **Ship:** YES — READY. No Critical/High; the two Mediums are narrow failure paths with workarounds (save normally before closing; bundled-shadow scenario is rare). Note: a user-requested spec delta (boards tab, format-level push-encoder combo, Compact layer offsets, indicate mode) is queued — fixing BUG-1..BUG-4 in that same build round is the economical path.

---

# Re-review — delta round (AC-8…AC-11, PAM-1 AC-7, review fixes)

**Reviewed:** 2026-07-17 · **Commit:** `788db02` · **Where tested:** local (Vitest 227/227 incl. PAM-1..5 suites, typecheck, production build); bundled-content facts verified by script; independent red-team subagent, findings merged by the review owner.

### Acceptance Criteria (delta)

- [x] AC-8: Boards tab lists all definitions with badges, Edit / "Edit a copy" / New board; entry removed from Devices — pass
- [x] AC-9: composite push-encoders render as one component (ring + cap), both parts independently assignable and learnable — pass (golden import test proves wire parity with v1; x-touch: 8/8 encoders carry push, zero leftover push buttons, zero duplicate addresses)
- [ ] AC-10: Compact layers no longer fully overlap, "every control is clickable" — **FAIL — BUG-8** (layer-A vs layer-B fixed: 0 cross-layer overlaps; but 24 controls remain fully covered by same-rect siblings)
- [x] AC-11: Indicate toggle flashes matching controls, view-only tap — pass (BUG-10/BUG-11 are polish)
- [x] PAM-1 AC-7: push declared on the encoder, rotate+push independently assignable, bundled X-Touch re-expressed with v1 behavior — pass

### Review-fix verification (round 1 bugs)

- [x] BUG-1 fixed — board save propagates its outcome on both paths; "Save & close" no longer closes on failure (residual UX gap → BUG-9)
- [x] BUG-2 / BUG-3 fixed — delete warning names the real per-case consequence
- [x] BUG-4 fixed — learn target pinned at Learn-start; selection-change / deleted-control / missing-control races all handled
- [x] BUG-7 fixed — canvas clamps floor at 0 / MIN_SIZE
- BUG-5 / BUG-6 — parked by decision (unchanged)

### Security (red team, delta surfaces)

- [x] `startMidiIndicate`/`stopMidiIndicate`: port validated (non-empty string), sender check via shared `handle()` wrapper, no path/PII surface
- [x] Pre-delta mappings without `part` validate and route identically (schema-optional; `buildUnit` diverges only on `part === "push"`)
- [x] Virtual route id `<id>#push` cannot collide with kebab-case control ids

### Regression

- 227/227 Vitest, typecheck clean, production build green; no dangling references to the deleted BoardsManagerDialog.

### Bugs (delta round — numbering continues)

**BUG-8: X-Touch Compact — 24 controls unreachable in the canvas (AC-10 fail)**

- **Severity:** Medium (single board type; but a hard AC-10 fail — this was the user's original complaint)
- **Steps to reproduce:** Open the X-Touch Compact board (or a mapping on it) in the editor. Try to select `knob-1` (rotary fader) or `knob-9-abs`. The click always lands on the same-rect sibling rendered on top (`knob-N-push`; for `-abs` knobs a 3-way stack with `-rel` and `-push`).
- **Expected / Actual:** every control clickable / 8 knobs + 16 `-abs` knobs (both layers) never receive the pointer.
- **Root cause:** `capabilities.push` is encoder-only by schema; the Compact's knobs are absolute-CC **faders**, so their push buttons (and `-abs`/`-rel` twins) remain separate same-rect controls. spec AC-10 ("every control is clickable") and the round-1 design decision ("overlaps allowed") contradict each other here.
- **Fix options:** (a) concentric inset in the Compact data — push cap smallest, `-abs` mid, `-rel` outer ring: pure data, everything clickable, visually matches the X-Touch combos; (b) relax AC-10 wording to layer separation only (spec delta); (c) canvas click-cycling through stacked controls (generic code fix).

**BUG-9: "Save & close" on a bundled board drops the close intent when the retarget dialog opens**

- **Severity:** Low
- **Steps to reproduce:** Edit a bundled board that mappings reference; close with unsaved changes; "Save & close"; retarget dialog appears; "Save copy".
- **Expected / Actual:** editor closes after the successful save / editor stays open (no data loss — intent only).

**BUG-10: Port-lost during Indicate mode reports "MIDI learn ended"**

- **Severity:** Low
- **Steps to reproduce:** Enable Test/Indicate, unplug the listened board.
- **Expected / Actual:** notice about the test mode / notice says "MIDI learn ended — the port disappeared" (toggle state itself is correctly cleared).

**BUG-11: Indicate flash flickers on sustained input**

- **Severity:** Low
- **Steps to reproduce:** Enable Test, turn an encoder continuously — the highlight blinks off/on every ~300 ms instead of staying lit (each batch schedules an independent clear; no per-key reset).

### Verdict (delta round)

- **ACs:** 4/5 delta ACs passed (AC-8, AC-9, AC-11, PAM-1 AC-7; **AC-10 fails — BUG-8**); rounds 1 ACs regression-clean · **Bugs:** 4 new (0 C / 0 H / 1 M / 3 L) · **Security:** pass
- **Ship:** NO — NOT READY. No Critical/High, but AC-10 verifiably fails on the exact board the feedback came from. Fix BUG-8 via `/build` (recommendation: option a, concentric inset in the Compact data), then `/review` re-runs AC-10; BUG-9…11 are cheap to take along.

---

# Re-review — fix round (BUG-8…BUG-11)

**Reviewed:** 2026-07-17 · **Commits:** `f699a23` (BUG-8 / AC-10) + `f437a44` (BUG-9/10/11) · **Where tested:** local (Vitest 233/233 incl. PAM-1..5 suites, typecheck clean); Compact geometry re-derived by an independent overlap script; wire-parity of the push-fold checked against `f699a23^`; adversarial code trace of the three EditorView paths. Real-window onPC/hardware verification remains the user's release gate.

### Acceptance Criteria (re-check)

- [x] **AC-10 — PASS.** "Every control clickable" on the bundled X-Touch Compact now holds. Independent check + the new `bundled.test.ts` regression ("no control fully covered by a later-rendered sibling") both report **0 full-coverage overlaps** across all bundled devices (144 controls on the Compact); 0 identical rects; 0 out-of-bounds. Concentric stacking is correct and the later-rendered control is always the smaller inner one: `knob-N` (0.8) ⊃ `knob-N-push` (0.4, rendered later, on top); `knob-N-abs` (0.8) ⊃ `knob-N-rel` (0.5, later) ⊃ its `.push-cap` (45% of rel, DOM child = topmost). Every ring stays reachable — and because `.circle` uses `border-radius: 50%`, the inner square's corners pass the pointer through to the outer ring, widening the outer hit area. Layer-A/B separation from the prior round is intact.

### Fix verification (BUG-8…BUG-11)

- [x] **BUG-8 fixed (AC-10).** See above. Wire behavior preserved: the removed standalone `knob-9-push`…`knob-16-push` (v1 notes 8–15) fold into the `-rel` encoders' `capabilities.push` with identical notes; `knob-1-push`…`knob-8-push` (notes 0–7) correctly stay standalone (absolute-CC knobs are faders — the schema's `push` is encoder-only). Both Compact mappings retargeted: all `controlId`(+`part`) refs resolve, no duplicate assignment keys, `part: "push"` only on encoders that declare a push cap.
- [x] **BUG-9 fixed.** `closeAfterSaveRef` lifecycle traced across every path: "Save & close" → `save()` returns `"prompted"` → ref set true → retarget "Save copy" closes only on `ok && ref`, resets ref first; "Save copy" failure keeps the editor open (ref reset, no close); retarget "Cancel" clears the intent (ref=false). Plain header Save never sets the ref, so a plain-Save→retarget→Save-copy does **not** close. No stale-ref leak: the flag is only ever set in the Save&close handler and is reset on every terminal branch.
- [x] **BUG-10 fixed.** Discriminator `wasLearn = learnTargetRef.current !== undefined` names the mode correctly for port-lost: indicate-only → "Test mode ended…"; active learn (incl. learn while indicate suspended) → "MIDI learn ended…"; learn-canceled-then-lost → learnTargetRef already cleared in the "canceled" branch (which also `resumeIndicate()`s) → subsequent port-lost reads as Test mode. `reason: "replaced"` correctly keeps the ref (learn supersedes the suspended indicate). Toggle state is force-cleared (`indicateRef.on=false`, `setIndicateOn(false)`) either way.
- [x] **BUG-11 fixed.** One clear-timer per flash key in `flashTimersRef`; each incoming batch `clearTimeout`s and re-arms only its own keys, so sustained input on a key keeps renewing its timer (stays lit) while independent keys expire independently. No stale closure — the handler reads `indicateRef.current` and `addressMapRef.current` (both refs, kept current every render), effect deps `[]` are therefore safe, and `flashKeys` updates are functional. Unmount clears every pending timer and empties the map — no leak.

### Security (red team)

- No new surface: the fix is pure bundled data (`x-touch-compact.json` + two mappings) plus renderer-only control flow. No new IPC handler, no path/filename input, no credentials/PII. `startMidiIndicate`/`stopMidiIndicate`/learn IPC were already validated in the prior round and are unchanged here.

### Regression

- 233/233 Vitest (up from 227 — the new AC-10 coverage test plus PAM-11 additions), typecheck clean. Import/v1-parity suites (`converter.test.ts`, `import-v1.test.ts`, `bundled.test.ts` = 50 tests) green — the push-fold did not disturb v1 wire addresses.

### Bugs (fix round — numbering continues)

**BUG-12: Concentric 3-deep hit targets on the Compact relative knobs are fiddly at minimum zoom**

- **Severity:** Low (cosmetic/usability; AC-10 requires "clickable", which is satisfied — not blocking)
- **Detail:** For `knob-9-rel`…`knob-16-rel`, one physical knob renders three stacked click zones (abs ring / rel ring / push cap). At the zoom-to-fit floor (`scale` clamped to 20 px/unit) the innermost push cap is ~4.5 px across; at typical window widths (~74 px/unit) it is ~17 px — reachable but tight. Also, showing `-abs` and `-rel` simultaneously is inherently redundant (a real unit is in one mode at a time) — a data-model artifact of PAM-1 AC-7, not of this fix. Consider a per-knob abs/rel toggle or larger caps if users report mis-clicks.

**Minor (no bug ID):** toggling Indicate **off** clears `flashKeys` but not the pending `flashTimersRef` timers; they fire ~300 ms later as guarded no-ops (`if (!current.has(key)) return current`) and self-delete. Harmless — no visual glitch, no leak — but clearing them in `toggleIndicate` would be tidier.

### Verdict (fix round)

- **ACs:** AC-10 now **PASSES**; AC-1…AC-9, AC-11, EC-1 regression-clean · **Bugs:** BUG-8/9/10/11 all fixed; 1 new Low (BUG-12) + 1 benign note · **Security:** pass, no new surface
- **Ship:** **YES — READY.** No Critical/High/Medium open. AC-10 is verified in the data and locked by a new regression test; the three EditorView fixes hold under adversarial tracing. BUG-12 is a non-blocking usability polish. Remaining parked items (BUG-5/BUG-6 by decision) unchanged.
