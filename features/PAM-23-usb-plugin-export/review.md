# PAM-23: USB export of the MA3 plugin — Review

**Reviewed:** 2026-07-21 · **Verdict:** ✅ READY (Approved) — no Critical/High/Medium open

Scope: PAM-23 (all ACs) + the PAM-9 AC-9 delta (local update notice) delivered in the same build + the uncommitted PAM-18 QuickKey work (searchable dropdown + canonical-key normalization), since all three land in one commit set.

## AC verification (PAM-23)

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 — list only removable/external drives, volume name + path | ✅ Pass | `listRemovableDrives` + the three parsers filter to writable, external/USB, non-boot (unit-tested); dropdown shows label + capacity + mount path (`driveLabel`, fixed during review). |
| AC-2 — no-drive message + "Choose folder…" + Refresh | ✅ Pass | `UsbExportCard` empty state, `chooseUsbFolder` native picker, Refresh button. |
| AC-3 — create `grandMA3/gma3_library/…` layout, copy plugin + OSC | ✅ Pass | `usbTargetDirs` (wrapper constant, unit-tested); `copyPluginToUsb` copies both via `installFile`. |
| AC-4 — success shows paths + next step | ✅ Pass | "copied" result renders both targets + console import hint. |
| AC-5 — overwrite only after confirm, show on-stick version | ✅ Pass | Both targets checked up front → `exists` → confirmReplace with version; one confirm covers both files. |
| AC-6 — friendly error with source+target paths + reveal button | ✅ Pass | Error state shows both target paths; "Show bundled files…" reveal button added during review. |
| AC-7 — detection on macOS/Windows/Linux | ✅ Pass | `parseDiskutilInfo` / `parseWindowsDrives` / `parseLsblkJson`, each unit-tested with captured fixtures. |
| AC-8 — outdated stick → card hint + notification bar | ✅ Pass | `staleSelected` inline hint + `useEffect` pushNotice (deduped per drive+version). |
| AC-9 — warn on non-FAT32/exFAT, copy still allowed | ✅ Pass | `classifyFilesystem` → `readableHint`; warning line when `consoleReadable === "no"`, button stays enabled. |
| AC-10 — success shows on-stick + console nav path, no over-promise | ✅ Pass | Result shows `pluginTarget`/`oscTarget` + `consolePath`, wording "files are on the stick — navigate there if the list looks empty". |

## AC verification (PAM-9 AC-9 delta)

| AC | Verdict | Evidence |
| --- | --- | --- |
| PAM-9 AC-9 — local outdated plugin → notification-bar notice at startup | ✅ Pass | Fire-and-forget block in `index.ts` compares each install vs bundled via `comparePluginVersions`, pushes one deduped `info` notice. |

## AC verification (PAM-18 QuickKey, uncommitted)

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 — searchable dropdown of hardkey codes with readable labels | ✅ Pass | `QuickKeySelect` combobox: text filter over label+code, grouped, keyboard nav; replaces the free-text/native-select. |
| AC-3 — unknown/legacy key surfaced, not silently dropped | ✅ Pass | `resolveQuickKey` tolerates mixed-case + v1 arrow aliases; genuinely unknown keys shown as "unknown: X" and stay selectable. 73 bundled keys normalized to canonical codes + a guard test prevents future drift. |
| AC-6 — QuickKey charset sanitized before the /cmd string | ✅ Pass | `canonicalQuickKey` then `safeQuickKeyCode` (strips to `[A-Za-z0-9_]`) — verified by the security lane. |

## Security red-team (independent lane)

All four gates **solid**, no findings:
- `copyPluginToUsb` allowlist cannot be bypassed — `driveId` must byte-match a fresh drive scan or a dialog-picked folder; path traversal dead on arrival (gate runs before any write).
- `usb-export.ts` uses `execFile` (no shell) with fixed arg arrays; the PowerShell script is a compile-time constant — no injection; parse/exec failures degrade to `[]`, never crash.
- QuickKey `/cmd` string: `canonicalQuickKey` → `safeQuickKeyCode` ordering confirmed; a malicious imported key is stripped to a harmless no-op.

## Regression (independent lane)

- `npm test`: 405 pass / 0 fail. `npm run typecheck`: clean. Production build: clean.
- PAM-9 (install/OSC flow, wizard reuse), PAM-5 (v1 import — only quickKey normalized), bundled mappings (guard test passes; `EditRecipe Programmer` now a command action), PAM-2 engine (only quickKey path touched) — all behavior-preserving.

## Findings (all resolved during review)

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | AC-6 reveal button missing in the USB card error state | Added "Show bundled files…" button (reveals bundled plugin for manual copy). |
| 2 | Low | AC-1 mount path not shown in the dropdown for labeled drives | `driveLabel` now appends the mount path when it differs from the label. |

## Hardware-verify items (NOT code defects — carried to onPC/console)

- 🔴 **`grandMA3/` wrapper vs. stick root** — the copy writes `<stick>/grandMA3/gma3_library/…` (pre-mortem finding). Must confirm on a real console whether it also lists from the stick root. Isolated in the `USB_LIBRARY_WRAPPER` constant → one-line change if needed. See [[pam-hardware-verify-pending]].
- **exFAT reliability per desk** — AC-9 warning assumes FAT32-safe / exFAT-likely; confirm on the maintainer's console.
- **OSC-config toggle semantics on import** — pre-existing PAM-9 open question, unchanged here.

## Verdict

**READY — Approved.** All 10 PAM-23 ACs, PAM-9 AC-9, and the PAM-18 QuickKey ACs pass. No Critical/High/Medium open (the two found were fixed in-review). Remaining items are hardware verifications, not code defects. Not a money/credentials/personal-data feature — no hard gate.
