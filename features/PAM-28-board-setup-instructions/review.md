# Review — PAM-28

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean; renderer behaviour verified by reading the component (the project has only one renderer test file, so this feature's UI has no automated coverage).
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: optional plain-text `setupInstructions`, bounded at 1000 chars — `device-definition.ts:205` (`z.string().min(1).max(1000).optional()`). `min(1)` additionally rejects an empty string, which is what makes AC-4 airtight (no way to declare a blank notice). Additive, no `formatVersion` change.
- [x] AC-2: rendered as a highlighted notice above the board's mapping list, one line per step — `AddDeviceDialog.tsx:119-125`, guarded by `board.setupInstructions &&`, split on `\n` and mapped to elements.
- [x] AC-3: bundled on `x-touch-compact-mc` — present, 550 characters, carrying the MC-mode power-on steps.
- [x] AC-4: boards without the field render exactly as before — the `&&` guard yields nothing, and `min(1)` prevents an empty-string notice. No empty container.

### Edge Cases

- [x] `setupInstructions` also surfaced through the IPC boundary as an optional field on `BoardInfo` (`ipc.ts:76`), so the renderer never reaches into the raw device file.
- [x] Long instructions: capped at 1000 chars at load, so the notice cannot push the dialog to an unusable height.

### Code Review

- Small and well-scoped. The `min(1).max(1000)` pair is the whole robustness story and it is in the right place (load time, not render time).
- Rendering splits on `\n` into React children — no markdown, no links, matching the spec's Out of Scope.
- **No automated coverage for AC-2/AC-4** (the rendering itself). Verified by reading; the logic is a single conditional, so the risk is genuinely low, but it is unverified by the suite. The bundled-content test does cover AC-3 ("ships the X-Touch Compact MC board with its power-on setup instructions (PAM-28 AC-3)").

### Security (red team)

This is the one feature in the batch that renders **community-supplied text** in the UI, so it got the closest look:

- [x] **No HTML injection.** `grep` for `dangerouslySetInnerHTML` / `innerHTML` across the entire renderer returns **nothing**. The instructions render as React children, which escapes by default. A shared device file containing `<script>` or `<img onerror=…>` displays as literal text.
- [x] Length capped at 1000 chars → no layout-breaking payload.
- [x] Type enforced as `string` — an array or object in that field fails validation and the board loads as invalid.
- [x] Import paths capped at 1 MB; `strictObject` rejects unknown sibling keys.
- Worth stating plainly: had this rendered as HTML or markdown-with-raw-HTML, it would have been an XSS in an Electron renderer — the highest-value finding available in this batch. It does not.

### E2E (critical journeys, optional)

- Status: **not run** — the project has no E2E harness set up; a first-time setup was not in scope for this review.

### Bugs

None.

### Verdict

- **ACs:** 4/4 passed · **Bugs:** 0 · **Security:** pass (explicitly checked for XSS — none)
- **Ship:** YES — small, correctly bounded at load, and safe with untrusted text. The rendering path has no automated test; given it is one conditional and a `split`, that is an acceptable gap rather than a blocker.
