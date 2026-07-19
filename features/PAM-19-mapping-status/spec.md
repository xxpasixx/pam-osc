# PAM-19: Mapping status — draft / community / tested

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-19 · **Last Updated:** 2026-07-19

## Why

As mappings get shared in the community (PAM-7), users need to know at a glance how much to trust one: is it a half-finished draft, something someone else shared, or a mapping actually verified on hardware? A per-mapping **status** — `draft`, `community`, `tested` — makes maturity/provenance visible in the lists and pickers where users choose a mapping.

## Dependencies

- PAM-1 (mapping file format — status is a new field on the mapping)
- PAM-11 (board-centric management — the lists/picker that show the badge)
- PAM-6 (visual editor — where the user sets it)
- PAM-7 (export/import — shared mappings carry the status); PAM-5 (v1 import default)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given any mapping, then it carries a **status** field, exactly one of `draft`, `community`, `tested`. A newly created (empty or editor-made) mapping defaults to `draft`. Older mapping files without the field load as `draft` (additive — no format-version bump).
- [ ] **AC-2** — Given mappings are listed anywhere they can be picked (Boards view mapping rows, the Setup mapping picker/dropdown, the Add-device dialog), then each shows a visually distinct **status badge** (draft / community / tested).
- [ ] **AC-3** — Given the editor (or board management), when the user changes a mapping's status, then the new value persists in the mapping file.
- [ ] **AC-4** — Given the bundled mappings that ship with the app (the v1-supported boards), then they carry status `tested` (maintainer-verified). _(Judgment call — confirm.)_
- [ ] **AC-5** — Given a shared mapping is imported (PAM-7), then the status stored in the file is preserved and shown as-is — a `tested` badge on an imported mapping is that author's own claim; a shared file with no status defaults to `community`. _(Judgment call — confirm.)_
- [ ] **AC-6** — Given a v1 mapping is imported (PAM-5), then the converted mapping defaults to `draft` (the conversion is unverified until the user checks it on hardware).

## Out of Scope

- Any server/account-based verification — `tested` is a **self-declared** claim by whoever set it, never machine-checked (no accounts, all local — data-model).
- Automatic status transitions (e.g. auto-marking `tested` after a successful output test) — possible future idea, not now.
- Filtering/sorting the Boards list by status — nice-to-have, parked in `docs/ideas.md`.

## Open Questions

- [ ] **Single enum vs. two axes** — `community` describes *provenance* (came from someone else) while `draft`/`tested` describe *maturity*; they can overlap (a community mapping you then verify is both community and tested). Modelled here as one status as requested — confirm that's intended, or split into provenance + maturity later. [NEEDS CLARIFICATION: keep single 3-value status, or split axes]
- [ ] **Bundled + import defaults** — confirm AC-4 (bundled = `tested`) and AC-5 (statusless shared file = `community`).

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Status is self-declared local metadata | No accounts/server (data-model); trust is conveyed, not enforced | 2026-07-19 |
| Additive field, default `draft`, no format bump | Backward compatible — old files simply read as draft | 2026-07-19 |
