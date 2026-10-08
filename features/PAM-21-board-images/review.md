# PAM-21 — Review

**Verdict:** Approved (no Critical/High). App-verifiable; the only "pending" is
the maintainer dropping actual photos (a user action, not a code blocker).

## AC verification

| AC                                  | Result | Evidence                                                                                                                                           |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 convention `images/<id>.{ext}` | ✅     | `board-image.test.ts`: `images/conv-board.png` → `data:image/png;base64,…`.                                                                        |
| AC-2 `image` override + MIME        | ✅     | override `shot.jpg` → `data:image/jpeg;base64,…`; schema field additive/optional (existing files unchanged).                                       |
| AC-3 placeholder, never broken      | ✅     | no file → `deviceImage` returns `null`; `BoardThumb` renders `.board-thumb--empty` placeholder. Unknown id → null.                                 |
| AC-4 traversal-safe                 | ✅     | schema regex rejects `../…` and `sub/dir.png`; resolver also guards `basename(name)===name` and reads only `images/` with a whitelisted extension. |
| AC-5 ships no third-party images    | ✅     | `resources/devices/images/` contains only `README.md` (licence rule + naming + size).                                                              |

## Code review

- Renderer never touches the FS: one-shot IPC (`getDeviceImage`) → base64 data
  URL, matching the existing `window.pamOsc` invoke pattern. `BoardThumb`
  cancels its async set on unmount (`alive` flag) — no state-after-unmount.
- Read whitelist = the MIME map keys; unknown extension → skipped. Missing/
  unreadable file → caught → next candidate → `null` (never throws).
- Catalog stays Electron-free (uses its existing `node:fs/promises`); main just
  forwards. Build clean, no node builtins pulled into the renderer bundle
  (checked after the earlier blank-UI incident).
- 375/375 tests, typecheck + production build green.

## Notes / parked

- No image cache (fetch is cheap, per board). If the Boards list grows large, a
  main-side LRU is a trivial follow-up.
- Bundled device JSONs intentionally unedited — convention means dropping
  `resources/devices/images/<id>.png` is enough.
- Licence guard is documentation + the maintainer's discipline; the app cannot
  detect a copyrighted photo. README states the rule plainly.

---

## Re-review 2026-10-08 — delta AC-5…AC-7 (commit 2ef75ea) + X32 removal check (48c40b1)

**Verdict:** Approved (light review; no Critical/High). Two Low, two Info.

### AC verification (delta)

| AC                                    | Result | Evidence                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-5 only redistributable images      | ✅     | All four files trace to Wikimedia Commons; licences re-checked against the Commons API (extmetadata) on 2026-10-08: APC set (Peter VanLane) CC BY 2.0, MPX16 (derivative by Clusternote of David J's CC BY 2.0 original) CC BY 3.0, Novation Launchpad (Marc Majcher) CC BY-SA 2.0 — all allow redistribution incl. commercial. README updated (licence rule, naming, size). |
| AC-6 CREDITS row per image, not GPL   | ✅     | `resources/devices/images/CREDITS.md`: one row per file with title+source link, author, licence link; header states "not covered by the repo's GPL-3.0", changes ("cropped and downscaled"), trademark disclaimer. Shipped inside the installer via `extraResources: ../resources` (`app/electron-builder.yml:13-15`).                                                   |
| AC-7 whole image, letterboxed         | ✅     | `app/src/renderer/src/styles.css:1403` `object-fit: contain`; selector scoped to `.board-thumb img`, container already flex-centred with `--surface-2` background → bars blend in. No other consumer of the rule. Images range 320×154 (≈2:1) to 314×320 — all fit. Code inspection only (no visual run).                                                         |

### Checks

- **Naming → loader pickup:** `apc-40-mk2.jpg`, `apc-mini.jpg`, `mpx16.jpg`, `launchpad.jpg` match the bundled device ids exactly; none of the device JSONs sets an `image` override, so `Catalog.deviceImage` (`app/src/main/catalog.ts:113-131`) resolves them via the `png → jpg → jpeg → webp` convention.
- **Sizes:** 13.9–22.5 KB each, ≤320 px long edge — far below the README's 150 KB guidance and the 1 MB pre-commit limit.
- **X32 removal (48c40b1):** no dangling references in `resources/`, `app/src`, `app/scripts`, README. Remaining hits are historical prose only (`app/src/core/engine/cc-button.test.ts:13` comment noting the removal; PAM-28/PAM-30 spec/review text; `0x32` in `apc-40-mk2.json` is a false positive). Bundled inventory test updated.
- **Tests:** `bundled.test.ts` + `board-image.test.ts` 15/15 green; `npm run typecheck` clean. Full suite not run (light review).

### Findings

| ID   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1  | Low      | AC-6 has no automated guard. Nothing fails if someone drops an image without a CREDITS row (or with a name that matches no device id). Suggest a small check in `bundled.test.ts`: every non-`.md` file in `resources/devices/images/` is listed in `CREDITS.md` and its basename is a bundled device id.                                                                                                                  |
| F-2  | Low      | `CREDITS.md:14` (mpx16) links only the derivative file page. Attribution is valid as is (the derivative page credits David J), but naming the CC BY 2.0 original (`File:Akai_MPX16_SD_Sample_Recorder_and_Player_(by_David_J).jpg`) in the row would make the chain self-contained. AC-6 also asks for "changes made" per row — currently stated once in the header paragraph; acceptable since it is identical for all four. |
| I-1  | Info     | **CC BY-SA 2.0 (launchpad.jpg):** share-alike binds only the image and adaptations of it — the crop must stay CC BY-SA 2.0 (CREDITS says so). Bundling it next to GPL code is a "Collective Work" under BY-SA 2.0 §1, so SA does not reach the app and the GPL does not reach the image. Note: BY-SA 2.0 is not GPL-compatible (only BY-SA 4.0 → GPLv3 one-way), so the image must never be relicensed or merged into GPL artwork — keep the "not GPL" statement. |
| I-2  | Info     | No in-app attribution; credits live in the repo and the packaged `resources/devices/images/CREDITS.md`. Reasonable for the medium. Optionally link it from an About/licence screen later. `apc-mini-mk2` and `launchpad-mini-mk3` have no photo (placeholder) — correct; do not reuse the mk1 photos for them.                                                                                                                    |

Not legal advice — licence reading is based on the CC 2.0/3.0 legal code and Commons metadata as of 2026-10-08.
