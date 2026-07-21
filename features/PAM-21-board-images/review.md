# PAM-21 — Review

**Verdict:** Approved (no Critical/High). App-verifiable; the only "pending" is
the maintainer dropping actual photos (a user action, not a code blocker).

## AC verification

| AC | Result | Evidence |
| -- | ------ | -------- |
| AC-1 convention `images/<id>.{ext}` | ✅ | `board-image.test.ts`: `images/conv-board.png` → `data:image/png;base64,…`. |
| AC-2 `image` override + MIME | ✅ | override `shot.jpg` → `data:image/jpeg;base64,…`; schema field additive/optional (existing files unchanged). |
| AC-3 placeholder, never broken | ✅ | no file → `deviceImage` returns `null`; `BoardThumb` renders `.board-thumb--empty` placeholder. Unknown id → null. |
| AC-4 traversal-safe | ✅ | schema regex rejects `../…` and `sub/dir.png`; resolver also guards `basename(name)===name` and reads only `images/` with a whitelisted extension. |
| AC-5 ships no third-party images | ✅ | `resources/devices/images/` contains only `README.md` (licence rule + naming + size). |

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
