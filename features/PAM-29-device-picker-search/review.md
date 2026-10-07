# Review — PAM-29

**Reviewed:** 2026-09-10
**Where tested:** local — Vitest suite (472 tests, all green) + `tsc --noEmit` clean. **This feature is pure renderer UI and has zero automated coverage** (the project has exactly one renderer test file, `wizard-logic.test.ts`); every AC below was verified by reading `AddDeviceDialog.tsx`, not by executing it.
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: autofocused search input, live case-insensitive filter on name / manufacturer / id — `AddDeviceDialog.tsx:69-79`: labelled input with `autoFocus` (`:74`), and the filter at `:53-60` lower-cases the query once and tests `[name, manufacturer ?? "", id].some(field => field.toLowerCase().includes(query))`. All three fields, both sides lower-cased. `search.trim()` means whitespace-only input behaves as empty.
- [x] AC-2: empty query = full list; no match = clear empty state — the ternary at `:55-56` returns `boards` untouched for `query === ""`; the empty state at `:85` reads `No board matches "<query>"` with the trimmed query echoed back.
- [x] AC-3: Enter picks a **unique** match — `:77-78`, `if (event.key === "Enter" && visibleBoards.length === 1) setBoardId(visibleBoards[0]!.id)`. Explicitly checked the failure mode that would matter here: with two or more matches Enter does nothing (no "pick the first" surprise), and with zero matches it also does nothing. Correctly gated.
- [x] AC-4: invalid catalog files listed only when the query is empty — `:103-110` wraps the invalid-file rows in `query === "" &&`, so they vanish while searching (they carry no searchable board data, as the AC reasons).
- [x] AC-5: `BoardInfo` carries `manufacturer` — declared optional at `ipc.ts:74` and populated in the main process at `catalog.ts:96` from `device.manufacturer`, so the filter has real data to match rather than always falling back to `""`.

### Edge Cases

- [x] `manufacturer` is optional on the type; the filter coalesces to `""` (`:58`), so a board without one is still matchable by name and id.
- [x] Two `autoFocus` attributes exist in the file (`:74` board-step search, `:166` mapping-name input), but they sit in different steps of the dialog and are never mounted simultaneously — no focus fight.

### Code Review

- Straightforward and correct; the comment at `:51-52` states the reasoning (small list, so a plain in-render filter rather than memoisation) — a fair call at this data size (the largest bundled board list is well under 100 entries).
- The `visibleBoards.length === 1` guard is the detail most implementations get wrong. It is right here.
- **The gap is testing, not logic.** Five ACs, all describing observable UI behaviour, none exercised by the suite. AC-3 and AC-4 in particular encode decisions that a future refactor could silently break (Enter firing on multiple matches; invalid files reappearing mid-search) with no test to catch it. This is the weakest-covered feature in the batch — see BUG-1.

### Security (red team)

- [x] The search query is used only for `String.includes` matching and echoed into the empty state as React children (escaped). No injection surface.
- [x] Board names/manufacturers come from community-shared files but render as text, and no `dangerouslySetInnerHTML` / `innerHTML` exists anywhere in the renderer.
- [x] No auth/money/PII surface.

### E2E (critical journeys, optional)

- Status: **not run** — no E2E harness in the project. The add-device flow is a reasonable candidate for the first one if the visual editor keeps growing.

### Bugs

**BUG-1: no automated coverage for any of the five ACs**

- **Severity:** Low (no defect found; a regression-risk gap)
- **Steps to reproduce:** `grep -rl` for tests touching `AddDeviceDialog` → none; the only renderer test file is `wizard-logic.test.ts`.
- **Expected:** per the repo's AC → Test chain, each AC has something asserting it.
- **Actual:** all five verified by code reading only. The behaviour is correct today; nothing guards it tomorrow. Cheapest fix: extract the filter predicate (and the "Enter picks unique" condition) into a pure helper next to `wizard-logic.ts` and unit-test it — that covers AC-1 through AC-4 without adding a component-test harness.

### Verdict

- **ACs:** 5/5 passed (by code inspection) · **Bugs:** 1 (0 C / 0 H / 0 M / 1 L) · **Security:** pass
- **Ship:** YES — the implementation is correct on every AC, including the Enter-key edge case. The honest caveat is that "passed" here rests on reading rather than executing; BUG-1 records that as a follow-up, not a blocker.
