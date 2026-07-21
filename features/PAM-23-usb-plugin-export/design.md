# PAM-23: USB export of the MA3 plugin — Design

<!-- Technical design (HOW). Owner: /design. Plain language, no code.
     Read alongside spec.md (the WHAT) and review.md (the verdict). -->

**Created:** 2026-07-21 · Covers spec ACs 1–10 (+ PAM-9 AC-9 for the shared update notice)

## Overview

Adds a fourth card to the MA3 setup tab: **"Copy to USB stick"**. It lists connected removable drives, and on one click copies the bundled plugin **and** OSC config onto the chosen stick in the layout a GrandMA3 console imports from. It reuses PAM-9's bundled-file resolution and `installFile()` copy logic; the only genuinely new machinery is (a) cross-platform removable-drive detection by shelling out to OS commands (no native dependency) and (b) a shared "plugin update available" notice, surfaced for both the local disk (PAM-9 AC-9) and the stick (PAM-23 AC-8).

## A) Component Structure

```
Main process (app/src/main/)
├── usb-export.ts                 NEW — pure logic + thin OS-command exec
│   ├── listRemovableDrives()       runs the per-OS command, returns RemovableDrive[]
│   ├── parseDiskutilPlist(xml)     macOS parser (unit-tested with fixtures)
│   ├── parseLsblkJson(json)        Linux parser (unit-tested with fixtures)
│   ├── parseWindowsDrives(json)    Windows parser (unit-tested with fixtures)
│   ├── classifyFilesystem(fs)      → "yes" | "likely" | "no" | "unknown"
│   └── usbTargetDirs(driveRoot)    → { pluginsDir, oscDir } under the grandMA3/ wrapper
├── ma3-install.ts                REUSED — installFile(), readPluginVersion()
│   └── comparePluginVersions()     NEW — 4-part numeric version compare (also used by PAM-9 AC-9)
└── index.ts                      NEW IPC handlers + startup update-notice

Preload (app/src/preload/index.ts)
└── listRemovableDrives, copyPluginToUsb, chooseUsbFolder   NEW passthroughs

Renderer (app/src/renderer/src/components/)
├── Ma3SetupView.tsx              + <UsbExportCard> (Step 1b, own card)
└── App.tsx                       pushes the stick update notice via existing pushNotices path
```

## B) Data Model (IPC shapes — `app/src/shared/ipc.ts`)

All new types are transient IPC payloads — **nothing is persisted** (consistent with data-model.md: only settings/mappings/devices persist).

**`RemovableDrive`** — one candidate target in the dropdown (AC-1):
| Field | Type | Notes |
| --- | --- | --- |
| `id` | text | Stable key = the mount path (macOS/Linux) or drive root (Windows, e.g. `E:\`). Also the write root. |
| `label` | text | Volume name; empty label falls back to the mount path / drive letter (AC: never require a label). |
| `filesystem` | text \| undefined | e.g. `FAT32`, `exFAT`, `APFS`, `HFS+`, `NTFS`, `ext4`; undefined when unknown. |
| `consoleReadable` | `"yes" \| "likely" \| "no" \| "unknown"` | Derived by `classifyFilesystem`: FAT32→yes, exFAT→likely, APFS/HFS+/NTFS/ext4→no, else unknown (drives AC-9). |
| `capacityBytes` | number \| undefined | Optional, for disambiguating two identical sticks. |
| `freeBytes` | number \| undefined | Optional. |
| `hasExistingPlugin` | boolean | True if a `pam-osc.xml` already exists at the stick's plugin path. |
| `existingPluginVersion` | text \| undefined | Its version when readable (feeds AC-5 + AC-8). |

**`UsbExportInfo`** — returned by `listRemovableDrives()`:
| Field | Type | Notes |
| --- | --- | --- |
| `drives` | `RemovableDrive[]` | Empty array ⇒ card shows the "no drive / choose folder / refresh" state (AC-2). |
| `bundledVersion` | text \| undefined | The plugin version the app ships (compare source for AC-8). |

**`UsbCopyResult`** — returned by `copyPluginToUsb(driveId, overwrite)`:
- `{ status: "copied"; pluginTarget: text; oscTarget: text; consolePath: text }` — `consolePath` is the human console-navigation hint (AC-10).
- `{ status: "exists"; existingPluginVersion?: text }` — a target file is present and `overwrite` was false; UI confirms then re-calls with `overwrite: true` (AC-5).
- `{ status: "error"; error: text; pluginTarget: text; oscTarget: text }` — friendly failure carrying both target paths for manual copy (AC-6).

**`chooseUsbFolder()`** → `{ status: "chosen"; path: text } | { status: "canceled" }` — native folder picker fallback (AC-2).

## C) Behaviors & Access

**Drive detection (`listRemovableDrives`)** — main process only. Per OS:
- **macOS:** `diskutil list -plist` + `diskutil info -plist <mount>`; keep a volume only when `Internal == false` **and** `WritableVolume == true` **and** it is physical (not a disk-image/DMG), and exclude the boot volume (`/` and its `/Volumes/Macintosh HD` symlink).
- **Linux:** `lsblk --json -o NAME,LABEL,RM,HOTPLUG,TRAN,RO,MOUNTPOINT,FSTYPE,SIZE`; keep partitions with a non-empty `MOUNTPOINT`, `RO == false`, and (`RM == true` **or** `HOTPLUG == true` **or** `TRAN == "usb"`).
- **Windows:** PowerShell `Get-Disk` + `Get-Volume` (JSON out); keep volumes whose disk `BusType == "USB"` **or** `DriveType == "Removable"`, with a drive letter. Do **not** use deprecated `wmic`.
- **Filter rule (all OSes):** *writable mountpoint AND (removable OR USB bus) AND not the boot/system volume* — never the "removable" bit alone (external USB HDDs report as fixed). Anything that fails to parse ⇒ empty list, not a crash (AC-2 fallback still available).

**Copy (`copyPluginToUsb`)** — main process:
1. **Security gate (mirrors PAM-9's base check):** the `driveId` must be either (a) present in a *fresh* `listRemovableDrives()` call, or (b) in the session allowlist of paths returned by `chooseUsbFolder` (a native, user-driven dialog). Any other path ⇒ `error` "unknown drive — rescan". The renderer can never point the copy at an arbitrary path.
2. Compute targets via `usbTargetDirs(driveId)` = `<driveId>/grandMA3/gma3_library/datapools/plugins/pam-osc.xml` and `…/inout/osc/pam-osc.xml`.
3. Reuse `installFile(bundledPluginXml, pluginsDir, overwrite)` and `installFile(bundledOscXml, oscDir, overwrite)`. If the first returns `exists` and `overwrite` is false, return `exists` before copying anything (atomic-ish: confirm once, then both).
4. Bundled source paths resolve exactly as PAM-9 does (`process.resourcesPath/...` packaged, `../gma3_library/...` in dev) — reuse the same `bundledPluginXml`/`bundledOscXml` constants already in index.ts.

**Filesystem warning (AC-9)** — derived, not enforced: the card shows `consoleReadable` as a colored hint next to each drive and a warning line before copy when it is `no`; the copy button stays enabled (the user may know their desk).

**Update-available notice (shared, PAM-9 AC-9 + PAM-23 AC-8):**
- **Local (AC-9):** at app startup the main process already detects installs; for each install whose `installedVersion` is older than `bundledVersion` (via `comparePluginVersions`), it adds one `info` Notice — `"MA3 plugin update available — installed X, bundle Y"` — to the initial snapshot `notices`, so it shows without opening the assistant. De-duped to one notice even with several installs.
- **Stick (AC-8):** after the USB card lists drives, if any drive's `existingPluginVersion` is older than `bundledVersion`, the card shows an inline "update available on this stick" hint **and** pushes one `info` Notice via the existing `pushNotices` path. Equal versions ⇒ no hint/notice.

**`comparePluginVersions(a, b)`** — splits on `.`, compares numerically part-by-part (4-part MA3 versions like `2.0.0.1`); missing parts treated as 0; returns <0 / 0 / >0. Unreadable version ⇒ treated as "unknown", no update claim.

## D) Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| Shell out to `diskutil`/`lsblk`/PowerShell, parse output | Zero native deps (project actively avoids native modules like serialport); `systeminformation` internally does the same | `drivelist` (native), `systeminformation` (pure-JS dep) | We own three parsers; but they're unit-testable with captured fixtures and add no ABI/rebuild risk | 2026-07-21 |
| Filter on "external OR USB, not system", not the removable bit | External USB HDDs report as "Fixed" and would be silently hidden | Match `removable == true` only | Slightly broader list; mitigated by excluding the boot volume + writable check | 2026-07-21 |
| Write the `grandMA3/` wrapper on the stick | Pre-mortem: console browses external media from `grandMA3/gma3_library/…` | Write `gma3_library/` at the stick root (old spec) | If root also works, wrapper is harmless; isolated one-line constant if hardware says otherwise | 2026-07-21 |
| Copy plugin + OSC config as one action | Same scope as local install; a stick should fully set up the console | Two separate buttons (like PAM-9 rows) | One confirm covers both; simpler UX | 2026-07-21 |
| Session allowlist for dialog-chosen folders | Keeps the "renderer can't pick an arbitrary path" guarantee while allowing the manual fallback | Trust any renderer-supplied path | A tiny bit of main-process state; worth it for the security parity | 2026-07-21 |
| Warn (not block) on non-FAT32/exFAT | The user may know their desk reads exFAT/NTFS; blocking would be paternalistic and sometimes wrong | Hard-block copy on APFS/HFS+ | A determined user can still footgun; the warning is prominent | 2026-07-21 |

## E) Dependencies

- **None new.** `node:child_process` (built-in) runs the OS commands; `node:fs/promises` (already used) does the copy; `dialog` (Electron, already used for other pickers) does the folder fallback.

## F) Build Plan

- **Level 1 — core logic (`app/src/main/usb-export.ts` + `ma3-install.ts`):** the three parsers, `classifyFilesystem`, `usbTargetDirs`, `comparePluginVersions`. Unit tests with captured `diskutil`/`lsblk`/PowerShell fixture strings. Serves AC-1, AC-3, AC-9, and version compare. *(No Electron — fully testable in CI.)*
- **Level 2 — IPC + wiring (`ipc.ts`, `index.ts`, `preload/index.ts`):** channels `listRemovableDrives`, `copyPluginToUsb`, `chooseUsbFolder`; the security gate; the startup local update notice. Serves AC-3, AC-5, AC-6, PAM-9 AC-9.
- **Level 3 — UI (`Ma3SetupView.tsx`, small `App.tsx` wiring):** the `UsbExportCard` (drive dropdown, refresh, choose-folder, filesystem hint, copy + confirm, result with both paths, update hint). Serves AC-1, AC-2, AC-4, AC-8, AC-10.

Levels are sequential (each needs the one below); the three parsers within Level 1 are file-disjoint and can be built in parallel.

## Implementation notes (build, 2026-07-21)

- Built on `v2` (repo convention — recent commits land on v2). New files: `app/src/main/usb-export.ts` (+ `.test.ts`), `app/src/shared/plugin-version.ts`. `comparePluginVersions` lives in the node-free `shared/plugin-version.ts` so the renderer can import it; `ma3-install.ts` re-exports it for main-process callers.
- **Edge case handled:** the copy checks BOTH target files' existence up front and returns `exists` if either is present — so one confirm covers plugin + OSC and an existing OSC config is never silently skipped while reporting "copied".
- **Security gate:** `copyPluginToUsb` accepts a target only if it's in a fresh `listRemovableDrives()` scan or in the session's `pickedUsbFolders` (dialog-picked) — mirrors PAM-9's base check and PAM-5's file check.
- **Not unit-tested (Electron-bound, per project pattern):** the exec wrapper in `usb-export.ts`, the IPC handlers, and the startup notice — same boundary as `installMa3Asset`. The per-OS parsers, `usbTargetDirs`, `classifyFilesystem`, and `comparePluginVersions` are unit-tested (18 tests).
- **UI:** `UsbExportCard` shows only in the MA3 tab (`mode === "full"`), not in the first-run wizard steps.
- Full suite: 405 tests pass; typecheck + production build clean.

## Open items carried from spec (hardware verification)

- 🔴 `grandMA3/` wrapper vs. stick root — verify on a real console; single constant `usbTargetDirs` if it must change. See [[pam-hardware-verify-pending]].
- exFAT reliability per desk — the AC-9 warning wording assumes FAT32-safe / exFAT-likely.
