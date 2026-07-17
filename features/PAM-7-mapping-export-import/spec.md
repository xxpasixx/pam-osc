# PAM-7: Mapping/device export & import + support package (community sharing)

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: DRAFT — pending maintainer approval

> Reworked 2026-07-17 after maintainer feedback: **no envelope format** — sharing uses the
> raw mapping/device files themselves; a separate "support package" exports everything at
> once (all devices, all mappings, the latest log). Open questions below.

**Created:** 2026-07-17 · **Last Updated:** 2026-07-17 (maintainer direction: raw single-file sharing + full package)

## Why

Sharing is the point of the mapping format (PRD P1), but today the only way to share a mapping or a custom board is to dig the JSON out of the app's user data folder by hand. Export/import from the UI closes the loop: Discord users trade the actual mapping/device files, and one "support package" export captures a user's whole setup (devices, mappings, latest log) for debugging and backup.

## Dependencies

- PAM-1 (device & mapping file format)
- PAM-3 (setup & settings UI — catalog, copy-on-activate port rebinding)
- PAM-6 (visual mapping editor — Boards tab is the natural home for the actions)

## Open questions (block /build)

1. **Package import (restore)?** Recommendation: out of scope for this round — the package is an export for support/backup; restoring stays manual (copy files back). Say the word and it becomes an AC.
2. **Session log file.** The app writes no log file today — AC-10 needs one. Recommendation: introduce a simple rotating session log (engine/OSC/MIDI events, errors) in the user data folder as part of this feature (AC-11); alternative: separate feature, package ships without a log until then.
3. **settings.json in the package?** Recommendation: yes — console IP/ports help support and contain no secrets (local network values only).
4. **Package format.** Recommendation: `.zip` with `devices/`, `mappings/`, `settings.json`, `log/`, and a small manifest (app version, date); alternative: one big JSON.

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given any mapping in the catalog (bundled or user), when I choose "Export" on it, then a save dialog writes **the raw mapping file** to the location I pick — byte-compatible with the files the loader reads.
- [ ] **AC-2** — Given a mapping file, when I import it, then it is validated against the strict schema before anything is written; a valid mapping lands as a new user mapping file, appears in the catalog, and is **not** auto-activated.
- [ ] **AC-3** — Given an import whose id already exists locally, then user content is never overwritten — the imported entity gets a suffixed unique id (same rule as duplicate/v1 import).
- [ ] **AC-4** — Given a mapping import referencing a board that is neither bundled nor local, then the import is refused with a friendly message naming the missing board id and pointing at "import its device file first" — never a silently broken catalog entry.
- [ ] **AC-5** — Given an invalid, oversized (loader cap: 1 MB), or malformed file, then the import reports a friendly error and writes nothing; export refuses to produce a file the loader would reject on re-import.
- [ ] **AC-6** — Given a successfully imported mapping, when I activate it in Setup, then the normal port-rebind flow applies (the exporter's MIDI port name never binds automatically on my machine).
- [ ] **AC-7** — Given an imported mapping that contains free-text MA3 commands, then the import summary shows a one-line caution that button commands run verbatim on the console (carries over the PAM-5 review's BUG-7 note to the sharing surface).
- [ ] **AC-8** — Given any board in the Boards tab, when I choose "Export" on it, then a save dialog writes **the raw device definition file** to the location I pick.
- [ ] **AC-9** — Given a device definition file, when I import it, then it is validated the same way (AC-3/AC-5 rules apply); bundled definitions are never overwritten or shadowed without the id-suffix rule.
- [ ] **AC-10** — Given the app, when I choose "Export support package", then one archive is written containing **all** device definitions and mappings visible in the app (user files at minimum), the current settings, the latest session log, and the app version — enough for someone else (or future me) to reproduce the setup.
- [ ] **AC-11** — Given a running session, then the app writes a session log file (engine/OSC/MIDI lifecycle events, errors) to the user data folder with a bounded size/rotation, so AC-10 always has a "latest log" to include. _(Pending open question 2.)_

## Security notes (same bar as PAM-5/PAM-6 reviews)

- Imported ids pass the kebab-case `idSchema` before becoming filenames — no path traversal (import AND package paths).
- Strict schemas (`strictObject`) — unknown keys rejected; prototype-pollution surface closed.
- Size cap enforced on read **and** write; imports never touch bundled files.
- The log never records mapping *content* beyond ids/names — no surprise data in a shared package.

## Out of Scope

- Online gallery, URL import, or any cloud/sync (PRD non-goal — sharing is files)
- Package **import**/restore (pending open question 1 — default: manual restore)
- Auto-updating previously imported mappings ("this file changed upstream")
- Migration/versioning beyond `formatVersion: 1` validation
