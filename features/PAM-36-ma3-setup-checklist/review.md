# Review — PAM-36

**Reviewed:** 2026-10-07
**Where tested:** local, commit `fe97df2` on `v2`. Ran `vitest run ma3-checklist.test.ts wizard-logic.test.ts` (2 files, 28 tests, green) and `tsc --noEmit` (clean). The full suite was not re-run in this review; per the caller it was green at 539/539. Everything else here comes from static review of the diff against the pre-`fe97df2` `Ma3SetupView`, `ConnectionCheck`, `ConnectionChecker` (`core/engine/connection.ts`) and `styles.css`. **Not tried in a running app or against onPC.**
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: three rows in PAM-35 order (files · osc · plugin), each with a status LED (`ok` / `warn` / off for done / open / waiting), a title, a one-line summary and a progress counter that reads "N of 3 done" or "All set". See `Ma3Checklist.tsx:22-50`.
- [ ] AC-2: **fails for `plugin-outdated`.** `consoleAnswers` (`ma3-checklist.ts:28-29`) only counts `plugin-missing` and `connected`. The engine also reports `plugin-outdated` when the console answers *and* the plugin answers with the wrong protocol (`connection.ts:101-108`). In that state step 2 never ticks, and on a remote console step 1 doesn't either. See BUG-1. The other branches are correct: onPC files with current version, remote console that answers, connected → step 3, and a stopped bridge turning off every tick (tested).
- [x] AC-3: the expanded step is `nextOpenStep`, the first step that isn't done. Waiting and done steps are collapsed. A click on any row toggles a per-step override (`Ma3Checklist.tsx:32,39`). There's a caveat about the auto-expanded step jumping around, see BUG-2.
- [x] AC-4: the tab has exactly one live check. The plugin card's check is `live: true` and the OSC card's is `live: false` (`Ma3SetupView.tsx:674,677`). Collapsed steps are `hidden` but still mounted (`Ma3Checklist.tsx:52`), so the polling `setInterval` in `ConnectionCheck` keeps running while the plugin step is folded. Nothing creates a second check.
- [x] AC-5: in the files step, `primary` / `secondary` are still picked by `consoleRoute`. The other route now sits behind `<details className="advanced">` in the tab too. Before `fe97df2` the full tab rendered it openly; this is the change AC-5 intends.
- [x] AC-6: the wizard modes are identical to before. `files` renders oscTarget → primary → details(secondary). `osc` renders OscCard with `live: true`. Before, that was `live: mode === "osc"`, which is the same thing in that branch. `plugin` renders PluginCard with `live: true`. Order, disclosure and the fragment wrapper are unchanged. `SetupWizard.tsx` is untouched.

### PAM-35 regression check

- [x] AC-4 / AC-9: route order and the 1-2-3 numbering are kept. The fallback route is still reachable in both surfaces.
- [x] AC-5: the generated OSC config path isn't touched (`oscTargetFor` / `OscTargetCard` are reused as-is).
- [x] AC-6: the OSC step in the tab still shows the "reachable" readout. It was non-live before too, so the polling still comes from the plugin step.
- [x] AC-8: one live check, it starts immediately, polls every 5 s, and quiet polls don't flicker. The hidden plugin check still auto-starts the bridge when the tab opens, exactly as the always-rendered PluginCard did before.
- [ ] Side effect on PAM-35 **AC-7** (not in the requested set, but relevant): when the plugin is outdated, the update hint sits in the plugin step. That step is collapsed in that state (BUG-1), and the row points the user at step 2.

### Edge cases probed

- Outdated plugin in onPC, console not answering → step 1 open. This is correct and tested. If the console *does* answer (`plugin-missing`), step 1 ticks via the `reachable` branch and InstallCard's "update available" hint gets folded away. The spec allows this ("or when the console answers"). Its summary "Files are on the console" is misleading there, see BUG-3.
- Several onPC installs → *any* install with plugin + `pam-osc.xml` counts (`ma3-checklist.ts:37-44`). The app can't know which onPC version is running. `installedVersion === undefined` (version unreadable) counts as current. `hasOscConfig` only checks that the file exists (`main/ma3-install.ts:82`), so a stale config with old ports or IP, or the pre-PAM-35 static file, still ticks step 1. See BUG-3.
- Remote console, bridge running, no answer → step 1 stays open forever, because the app can't observe the files. The spec rules that out of scope; the user can open step 2 by hand.
- Stopped or `starting` bridge → no ticks, step 2 reads "Waiting for the bridge to run". Correct.
- `plugin-missing` vs `connected` → steps 1+2 done with step 3 open, vs. all done with nothing expanded. Correct and tested.

### Code Review

- The pure derivation (`ma3-checklist.ts`) is clean, separate from the view, and unit-tested. The view only wires state in.
- Hidden content: `.checklist-body` doesn't set `display`, and no global rule overrides `[hidden]`. So the UA `display:none` applies and nothing inside a collapsed step can get focus or be tabbed into. Pass.
- CSS: the `.checklist-body > section.card` (0,2,1) and `> details > section.card` (0,2,2) overrides beat `section.card` (0,1,1) and `.advanced > section.card` (0,2,1). They are scoped to the checklist body only, so nothing leaks outward. `all: unset` on `.checklist-row` drops the global button chrome. The global `button:hover:not(:disabled)` (0,2,1) still wins on hover, but it only sets `border-color` and the border style is now `none`, so nothing shows. The focus ring is restored via `:focus-visible`. No leak.
- The `<h2>` of the checklist sits inside `.checklist-head`, so `section.card > h2` doesn't style it. It renders as a browser-default h2, unlike every other card heading. Cosmetic, part of BUG-4.
- Tests cover the derivation only. Nothing covers `plugin-outdated`, `starting`, `checking`, multiple installs, or the component behaviour (overrides, hidden-but-mounted). Low.

### Security (red team)

This is a UI-only feature in the renderer: no new IPC, no file or network access, no input that reaches the main process. Summaries are static strings plus `installedVersion`, which comes from a local file and is rendered as a React text node, so it can't be injected. Nothing sensitive is logged. Pass.

### Bugs

**BUG-1: `plugin-outdated` is not treated as "console answers"**

- **Severity:** High (AC-2 fails. It's the upgrade path for existing users, who are a PRD target group.)
- **Where:** `app/src/renderer/src/ma3-checklist.ts:28-29`
- **Steps to reproduce:** Run an older pam-osc plugin (wrong protocol) on the console, start the bridge, open the MA3 tab.
- **Expected:** steps 1 and 2 done, step 3 open with the "outdated — import the current plugin" readout.
- **Actual:** step 2's row is "open" and says "Import the OSC config on the console". The OSC card inside it says "OSC works — the next step updates it", which contradicts the row. Step 3 is "waiting" and says "After the OSC step", and the update hint is collapsed. On a remote console step 1 also stays open ("Copy … to a USB stick"). The likely fix is to add `"plugin-outdated"` to `consoleAnswers`, plus a test.

**BUG-2: a non-quiet re-check resets the ticks and moves the expanded step for about 3 s**

- **Severity:** Medium
- **Where:** `ma3-checklist.ts:32` together with `connection.ts:80-81`. A non-quiet `checkNow` / `start` emits `state: "checking"` for `pingTimeoutMs` (3000 ms).
- **Steps to reproduce:** Remote console with state `plugin-missing`, so step 3 is auto-expanded. Click "Check now" inside step 3. The same happens on any bridge (re)start or settings save that reconfigures the engine.
- **Expected:** the checklist keeps its last known state while it re-checks.
- **Actual:** `reachable` turns false and steps 1 and 2 lose their ticks. Step 1 auto-expands and step 3 collapses, which hides the button that was just clicked, so keyboard focus drops to `<body>`. About 3 s later it flips back. Quiet polling isn't affected. A likely fix is to keep the last non-`checking` result in the derivation (or in App).

**BUG-3: step 1 auto-tick is over-optimistic, and one summary is misleading**

- **Severity:** Low
- **Where:** `ma3-checklist.ts:37-44, 52`
- **Details:** Any onPC install counts, and so does an unreadable version. `pam-osc.xml` only needs to exist, even if its ports or IP are stale. When the onPC plugin is outdated but the console answers, step 1 ticks with "Files are on the console", and InstallCard's update hint gets folded away. The spec mostly allows this (step 1 is done "when the console answers"), but the wording could say "OSC works".

**BUG-4: accessibility and copy polish**

- **Severity:** Low
- **Where:** `Ma3Checklist.tsx:25, 36-50`; `ma3-checklist.ts:59, 70`
- **Details:**
  - The step status (done / open / waiting) is only shown by an `aria-hidden` LED and a "✓" glyph, so a screen reader doesn't get a status word.
  - There is no `aria-controls` from the row to its body. `aria-expanded` is present and correct.
  - Step titles are not headings.
  - The checklist `<h2>` isn't styled like the other cards' headings.
  - Copy: on this computer with no onPC found, the summary still says "Install … into onPC". A "waiting" step 2 shows "Import the OSC config on the console" while step 1 is still open.

### Verdict

- **ACs:** 5/6 passed (AC-1, AC-3, AC-4, AC-5, AC-6), 1 failed (AC-2) · **PAM-35 regression:** AC-4/5/6/8/9 hold; the visibility of PAM-35 AC-7's update hint suffers from BUG-1 · **Bugs:** 4 (0 C / 1 H / 1 M / 2 L) · **Security:** pass
- **Ship:** NO. BUG-1 is probably a one-line fix (plus a test) and blocks Approved. BUG-2 should be fixed in the same pass. BUG-3/4 can follow. Not yet checked in a running app with onPC.

---

## Re-review — 2026-10-07 (commit `6cffdab`)

**Where tested:** `vitest run ma3-checklist.test.ts wizard-logic.test.ts` (2 files, 32 tests, green; 4 new) and `tsc --noEmit` (clean). Full suite not re-run. Static review of `git show 6cffdab`. **Still not tried in a running app or against onPC.**

### Fix verification

- [x] **BUG-1 fixed.** `consoleAnswers` now includes `plugin-outdated` (`ma3-checklist.ts:30-33`). The plugin step names the outdated plugin ("import the new one and restart it"). Tested: remote + `plugin-outdated` gives `done, done, open`, with the plugin step expanded. **AC-2 now passes.** The PAM-35 AC-7 update hint is in the expanded step again.
- [x] **BUG-2 fixed.** `settledConnection` keeps the last result that wasn't `checking`. `Ma3SetupView` holds it in a `useRef`, which is updated during render. That is idempotent, so StrictMode's double render is harmless. The hook is called before the early returns, so hook order is stable. Only the checklist derivation uses the settled value. `ConnectionCheck` still gets the raw `check.connection`, so its readout behaves exactly as in PAM-35.
- [x] **BUG-3 fixed as scoped.** An onPC plugin older than the bundled version keeps step 1 open, with "The plugin in onPC (x) is outdated — update it to y". This holds even when the console answers. Tested. `outdated.installedVersion` and `bundledVersion` are both defined whenever that branch runs, because `isCurrent` treats undefined as current. Counting an unreadable version as current was accepted by the maintainer.
- [x] **BUG-4 fixed.**
  - Each row now has a visually hidden status word (Done / To do / Waiting).
  - `aria-controls` points at the body `id`.
  - The `h2` is a direct card child again, so it gets the `section.card > h2` style. The progress counter is absolutely positioned and is a `role="status"` live region.
  - Copy: "No onPC installation found — use a USB stick or folder", and a waiting step 2 now says "After step 1".
  - Not adding `role="heading"` inside the row button is correct, since a heading role isn't allowed inside a button.
  - `.visually-hidden` is a new global class with no collisions.

### New findings (non-blocking)

**BUG-5: a stale result can show as "done" for one check right after a bridge restart**

- **Severity:** Low
- **Where:** `Ma3SetupView.tsx:596-598`
- **Details:** `settledRef` is never cleared when the bridge stops or restarts. After a stop → start (for example after changing the console IP), the first non-quiet check emits `checking`. During that time `settledConnection` returns the *previous run's* result, so the checklist can show "All set" for about 3 s until the real answer arrives. While the bridge is stopped the `engineState === "running"` gate still holds, so the spirit of AC-2 is only bent in that short window after a restart. Suggested fix: clear the ref whenever `engineState !== "running"`.

**BUG-6: an outdated onPC plugin file keeps step 1 open even when the console is connected**

- **Severity:** Low
- **Where:** `ma3-checklist.ts:48, 50-55`
- **Details:** `outdated` doesn't look at the live connection. Example: the onPC folder holds an old plugin file, but a current plugin is running on the console (imported some other way, or from a second onPC version without `pam-osc.xml`). The state is then `connected` with the right protocol, yet step 1 stays open and expanded and the counter reads "2 of 3 done". This is arguably the honest reading, because the file *is* outdated. Still, it nags on a setup that works. One option: only open step 1 when the console isn't `connected`, or show it as done with an update note.

### Re-review verdict

- **ACs:** 6/6 passed · **PAM-35 regression:** AC-4/5/6/8/9 hold, AC-7 hint visible again · **Open bugs:** 2 (0 C / 0 H / 0 M / 2 L, both non-blocking) · **Security:** pass
- **Ship:** **Approved for beta.4.** No Critical, High or Medium bugs remain. BUG-5 and BUG-6 can follow. Do a quick visual check in the running app before the release (progress counter position, collapsing). It hasn't been tried in a running app yet.
