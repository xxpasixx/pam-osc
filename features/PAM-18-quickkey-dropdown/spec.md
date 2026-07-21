# PAM-18: QuickKey dropdown + confirmed-native key handling

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-19 · **Last Updated:** 2026-07-19

## Why

The mapping editor exposes the QuickKey action as a **free-text field** ("QuickKey (pam-osc_<KEY>)", `MappingInspector.tsx:207`), so a user must know the exact code and a typo silently produces a dead key. But the set of valid codes is fixed and already known — the ~110 hardkey codes the plugin pre-creates (`createQuickeysIfNotExists`, `pam-OSC.lua:299`). This feature turns the field into a **dropdown** fed from a single canonical list shared by the app and the plugin, so UI and plugin can never drift. It also records the outcome of the EvoFaderWing review so the "is this native?" question is settled in-repo.

## Dependencies

- PAM-6 (visual mapping editor — the inspector field being changed)
- PAM-1 (mapping schema — the `quickKey` action)
- PAM-2 (plugin — owns the QuickKey pool objects); PAM-16 (config handshake — enables the optional lazy-create path)

## Context: EvoFaderWing review (2026-07-19)

- **EvoFaderWing uses no QuickKeys.** Executors are driven by the **command line + a temporary macro** (`Set Macro … command="Page X.Y" /NoOops` + `Go Macro`) — the exact mechanism pam-osc already ported in PAM-12. Hardkeys on EvoFaderWing go over **USB HID keyboard shortcuts** (`keyboard_shortcuts/*.xml` + firmware `Keysend`), which is only possible because it is a physical USB device.
- **pam-osc cannot use the USB route** (it is an OSC bridge), and **MA3 cannot press a hardkey over OSC without a pre-existing Quickey object** (confirmed by the RBOSCKeys plugin too). So the QuickKey-pool approach is the correct, most-native OSC method for hardkeys — no change of mechanism is needed. The only open lever is *how many* QuickKeys we create (all vs. only-mapped).

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given a control assigned the QuickKey action in the editor, when the user chooses the key, then it is a **dropdown** of the supported hardkey codes (not free text), with readable labels where a raw code is cryptic (e.g. `DEF_GO` → "Go (default)").
- [ ] **AC-2** — Given the list of supported QuickKey codes, then it lives in **one canonical place** shared by the app UI and the plugin generation, so the dropdown and the plugin-created QuickKeys cannot drift (today the list exists only inside `pam-OSC.lua`).
- [ ] **AC-3** — Given an imported v1 mapping or an otherwise unknown key, when it references a code not in the list, then the UI surfaces it clearly (flagged, still selectable/removable) instead of silently accepting a dead value.
- [ ] **AC-4** — Given executor actions, then they keep using the CMD/command-line + macro path (PAM-12) — this feature does **not** move executors onto QuickKeys; it only improves the hardkey QuickKey UX.
- [ ] **AC-5** — Given pam-osc has created its QuickKey pool objects on the console, when the user triggers **"Remove QuickKeys"** (uninstall/cleanup), then **all and only** the `pam-osc_*` QuickKeys are deleted from the pool (any user-created QuickKeys are left untouched), and the action reports how many were removed. _(Delta 2026-07-19: maintainer wants an uninstall that takes all QuickKeys back out.)_
- [x] **AC-6** _(delta 2026-07-19, hardening)_ — Before a QuickKey code is embedded in the `Quickey "pam-osc_<CODE>"` `/cmd` string, it is restricted to its safe charset (`[A-Za-z0-9_]`, the canonical catalogue's alphabet), so a hand-edited/imported key cannot break out of the quoted argument (e.g. `A" ; Store Show ; …`). A stripped key matches no pool object (a safe no-op). _(The string-injection was pre-existing in PAM-2's quickKey path; the dropdown already prevents it for normal picks — this closes the imported/hand-edited hole. Low severity: `command` actions still send arbitrary console commands by design under the local-user trust model.)_

## Out of Scope

- USB HID / keyboard-shortcut triggering — **explicitly not wanted** (maintainer, 2026-07-19) and not available to an OSC bridge anyway (that's EvoFaderWing's hardware-only route). pam-osc stays on QuickKeys for hardkeys.
- Changing the executor CMD-mode mechanism (PAM-12).
- Colored/LED feedback on QuickKey buttons (PAM-10).

## Open Questions

- [ ] **Pre-create all vs. lazy-create** — today the plugin creates all ~110 QuickKey pool objects (from pool 1000), cluttering every showfile. Alternative: create only the codes the active mapping actually uses, driven by the PAM-16 handshake. _Resolved 2026-07-19 (design): keep pre-creating all codes from pool 1000, skipping forward to the next free slot on collision (current behaviour) — no lazy creation, no PAM-16 coupling._
- [ ] **QuickKey pool base (1000)** — is a fixed start pool safe against colliding with user objects, or should the base be configurable / chosen in a higher free range? Verify on onPC.
- [ ] **Uninstall scope (AC-5)** — should the cleanup stay QuickKey-only (as asked), or grow into a full "remove pam-osc from this console" that also deletes the `pam-osc_CMD` macro (PAM-12), the two OSC entries (PAM-13), and the plugins themselves? And what triggers it — the app over OSC, or an uninstall component inside the merged plugin (PAM-13)? _Resolved 2026-07-19 (design): **full** uninstall — QuickKeys + `pam-osc_CMD` macro + both OSC entries + the plugin, removed comms-last. Trigger location is a build detail; the OSCBase delete + plugin self-removal are onPC-pending._

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Dropdown from a shared canonical key list | Free text invites typos → dead keys; the valid set is fixed and already known, so a dropdown is strictly better and a shared list prevents UI/plugin drift | 2026-07-19 |
| Keep QuickKeys for hardkeys (confirmed native) | EvoFaderWing's non-QuickKey routes (CMD for executors — already matched; USB HID for hardkeys — impossible for an OSC bridge) leave QuickKeys as the only native OSC hardkey method | 2026-07-19 |
