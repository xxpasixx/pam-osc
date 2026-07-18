# PAM-9: MA3 setup assistant — Review

**Reviewed:** 2026-07-18 · **Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Reviewer pass:** AC verification + code review + security red-team (path traversal / IPC boundary). Regression: shares the Status view and settings draft with PAM-3/PAM-4 (Live-adjacent) — exercised, no breakage.

## Verdict: READY — Approved

No Critical/High. Two Low bugs (BUG-2 borderline Medium against AC-3's literal wording). Security guard on the file-write IPC boundary is sound. 313/313 tests pass, typecheck + build green.

Two non-code items remain tracked as spec Open Questions (not blockers): the bundled OSC config carries only the Receive entry so far, and SendOSC-by-name + ports need onPC confirmation.

## AC results

| AC | Verdict | Notes |
| -- | ------- | ----- |
| AC-1 | PASS | Detected installs listed. `ma3BaseCandidates` returns one shared-library base per OS (onPC shares `gma3_library` across versions) — "all versions" collapses to one row by design (design.md). |
| AC-2 | PASS | Plugin copied to `datapools/plugins`; overwrite is two-step (`exists` → confirm → `overwrite=true`) — cannot overwrite without confirmation (traced `Ma3SetupView.tsx` + `installFile`). |
| AC-2b | PASS (mechanism) | OSC config routes to `inout/osc` with the same confirm/error rules. **Content-incomplete**: the bundled file holds only the Receive entry (spec open question) — install works, but isn't turnkey until the Send entry is in the export. |
| AC-3 | PASS-with-gap | Friendly error + target path + reveal button, no crash. Gaps: source path not shown as text in the common permission/vanished-folder case (BUG-2); reveal button mis-targets the plugin file for an OSC-config error (BUG-1). |
| AC-4 | PASS | USB route rendered when no install is found. |
| AC-5 | PASS | Guide fed live `draft.console` values, re-renders on edit; MENU → In & Out → OSC, two-entry setup, multi-NIC + same-machine wording (EC-2). |
| AC-6 | PASS | Status links into the guide on both `plugin-missing` and `plugin-outdated`. |
| EC-1 | N/A | One shared-library base per OS → not literally reachable (documented design decision). |
| EC-2 | PASS | All non-internal IPv4 addresses listed; `127.0.0.1` switches to same-machine wording. |

## Security red-team

**No vulnerability found (CONFIRMED safe).** `installMa3Asset` takes `base` from the renderer but uses it only for an equality match against `detectInstalls()` (fixed, hardcoded candidate paths); the actual write target is derived from the *detected* install, never from raw input. A `base` with `..`, an absolute path elsewhere, a non-string, or any undetected value fails the `.find()` and returns a friendly error — no write. All PAM-9 IPC handlers route through the `handle` wrapper enforcing `event.sender === window.webContents`. Malformed input (`asset`, `overwrite`) is coerced safely.

Residual (Low, not app-exploitable): `copyFile` follows a pre-planted symlink at the target path, but that needs pre-existing same-privilege write access to the user's home dir — not an IPC-boundary escalation.

## Bugs

- **BUG-1 (Low)** — `Ma3SetupView.tsx:146`: the single "Show plugin file …" reveal button always reveals the *plugin* file (`revealBundledPlugin` → `bundledPluginXml`). When an OSC-config install fails, it points the user at the wrong bundled file. Repro: trigger an OSC-config install error → click reveal → Finder opens the plugin, not the OSC config.
- **BUG-2 (Low, borderline Medium)** — `Ma3SetupView.tsx:70-74`: AC-3 asks for source *and* target paths; the error render shows only the target. The source path only appears for the `bundled file not found` branch, not for the realistic permission/vanished-folder failure. Repro: make the target dir read-only → install → error text lacks the source path to copy from.

## Missing test coverage (Low)

`ma3-install.test.ts` covers the pure fs logic well. Not covered — the IPC-layer security boundary in `index.ts`: (a) an undetected/`..` base is rejected, (b) `asset="osc"` routes to `oscDir` vs plugin→`pluginsDir`, (c) `localIps` internal/IPv6 filtering. These are the actual security surface and deserve an integration test.

## Recommendation

Approve. BUG-1 + BUG-2 are small polish — **both fixed in the fix round below**. The OSC-config content gap (bundled file holds only the Receive entry) is yours to close with the corrected export.

### Fix round outcomes (2026-07-18)

- **BUG-1 (Low) — FIXED.** `revealBundledPlugin` → `revealBundledAsset(asset)`; each install row's error now has its own "Show file …" button revealing the *matching* bundled file (plugin vs OSC config), and the footer offers both "Show plugin file" and "Show OSC config".
- **BUG-2 (Low) — FIXED.** `Ma3InstallResult` error variant now carries `source` as well as `target`; `installFile` fills both, and the UI shows "copy manually — from: … / to: …" (AC-3 fully satisfied). New assertion in `ma3-install.test.ts`.

315/315 tests, typecheck, build green.
