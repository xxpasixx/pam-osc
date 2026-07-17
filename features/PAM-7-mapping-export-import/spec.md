# PAM-7: Mapping export/import as file (community sharing)

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: DRAFT — pending maintainer approval

> Drafted autonomously on 2026-07-17 while the maintainer was away. **Not finalized** —
> the open decision below (single file vs. bundle) shapes a community-facing file
> format and needs the maintainer's call before /build starts.

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17

## Why

Sharing is the point of the mapping format (PRD P1: "Mapping export/import as file — community sharing"), but today the only way to share a mapping is to dig the JSON out of the app's user data folder by hand — and a mapping for a **custom board** is unusable on the receiving side because the board definition never travels with it. Export/import from the UI closes the loop: Discord users trade one file, the app does the rest.

## Dependencies

- PAM-1 (device & mapping file format)
- PAM-3 (setup & settings UI — catalog, copy-on-activate port rebinding)
- PAM-6 (visual mapping editor — Boards tab is the natural home for the actions)

## Open decision (blocks /build)

**Export shape.** Recommendation: one export file (`.pamosc.json`) that always carries the mapping and — only when the board is user-created — embeds the device definition alongside it (envelope with `formatVersion`, `mapping`, optional `device`). Alternative: export the raw mapping file only and let custom-board authors share two files. The envelope is recommended because "one file = one working setup" is the whole UX promise; raw-file import should still be accepted for hand-copied files.

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given any mapping in the catalog (bundled or user), when I choose "Export" on it, then a save dialog writes a single share file to the location I pick; if the mapping's board is user-created, the board definition is embedded in the same file.
- [ ] **AC-2** — Given a share file (or a raw mapping JSON), when I import it, then it is validated against the strict schema before anything is written; a valid mapping lands as a new user mapping file, appears in the catalog, and is **not** auto-activated.
- [ ] **AC-3** — Given an import whose embedded board id or mapping id already exists locally, then user content is never overwritten: imported entities get a suffixed unique id, and a mapping arriving with an embedded board is retargeted to the id its board actually received.
- [ ] **AC-4** — Given an import referencing a board that is neither bundled nor embedded nor already local, then the import is refused with a friendly message naming the missing board id — never a silently broken catalog entry.
- [ ] **AC-5** — Given an invalid, oversized (loader cap: 1 MB), or malformed share file, then the import reports a friendly error and writes nothing; export refuses to produce a file the loader would reject on re-import.
- [ ] **AC-6** — Given a successfully imported mapping, when I activate it in Setup, then the normal port-rebind flow applies (the exporter's MIDI port name never binds automatically on my machine).
- [ ] **AC-7** — Given an imported mapping that contains free-text MA3 commands, then the import summary shows a one-line caution that button commands run verbatim on the console (carries over the PAM-5 review's BUG-7 note to the sharing surface).

## Security notes (same bar as PAM-5/PAM-6 reviews)

- Imported ids pass the kebab-case `idSchema` before becoming filenames — no path traversal.
- Strict schemas (`strictObject`) — unknown keys rejected; prototype-pollution surface closed.
- Size cap enforced on read **and** write; imports never touch bundled files.

## Out of Scope

- Online gallery, URL import, or any cloud/sync (PRD non-goal — sharing is files)
- Exporting device definitions on their own (a board without a mapping has no sharing story yet)
- Auto-updating previously imported mappings ("this file changed upstream")
- Migration/versioning beyond `formatVersion: 1` validation
