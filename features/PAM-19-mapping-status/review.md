# PAM-19 — Review

**Date:** 2026-07-19 · **Commit:** 252cfa1 · **Verdict: READY → Approved**

Regression baseline: typecheck clean, full suite **343 passing**.

## AC verification

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 status field, enum, new=draft, old files=draft, additive | **PASS** | `mapping.ts:87` `status: z.enum([...]).default("draft")`, no format bump; loader parses via `mappingSchema.safeParse` so statusless files → draft |
| AC-2 badge in Boards rows / Setup picker / Add-device dialog | **PASS** | `BoardsView.tsx:135`, `DevicesSection.tsx:109`, `AddDeviceDialog.tsx` picker |
| AC-3 editor set + persist | **PASS** | `EditorView.tsx:715` select → `draft.status`; save via `catalog.saveMapping` writes parsed value |
| AC-4 bundled = tested | **PASS** | all 10 `resources/mappings/*.json` carry `"status":"tested"`; `bundled.test.ts` asserts it |
| AC-5 shared: preserve status, statusless → community | **PASS** | `share.ts:73-77` checks raw `hasOwnProperty("status")`, sets community only when absent; write path keeps the override |
| AC-6 v1 import → draft | **PASS** | `converter.ts` sets `status:"draft"` explicitly |

## Findings

- **F1 — Low (consistency):** the Setup mapping `<select>` options (`DevicesSection.tsx:112`) are unbadged (native `<option>` can't render badges — the selected row still shows its badge, so AC-2 holds); the Status-tab active-mappings list (`StatusView.tsx:170`) shows names without a badge. Neither is an AC-2 surface. Cosmetic.
- **F2 — Low:** a freshly created empty mapping is written to disk without a `status` key (`catalog.ts:233` writes the pre-parse literal). It loads locally as draft (fine), but if exported before an editor save it lands elsewhere as `community` (statusless-import rule). Arguably per-spec; latent inconsistency vs `saveMapping`.

Robustness/security: malformed status → schema rejects, loader skips + flags invalid (no crash); absent status never crashes; enum enforced at load/save/share.

## Verdict
6/6 ACs PASS. No Critical/High/Medium. Two Low consistency notes. **Approved.**
