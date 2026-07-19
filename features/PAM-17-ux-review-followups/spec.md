# PAM-17: UX review follow-ups — feedback surfacing, recoverability, accessibility

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-18 · **Last Updated:** 2026-07-18

## Why

The UX review (2026-07-18, see the UX Review artifact) surfaced findings beyond the onboarding gap. The structural ones (UX-C1 no first-run, UX-H1 Setup→Status dead-end, UX-H4 tab order) are owned by **PAM-14**, and the console-side friction (UX-H3) by **PAM-13**. This feature captures the **remaining** findings — a silent-failure surface, a couple of recoverability gaps, and a batch of accessibility/polish items — so none of the review is lost. It carries two items that are more than polish and land first: **UX-H2** (silent failures behind the editor) and **AC-4** — the maintainer confirmed on 2026-07-19 that the Status-tab **"Test output" is currently broken** and must be fixed. The rest are polish/a11y.

## Dependencies

- PAM-3 (setup UI), PAM-4 (status/diagnostics), PAM-6 (visual editor) — the screens these fixes touch

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — _(UX-H2, priority)_ Given the visual editor is open, when a notice is raised (save error, learn warning, "port disappeared"), then it is visible over the editor — notices render at the App root, not only inside the tabbed body — so editor failures are never silent.
- [ ] **AC-2** — _(UX-M7)_ Given the traffic-log "Copy" action fails, when the clipboard write is rejected, then the user gets clear feedback (a "Copy failed" notice or a selectable fallback), never a button that silently does nothing.
- [ ] **AC-3** — _(UX-M8)_ Given a load failure at startup or in the MA3 setup assistant, when the error screen shows, then it offers a **Retry** action instead of forcing an app relaunch.
- [ ] **AC-4** — _(UX-M6 · **KNOWN BROKEN — maintainer-confirmed 2026-07-19**)_ The Status-tab **"Test output" does not work today and must be fixed.** Given a bound device and a running engine, when the user clicks "Test output", then a real test signal actually reaches the device (motor fader moves / LED lights) **and** the button state reflects the engine's actual result/ack — not a fixed 4-second timer (`runOutputTest`, App.tsx:242). First step is to pin down *what* fails (no MIDI sent at all vs. wrong signal vs. only the state-timing), verified against real hardware.
- [ ] **AC-5** — _(UX-M1)_ Given any diagnostic text (console IP, error message, port-diagnosis line), when the user tries to select/copy it, then it is selectable — the global `user-select: none` is scoped to drag/canvas surfaces only.
- [ ] **AC-6** — _(UX-M2, UX-L3)_ Given the editor's confirm/delete/retarget modals and the top tab bar, then modals trap focus and close on Escape (via native `<dialog>`), and the tabs expose proper `role="tab"` / `tablist` / `aria-selected` semantics.
- [ ] **AC-7** — _(UX-M4, UX-M5, UX-L1)_ Given user-facing copy, then internal spec IDs are removed from visible strings (e.g. "…to save (AC-6)"), disabled Create/Save buttons state *why* they're disabled, and MIDI/action jargon (`cc/note/pitchbend`, `encoderFine`, QuickKey…) has inline help.
- [ ] **AC-8** — _(UX-M3)_ Given the 2D board editor, then a control can be selected and nudged/moved with the keyboard, not only with the pointer.

## Out of Scope

- First-run wizard, Setup→Status flow, tab reorder/rename — owned by PAM-14.
- Console-side setup friction (OSC entries, plugin merge) — owned by PAM-13.
- UX-L2 (port-label direction diagram) and UX-L4 (empty-vs-zero port) — parked as nice-to-haves in `docs/ideas.md` rather than specced, to keep this batch focused. _(Pull them in via a delta if they come up.)_

## Open Questions

- [ ] **Batch vs. split** — this groups several small fixes for convenience. If any AC grows (e.g. AC-8 keyboard editing), split it into its own feature rather than bloating this one.

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| One "follow-ups" feature, not one per finding | The remaining findings are small and thematically related (feedback, recoverability, a11y); a folder each would be ceremony | 2026-07-18 |
| UX-H2 flagged as the priority AC | It's the only High here — a genuine silent-failure surface — so it ships first | 2026-07-18 |
