# PAM-36: MA3 Setup tab as a live checklist

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. -->

## Status: Spec'd

**Created:** 2026-10-07 · **Last Updated:** 2026-10-07

> Lite spec. Direction approved by the maintainer in chat (2026-10-07: "das UX ist mega
> komisch, nur lesbar" → checklist with live status; "merge gern rein").

## Why

The MA3 Setup tab is a wall of instructions: every step is fully written out, nothing shows
what is already done, and the user reads paragraphs to learn that a step finished long ago.
The tab should show **progress** — one row per step with what the app actually observes —
and only expand the step that needs attention.

## Dependencies

- PAM-35 (setup flow in testable order — steps, cards, live check and wizard modes reused)
- PAM-9 / PAM-23 (install and USB cards, reused as-is)

## Acceptance Criteria

- [ ] **AC-1** — Given the MA3 Setup tab, then it shows the three PAM-35 steps as a checklist
      (1 Copy the files · 2 Set up OSC on the console · 3 Import & start the plugin), each row
      with a status LED (done / open / waiting), its title, a one-line summary of what the
      app sees, and a progress counter ("N of 3 done" / "All set").
- [ ] **AC-2** — Given the app's observations, then the steps tick themselves: step 1 is done
      when a current plugin **and** OSC config are in a detected onPC installation (console on
      this computer), or when the console answers over OSC; step 2 when the console answers;
      step 3 when the bridge is connected (plugin running). A stopped bridge never counts a
      stale state as done.
- [ ] **AC-3** — Given the checklist, then only the **first step that is not done** is expanded;
      done and waiting steps are collapsed. Any step can be opened or closed by clicking its row.
- [ ] **AC-4** — Given a collapsed step, then its content stays active — the single live
      connection check of the tab (PAM-35 AC-8) keeps polling even while the plugin step is
      collapsed, and no second check starts.
- [ ] **AC-5** — Given step 1, then the route that fits the console address comes first and the
      other route sits behind a disclosure (PAM-35 AC-4/AC-9 order kept).
- [ ] **AC-6** — Given the setup wizard, then nothing changes: it keeps showing the same cards
      one step at a time (modes files / osc / plugin).

## Out of Scope

- Copy-to-clipboard chips for the values — parked in `docs/ideas.md`.
- A separate "feedback received" tick — the engine has no such signal; "connected" (both
  pongs) is the strongest automatic state (per PAM-35).
- Detecting that files reached a remote console before it answers — not observable.

## Decision Log

| Decision | Rationale | Date |
| --- | --- | --- |
| Checklist with auto-ticks, one expanded step | Maintainer: the tab was "only readable"; status beats prose | 2026-10-07 |
| Collapse by hiding, not unmounting | Keeps the PAM-35 live check polling with exactly one check | 2026-10-07 |
