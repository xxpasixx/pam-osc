# PAM-23: USB export of the MA3 plugin

<!-- This file (spec.md) is the stable CONTRACT — it defines WHAT, not HOW.
     Owner: /spec (creates and updates — updates are deltas, IDs never renumbered).
     READ-ONLY during /build. Technical design lives in design.md, verification in review.md.
     Lite spec: Why + ACs + Out of Scope is enough. Full spec (risk work): all sections. -->

## Status: Spec'd

**Created:** 2026-07-21 · **Last Updated:** 2026-07-21

## Why

Users running a **real GrandMA3 console** (not onPC) have no local MA3 install for the app to write into — the only way onto the desk is a USB stick imported at the console. Today PAM-9 AC-4 only *shows instructions* for that ("create this folder layout on the stick by hand"). This feature makes it one click: the app lists the connected removable drives, and copying the bundled plugin **and** OSC config onto the chosen stick — in the exact `gma3_library/…` layout the console imports from — happens for you.

## Dependencies

- PAM-9 (MA3 setup assistant — owns local plugin/OSC-config install; this reuses its bundled files and `installFile()` copy logic and complements its AC-4 USB route)
- PAM-3 (setup & settings UI — where the export UI lives)

## Acceptance Criteria

**Format:** **AC-N** — Given [a starting state] / When [the user acts] / Then [the observable result]

- [ ] **AC-1** — Given one or more removable/external drives are connected, when I open the USB-export card, then it lists **only removable/external volumes** (the internal system disk is filtered out so I can't write to it by accident), each shown by its volume name and mount path.
- [ ] **AC-2** — Given no removable drive is detected, when the card renders, then it says so clearly and offers a **"Choose folder…"** fallback (a manual folder picker) plus a **Refresh** action to re-scan after I plug a stick in.
- [ ] **AC-3** — Given I select a target drive (or a manually chosen folder) and click **"Copy to USB"**, then the app creates the console-import layout on it if missing — **`grandMA3/gma3_library/datapools/plugins/`** and **`grandMA3/gma3_library/inout/osc/`** (the `grandMA3/` wrapper the console browses external media from — see Open Questions) — and copies the bundled **plugin** (`pam-osc.xml` → `…/datapools/plugins/`) **and** **OSC config** (`pam-osc.xml` → `…/inout/osc/`) into them.
- [ ] **AC-4** — Given the copy succeeds, then the app shows the full target paths and the next step (import via the console's plugin pool / OSC menu), consistent with the PAM-9 install wording.
- [ ] **AC-5** — Given a `pam-osc.xml` already exists at a target path on the stick, when I copy, then it is replaced **only after confirmation** (same overwrite-confirm rule as PAM-9 AC-2); the version already on the stick is shown where known.
- [ ] **AC-6** — Given the copy fails (drive removed mid-copy, read-only/permission error, drive full), then the app shows a friendly error carrying the exact **source and target paths** so I can copy by hand, plus a **"reveal bundled files"** button (Finder/Explorer) — mirroring PAM-9 AC-3.
- [ ] **AC-7** — Given the app runs on macOS, Windows, or Linux, then drive detection works on each (Linux especially, where there is no onPC and USB is the *only* route to a console); the exact per-OS detection is /design work.
- [ ] **AC-8** — Given a selected/detected removable drive already contains a `pam-osc.xml` (plugin) whose version is **older than the bundled** version, then the USB-export card **and** the app's notification bar ([NoticesArea]) show a dismissible "plugin update available on this stick" hint (on-stick version → bundled version), analogous to PAM-9 AC-7; when the stick's version equals the bundled one, no update hint is shown. _(Added 2026-07-21: maintainer wants the "new version not yet on the stick" state surfaced, not just silently overwritable.)_
- [ ] **AC-9** — Given a selected target drive whose filesystem the console likely cannot read (Mac-formatted APFS/HFS+, or ext4), when I copy or select it, then the app shows a clear warning that GrandMA3 expects **FAT32** (exFAT usually works but is not guaranteed per desk) so a silent "copied but the console shows nothing" failure is pre-empted; the copy is still allowed (the user may know their desk). _(Added 2026-07-21 from the pre-mortem: the copy succeeds onto any mounted volume even when the console can't read it.)_
- [ ] **AC-10** — Given a successful copy, when the result is shown, then it displays both the **exact on-stick path** written and the **exact console navigation path** to import from (plugin pool import / OSC menu), so a user can hand-navigate even if the structured import view is empty — the message never claims the console "will" see it, only that the files are on the stick. _(Added 2026-07-21 from the pre-mortem: "copied" ≠ "importable".)_

## Out of Scope

- Copying **mappings**, device definitions, or app settings to the stick (this is the MA3 plugin only; community sharing of mappings is PAM-7).
- Copying the **app installer** itself to the stick.
- Reading anything back **from** the stick / importing mappings from a stick.
- Pushing the plugin to the console **over the network** (unchanged: still a P2 roadmap idea, see PAM-9).
- Auto-importing/auto-starting the plugin inside MA3 (chicken-and-egg; unchanged from PAM-9).
- Ejecting/unmounting the drive after copy (the OS handles safe removal).

## Edge Cases

- **EC-1** — A drive is unplugged between listing and copy → AC-6 error (target vanished), the list refreshes.
- **EC-2** — Several sticks connected → all listed; the user picks (nothing preselected, to avoid writing to the wrong one).
- **EC-3** — The chosen drive is read-only / write-protected → AC-6 friendly error, not a raw exception.

## Open Questions

- [ ] **🔴 `grandMA3/` wrapper (verify on hardware)** — the pre-mortem found the console browses external media from `<stick>/grandMA3/gma3_library/…`, not the stick root. AC-3 now writes the `grandMA3/` wrapper as the default. **Must be confirmed on a real console** (does it list a plugin from `<stick>/gma3_library/…` root, or only under `grandMA3/`?). If the root works too, the wrapper is harmless; if only the wrapper works, this fix is essential. Single isolated constant in the code so it's a one-line change either way. [VERIFY ON HARDWARE — see [[pam-hardware-verify-pending]]]
- [x] **Removable-vs-external detection per OS** — _Resolved by pre-mortem research (2026-07-21): the OS "removable" bit alone is wrong — external USB HDDs/SSDs report as "Fixed" on Windows/Linux and would be hidden. Filter rule = **has a writable mountpoint AND (removable OR bus is USB) AND is not the boot/system volume**. Dependency-light approach: shell out and parse `diskutil info -plist` (macOS, needs `Internal:false` + writable + physical, and exclude the `/` symlink), `lsblk --json -o NAME,RM,HOTPLUG,TRAN,RO,MOUNTPOINT,FSTYPE` (Linux), PowerShell `Get-Disk`+`Get-Volume` joining `BusType=USB`/`DriveType=Removable` (Windows; avoid deprecated `wmic`). No native npm dep (no `drivelist`); parsers unit-tested with captured fixtures. Exact commands are /design work._
- [ ] **exFAT vs FAT32 default guidance** — FAT32 is the safe console default but caps files at 4 GB and the whole stick capacity awkwardly; exFAT usually works but is per-desk unverified. Decide in /design how strong the AC-9 warning is (warn-only vs. block). [VERIFY ON HARDWARE]
- [ ] **Volume labels** — is showing the OS volume name enough to disambiguate two identical sticks, or should capacity/free space be shown too? Decide in /design.

## Decision Log

### Product Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Separate feature (PAM-23), not a PAM-9 delta | Maintainer's call (2026-07-21): track the USB export as its own item even though it complements PAM-9's AC-4 | 2026-07-21 |
| Copy plugin **and** OSC config | Same scope as the local install (PAM-9 AC-2 + AC-2b) so the console is fully set up from the stick, not just the plugin | 2026-07-21 |
| List removable drives only (+ manual folder fallback) | Writing to the internal system disk by accident is the real risk; a filtered list plus an explicit "choose folder" escape hatch is safest | 2026-07-21 |
| Write the `grandMA3/` wrapper folder on the stick (AC-3) | Pre-mortem: the console browses external media from `grandMA3/gma3_library/…`, not the root; harmless if root also works, essential if it doesn't — pending hardware check | 2026-07-21 |
| Warn on non-FAT32/exFAT targets (AC-9) | Mac-formatted (APFS/HFS+) sticks copy fine but are unreadable by the console — a silent field failure the warning pre-empts | 2026-07-21 |
| Detect drives by shelling out (no native dep) | Keeps the project's zero-native-deps stance (no `drivelist`); parsers are unit-testable with captured OS-command fixtures | 2026-07-21 |
