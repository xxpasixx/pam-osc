# PAM-7: Mapping/device export & import + support package — design notes

> No upfront design was needed (single-file I/O on the existing format and catalog
> surfaces). This file records the non-obvious implementation choices, per the
> build workflow.

## Implementation notes (2026-07-17)

- **Export = byte copy of the real loaded file** (`catalog.mappingFile/deviceFile` → `copyFile`), never a re-serialization — what you share is exactly what the loader proved valid. The AC-5 export refusal is a size check (`MAX_SHARE_BYTES`, mirrors the loader cap).
- **`core/sharing/share.ts` is the pure gate:** `detectShareKind` (mapping = `assignments`+`deviceDefinitionId`, device = `controls`+`layout` — disjoint keys), `parseShareFile` (size → JSON → kind → strict schema, every failure a specific friendly message), `commandCaution` (AC-7 — fires on `command` actions only; `quickKey`/`attribute` are too common to warn about, noted as a deliberate narrowing of the PAM-5 BUG-7 note).
- **Import validates like an editor save.** Beyond the spec's wording: `importMapping` runs `validateMappingDraft(mapping, device)` before writing — a schema-valid mapping whose assignments don't fit the board would otherwise be written and then skipped by the loader, stranding an invalid file (found by test, fixed in build).
- **Collision rule** reuses `suffixedCopy` + the file-on-disk loop (same as createMapping/v1 import). Device imports collide against ALL board ids (bundled + user) — an import can never shadow a bundled definition (AC-9).
- **Dialogs live in `main/index.ts`; logic is Electron-free** (`share-files.ts`, `support-package.ts`, `session-log.ts`) — all covered by Vitest without Electron. Imports run through the PAM-5 `ImportSerializer` (one write path at a time).
- **Support package: `yazl` 3.3.1** (write-only zip, zero transitive baggage; `yauzl` dev-only for the read-back test). Layout: `manifest.json`, `devices/<origin>/…`, `mappings/<origin>/…`, `settings.json`, `log/…` — origin subfolders because a user file can shadow a bundled id with the same basename. Missing settings/logs are skipped silently (first run).
- **Session log (`SessionLog`):** lifecycle + errors only — engine state, console connection, issues, notices, saves, imports/exports, start/quit — deliberately NOT per-message MIDI/OSC traffic (that stays in the in-memory traffic log). 512 KB cap with a truncation marker; one previous session kept (`session-prev.log`, rotated on start); writes are queued fire-and-forget and failures are swallowed — logging can never take the bridge down.
- **UI:** Boards tab carries Export per board/mapping row and both "Import …" buttons; the support package lives in a Support card on the Status tab. Import results surface as notices (info summary + AC-7 warning); canceled dialogs stay silent.
- **Verified:** 285/285 Vitest (51 new: 12 share-gate, 8 session-log/import e2e groups, zip read-back), typecheck clean, production build green, dev-boot smoke on macOS — the session log captured the real engine start/device binding end-to-end.

## Assumptions surfaced at handoff

- Extensions `.mapping` / `.device` (maintainer's pick); `.json` stays accepted on import — confident
- AC-7 caution only for `command` actions (not `quickKey`/`attribute`) — reasonable narrowing, flag if you want it broader
- Support package contains bundled AND user files (split by origin) — "all … visible in the app", confident
- Package restore stays manual per the spec decision — confident
