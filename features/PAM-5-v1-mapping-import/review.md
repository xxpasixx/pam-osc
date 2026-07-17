# Review — PAM-5

**Reviewed:** 2026-07-17
**Where tested:** local — `cd app && npm test` (178/178) + `npm run typecheck` (clean) + `npm run build` (ok); converter/import unit + integration suites; regex backtracking measured directly with Node; renderer flow read for AC-1/AC-5. Two independent adversarial lanes (code/AC + security red-team) fanned out via the Reviewer agent; findings merged here.
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] **AC-1** — pick `.json` → parse without executing JS → board dropdown (all loaded definitions) + name field. Pass. `index.ts` pick handler → `analyzeV1File` (`JSON.parse` + shape-only `readV1Mapping`, no eval); `ImportV1Dialog` configure phase; boards from `catalog.boards()`.
- [x] **AC-2** — new valid v2 file in the user folder, loadable by the real loader, source untouched, appears in the list. Pass. `import-v1.ts` re-reads from disk, `mappingSchema.safeParse` before write, catalog refresh; integration test confirms source byte-identical and file loads.
- [x] **AC-3** — every v1 feature converts; hardware facts dropped. Pass. All 10 legacy fixtures convert; golden test = PAM-1 hand conversion 124/124; all action kinds covered.
- [x] **AC-4** — feedback mapper pattern-matched, never executed; unrecognized → default + warning. Pass (functionally). JS is only `.exec()`-matched; captured groups `Number()`-parsed and clamped ≤127. **But see BUG-1: the matching step itself is the attack surface.**
- [x] **AC-5** — summary lists conversions + every warning; nothing silent. Pass. Five warning kinds; unknown top-level + per-entry keys warned; dialog renders full list; warnings persisted to `notes`; test asserts `converted + warnings === entry count`.
- [x] **AC-6** — invalid JSON / non-v1 → clear file-named error, nothing written, app survives. Pass. `readV1FromDisk` returns file-prefixed errors for read failure / bad JSON / v2 file / missing sections; all error paths return before `writeFile`.

### Edge Cases

Spec is a lite spec with no EC-IDs. Probed edges: wrong-board import (0 assignments, per-entry warnings, still valid) — handled; numeric-string executors — handled; duplicate target across sections (first wins) — handled; id collision + stray-file collision — handled; empty boards list — see BUG-6.

### Code Review

Faithful to `design.md`; the three documented deviations (feedback-by-action-statefulness, `amount` numeric-only, quoted file name in notes) are all recorded in Implementation Notes. Validation is thorough, converter is capability-guarded so its output always passes the loader, IPC boundary is clean. No dead code, no over-engineering. One trivially-fixed correctness hazard (BUG-1) and a set of Low robustness/UX gaps below.

### Security (red team)

- [x] Code execution: **none** — mapper JS never executed; no `eval`/`Function`/`vm`/`require`/`child_process` on the import surface. Regex-only claim holds.
- [x] Path traversal / arbitrary write: **blocked** — `makeUniqueId` strips everything but `[a-z0-9-]`, `idSchema` re-validated before write, target is `join(userMappingsDir, <id>.json)`; `deviceDefinitionId`/`filePath` never touch the write path.
- [x] Arbitrary read: **blocked** — `importV1Mapping` requires exact membership in the `pickedV1Files` allowlist (native-dialog paths only); a compromised renderer cannot point main at arbitrary files.
- [x] Bundled-content poisoning: **blocked** — uniqueness checked against bundled+user ids and existing user files; bundled dir is read-only, never written.
- [x] Prototype pollution: **safe** — `JSON.parse` makes own-props only; attacker keys become Map keys or parsed ints, never assignments onto shared prototypes.
- [x] XSS: **safe** — warnings/counts via React JSX (auto-escaped); no `dangerouslySetInnerHTML`; `notes` (embeds attacker keys/filename) is not rendered anywhere.
- [x] IPC: sender pinned to the main window; `contextIsolation`/`sandbox`/no `nodeIntegration`; window-open denied, navigation restricted.
- [x] Secrets: none written or logged; `notes` records only the file basename.
- [ ] **BUG-1** — ReDoS in the mapper pattern freezes the main process (confirmed empirically by two independent measurements).

### E2E (critical journeys, optional)

- Status: **not run.** The import flow depends on Electron's native file dialog (main process) — not worth a brittle E2E harness at this scope; the converter + main-boundary integration tests cover the logic. Recommend a converter-level ReDoS regression test alongside the BUG-1 fix.

### Bugs

**BUG-1: ReDoS in `V1_MAPPER_PATTERN` freezes the whole app (UI + live bridge)**

- **Severity:** High
- **Where:** `app/src/core/import/converter.ts:44` (pattern) executed at `:458`; `mapperToOnOff` never bounds the mapper string length before `.exec()`, and the 1 MB file cap does **not** cap the mapper substring.
- **Steps to reproduce:** Import a v1 file whose `buttonFeedbackMapper` (top-level or per-entry) partially matches the pattern then feeds a long whitespace run into the `return\s+(\d+)\s*;?\s*\}` region, e.g. `"function(value){if(value=='On'){return 1" + " ".repeat(1_000_000) + "X"` (fits under the 1 MB cap). Pick board + name → **Import**.
- **Expected / Actual:** Expected — unrecognized mapper → `on-off` 127/0 + warning, instantly. Actual — quadratic backtracking (measured: 62 ms @ 10k, ~6 s @ 100k, extrapolated ~10 min @ 1 MB) runs in the **main process**, freezing the UI *and* the single-threaded MIDI/OSC bridge; only force-quit recovers. No RCE, no data loss.
- **Why High:** The project's own design classifies mapping files as untrusted input (the stated rationale for banning executable code), and the feature exists to onboard external v1 files. A main-process freeze takes the live-show bridge down. The fix is a one-liner (cap mapper length before `.exec()`, or de-ambiguate the pattern), so the strict call is cheap. Both this reviewer's measurement and the independent security lane confirmed the O(n²) blowup — the code lane's initial "tens of ms" estimate was wrong; empirical evidence governs.

**BUG-2: Two concurrent imports of the same name can overwrite each other**

- **Severity:** Low
- **Where:** `import-v1.ts:65-94` — the `validIds()` snapshot + sequential `fileExists` loop is not atomic with the later `writeFile`; same non-atomicity for concurrent `catalog.refresh()`.
- **Repro:** Fire two `importV1Mapping` IPC calls with the same name before the first resolves → both compute `foo`, both write `foo.json`, one lost. The renderer serializes via `importBusy`, so real exposure is minimal, but the IPC boundary doesn't enforce it.

**BUG-3: Escape during import makes the modal vanish then reappear**

- **Severity:** Low
- **Where:** `ImportV1Dialog.tsx:69-71` — native `<dialog>` closes on Escape; `onClose` is guarded by `!busy` so React state is unchanged, but the DOM dialog already closed and only re-opens when `flow` changes (import resolves).
- **Repro:** Import → immediately press Escape → dialog disappears for the import duration, reappears at the result phase. Recoverable, import completes; cosmetic.

**BUG-4: Post-write "did not load" path leaves a file while claiming nothing was written**

- **Severity:** Low
- **Where:** `import-v1.ts:94-103` — defensive branch after a successful `writeFile` where the catalog lookup fails; error text implies no artifact, but the file exists (skipped by the next uniqueness loop). Converter is capability-guarded, so this shouldn't trigger.

**BUG-5: Unwrapped fs failures + unbounded fields surface raw Node errors / leak absolute path**

- **Severity:** Low
- **Where:** `import-v1.ts:24-31,94-95`; schema `envelope.ts:15-16`, `mapping.ts` (`name`/`notes`/`command` have no `.max()`). A pathological name via IPC (bypassing the UI `maxLength=120`) can yield `ENAMETOOLONG`; `readFile`/`stat` errors surface the absolute picked path to the renderer. Acceptable for a local single-user app, but the friendly-error contract stops at the converter.

**BUG-6: Empty boards list strands the user at the configure step**

- **Severity:** Low
- **Where:** `ImportV1Dialog.tsx:63,83-90` — if `snapshot.boards` is empty (corrupt/missing bundled device resources), the dropdown never lets `canImport` become true and no message explains why. Bundled devices normally guarantee a non-empty list.

**BUG-7 (informational): imported buttons can carry arbitrary destructive MA3 commands**

- **Severity:** Low (inherent to the feature)
- **Where:** `converter.ts:351-368` — `cmd`/`quicKey`/`attribute` accepted as any non-empty string and later sent verbatim to the console by the PAM-2 engine. A shared "mapping" could bind a button to `Delete Sequence 1 Thru 9999`. This is the intended data path; worth a one-line UX caution when importing, no code fix expected here. (Also noted: a stray `attribute` alongside `local:"encoderFine/Rough"` is dropped without a warning — `converter.ts:292` — only reachable via hand-edited v1 files.)

### Verdict

- **ACs:** 6/6 passed (AC-4 functionally correct but its matcher is the BUG-1 surface) · **Bugs:** 7 (0 Critical / 1 High / 0 Medium / 6 Low) · **Security:** all promised guarantees hold except the BUG-1 ReDoS
- **Ship:** **NO** — one High (BUG-1 ReDoS freezes the main process on untrusted input). Fix BUG-1, then re-review; BUG-2/BUG-3 are worth folding into the same pass, the rest are optional polish.
