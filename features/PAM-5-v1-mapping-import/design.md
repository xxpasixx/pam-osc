# PAM-5 — Design

**Date:** 2026-07-17

> The technical design (HOW). Two readers: the PM (approves) and `/build` (implements against it). No code — but implementation-grade precise. The contract (WHAT) lives in `spec.md`.

## Component Structure

```
app/src/core/import/          (pure TypeScript, Electron-free, unit-testable)
+-- v1 reader     — shape check + normalized parse of a v1 mapping JSON
+-- converter     — v1 content + chosen DeviceDefinition → v2 Mapping + summary
+-- summary types — ImportSummary, ImportWarning (structured, renderable)

app/src/main/
+-- import IPC handlers — native file dialog, file read, convert, write to the
    user mappings folder, catalog refresh
+-- snapshot: extended with the list of loaded device definitions (dropdown data)

app/src/renderer/src/components/
+-- ImportV1Dialog — the three-step flow (pick file → board + name → summary)
+-- DevicesSection — gains an "Import v1 mapping" button next to "+ Add device"
```

The import produces a **standard v2 mapping file** — after the import is done, nothing about it is special: the catalog, settings, engine, and PAM-6 editor treat it like any hand-made user mapping.

## Data Model

**No new entities.** The import writes a regular Mapping (PAM-1 schema) into the user mappings folder — `docs/data-model.md` is unchanged (the Mapping entity already covers it; the import is just another producer).

### Input: the v1 mapping shape (read-only, never modified)

A file is accepted as a v1 mapping when it is valid JSON, is an object, contains **at least one** of the section keys `control`, `note`, `pitch`, `rltvControl`, `display`, and has **no** `formatVersion` field (a `formatVersion` means it's already a v2 file — rejected with a message saying exactly that). Recognized v1 content:

| v1 element                         | Meaning                                 | Values                                                        |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `mode` (top-level)                 | "mc" or absent — board protocol fact    | dropped (lives in the v2 device definition)                   |
| `buttonFeedbackMapper` (top-level) | JS feedback function, file-wide default | pattern-matched, never executed (see Feedback)                |
| `enableTimecodeSend`               | timecode to 7-segment display           | copied as-is (boolean)                                        |
| `control.<cc>`                     | absolute CC (fader/knob) → executor     | number **or numeric string** (e.g. `"201"`)                   |
| `pitch.<channel>`                  | pitchbend fader → executor              | number                                                        |
| `note.<note>`                      | button entry                            | object, see Actions below                                     |
| `rltvControl.<cc>`                 | relative encoder entry                  | object: `exec` or `attribute`, `amount`, plus hardware fields |
| `display.<index>`                  | scribble strip → executor to mirror     | number                                                        |

Per-entry keys inside `note`/`rltvControl`:

- Actions (exactly one expected): `exec` (number), `cmd` (text), `quicKey` (text), `attribute` (text), `local` (`"encoderFine"` / `"encoderRough"` / `"attribute"` + `attribute` field), `timecodeSelect` (`true` or slot number), `timecodePlayPause` (`true`)
- Options: `minValue` (0–127), `amount` (number)
- Feedback: `buttonFeedbackMapper` (per-entry JS, overrides file-level), `permanentFeedback` (0–127)
- Hardware facts, dropped in favor of the chosen device definition: `posFrom`, `posTo`, `negFrom`, `negTo`, `returnChannel`, `returnFrom`, `returnTo`, `currValue`, `midiChannel`

### Output: the generated v2 mapping file

- **Envelope** — `formatVersion` 1; `name` = the user's chosen name (text, required, prefilled with the source file's base name); `id` = kebab-cased from the name, and if that id already exists in the catalog, the first free `-2`, `-3`, … suffix is appended (same convention as Duplicate); `notes` = "Imported from v1 file \<fileName\> on \<date\>." followed by every warning the import produced — the approximations stay readable in the file forever, not only in the one-time summary.
- **File** — written as `<id>.json` into the user mappings folder (the id is unique, so the file name is too); pretty-printed like all files the app writes. The source file is never touched.
- **`deviceDefinitionId`** — the board the user picked in the dropdown.
- **`midiPort`** — placeholder, same convention as the bundled mappings: `input` = the device definition's display name; `output` = the same placeholder **only if** the chosen board has any feedback-capable control (a button with led ≠ "none", a motorized fader, an encoder with ledRing, or a display) — otherwise omitted. Real ports are bound by the user in the Devices section afterwards (PAM-3 behavior; a not-connected placeholder shows as "(not connected)" there).
- **`enableTimecodeSend`** — copied from v1, default false.
- **`assignments`** — one per successfully converted v1 entry, per the conversion rules below.

### Conversion rules (v1 entry → v2 assignment)

Control matching — every v1 entry is addressed by MIDI facts; the converter finds the control in the chosen device definition:

| v1 section         | Matches the control with                                           |
| ------------------ | ------------------------------------------------------------------ |
| `control.<cc>`     | `midi.kind` "cc" and `midi.number` = cc                            |
| `pitch.<channel>`  | `midi.kind` "pitchbend" and `midi.channel` = channel               |
| `note.<note>`      | `midi.kind` "note" and `midi.number` = note                        |
| `rltvControl.<cc>` | `midi.kind` "cc" and `midi.number` = cc and control type "encoder" |
| `display.<index>`  | control type "display" and `index` = index                         |

No match → the entry is **skipped with a warning** naming section, number, and the board (e.g. `note 91: no button with note 91 on "Launchpad Mk2"`). If two v1 entries resolve to the same control (e.g. the same CC in both `control` and `rltvControl`), the **first wins** (section order: control, pitch, note, rltvControl, display) and the loser is skipped with a warning — the v2 schema forbids duplicate assignments.

Action conversion:

| v1                                                     | v2 action                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exec` / numeric `control` / `pitch` / `display` value | `executor` (or `display` for the display section) with that number; numeric strings are converted; a value that is not an integer 1–9999 → skip + warning |
| `cmd`                                                  | `command`                                                                                                                                                 |
| `quicKey`                                              | `quickKey`                                                                                                                                                |
| `attribute` (no `local`)                               | `attribute`                                                                                                                                               |
| `local`: "encoderFine" / "encoderRough"                | `modifier` with that modifier                                                                                                                             |
| `local`: "attribute" + `attribute`                     | `modifier` "attributeSelect" with the attribute                                                                                                           |
| `timecodeSelect`: `true`                               | `timecodeSelect` without slot (cycles 0–8, v1 behavior)                                                                                                   |
| `timecodeSelect`: number 1–8                           | `timecodeSelect` with that slot                                                                                                                           |
| `timecodePlayPause`: `true`                            | `timecodePlayPause`                                                                                                                                       |

`minValue` → `options.minValue` (must be 0–127, else skip + warning); `amount` → `options.amount` (must be a positive number ≤ 1000, else skip + warning). An entry with no recognizable action, or with several conflicting ones, is skipped with a warning naming the entry and the reason.

Feedback derivation (per assignment, decided in this order):

1. `permanentFeedback: <n>` → `always-on` with value n.
2. Control is a motorized fader (`control`/`pitch` sections) → `fader-position`.
3. Control is an encoder with a ledRing → `encoder-ring`.
4. Button with led ≠ "none": the effective feedback mapper (per-entry wins over file-level) is matched — **as text, never executed** — against the one shape v1 ever generated: `function(value) { if (value == 'On') { return A;} if (value == 'Off'){ return B;} return C; }` with tolerant whitespace/quotes; integers A → `onValue`, B → `offValue`. Match → `on-off` with those values. A mapper that doesn't match → `on-off` 127/0 **plus a warning** quoting the entry. No mapper at all → `on-off` 127/0 (v1's default).
5. Everything else (led "none", display controls, input-only situations) → `none`.

### The import summary (AC-5)

Returned to the UI and appended to the file's `notes`:

- **converted** — count of assignments written, broken down per v1 section
- **warnings** — ordered list, each with a kind and a human-readable text naming the exact v1 entry:
  - `unmatched-control` — no control with that MIDI address on the chosen board
  - `duplicate-target` — control already assigned by an earlier entry (first wins)
  - `unrecognized-feedback` — mapper JS didn't match the known pattern, default used
  - `invalid-value` — action/option value out of range, entry skipped
  - `unknown-key` — unrecognized top-level or entry key, ignored (typo protection)

Zero silent drops: every v1 entry either becomes an assignment or produces exactly one warning.

## Behaviors & Access

Everything is local and single-user (consistent with `docs/data-model.md`); "access" is the process boundary — file dialog and file writes live in the main process, the renderer only talks through the preload bridge. Two new IPC calls (extending `PamOscApi`), plus one snapshot extension:

1. **Pick v1 file** — opens the native open-file dialog (filter: `.json`), reads and shape-checks the chosen file. Returns one of: _canceled_ (user closed the dialog — no error shown); _ok_ with file path, file name, and per-section entry counts (the preview numbers for step 2); _error_ with a plain-language message (not JSON / already a v2 file / no v1 sections found — AC-6). Nothing is written in this step.
2. **Import** — input: file path (from step 1), chosen device definition id, chosen name. The main process **re-reads the file from disk** (the renderer round-trip is not trusted), validates the same way, converts, validates the result against the PAM-1 mapping schema (belt and braces — a converter bug must not produce an unloadable file), writes it to the user mappings folder, refreshes the catalog, and returns the new catalog entry + import summary. Any failure → _error_ with message, nothing written (a failed schema check names the converter as the culprit, asking the user to report it).
3. **Snapshot extension** — the snapshot gains the list of loaded device definitions (id + display name, bundled and user, alphabetical) so the dropdown never needs an extra round trip.

UI flow (`ImportV1Dialog`, reachable via the "Import v1 mapping" button in the Devices section):

- **Step 1** — the button immediately opens the native file picker (no empty dialog first). Cancel → nothing happens.
- **Step 2** — dialog shows the file name and its per-section counts ("142 buttons, 9 faders, 8 encoders, 8 displays"); a **board dropdown** (all loaded device definitions, alphabetical, starts on "pick a board …" — no guessing, per spec decision); a **name field** prefilled with the file's base name. [Import] stays disabled until a board is picked and the name is non-empty. [Cancel] discards everything.
- **Step 3 (result)** — success: converted count, the warning list (scrollable, each warning one line), and the note that the mapping is now available under "+ Add device" and its ports are bound there. [Done] closes. Error: the message inline in the dialog, nothing written, [Close].
- The import never touches settings or active mappings — activation (Add device → pick ports → Save) stays the user's explicit step. First engine start with the imported mapping happens through the normal PAM-3 Save transaction.

Empty/edge behaviors: an empty v1 file (`{}` or only unknown keys) fails the shape check (AC-6). A v1 file whose every entry misses the chosen board imports successfully with zero assignments and a warning per entry — the summary makes "you probably picked the wrong board" obvious; the user can delete the file via the mappings folder (existing reveal action) and re-import. Windows/macOS/Linux path handling comes from Electron's dialog + Node path APIs, nothing custom.

## Tech Decisions

- **Converter lives in `core/`, Electron-free** — the entire conversion is pure data-in/data-out, so all ten legacy files in `mappings/` become test fixtures; the golden test converts `xTouch1.json` against the bundled X-Touch definition and compares against the hand-converted `x-touch-default-1.json` assignments (they were converted from exactly that file in PAM-1 — deliberate differences are asserted explicitly).
- **Pattern-match the feedback mapper as text, never execute it** — spec decision (untrusted input). v1 only ever generated one function shape; anything else is by definition hand-written code, which v2 deliberately doesn't support (PAM-1 decision) — default + warning is the honest translation.
- **Re-read and re-validate in the main process at import time** — the renderer is untrusted per Electron's model; the file on disk is the single source, and the final schema validation guarantees the written file loads.
- **Warnings persist in the file's `notes`** — the one-time summary dialog is not the only record; the same convention PAM-1 used for its documented approximations.
- **Placeholder ports, same convention as bundled mappings** — the import can't know the user's port names; PAM-3's existing "(not connected)" affordance already handles the rebinding, so no new UI is needed.

## Dependencies

None new — Electron's dialog module, Node file APIs, and the existing PAM-1 schemas/loader cover everything.

## Build Plan

```
Level 1 — Core:      T1      v1 reader + converter + summary types + unit tests
                             (fixtures: all 10 files in mappings/; golden test vs
                             x-touch-default-1; mapper pattern edge cases)
                             · files: app/src/core/import/*  · → AC-3, AC-4, AC-6
Level 2 — Main:      T2      IPC handlers (pick, import), snapshot boards list,
                             preload bridge, integration tests (temp userData dir)
                             · files: app/src/main/*, app/src/preload/index.ts,
                               app/src/shared/ipc.ts  · → AC-1, AC-2
Level 3 — Renderer:  T3      ImportV1Dialog + DevicesSection button + styles
                             · files: app/src/renderer/src/components/*  · → AC-1, AC-5
```

## Technical Decisions

| Decision                                                                          | Rationale                                                                                               | Alternative considered                   | Trade-off                                                                                    | Date       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| Pure converter in `core/import/`, fixtures = the 10 legacy files                  | Full v1 feature coverage is provable in unit tests (AC-3); golden test against PAM-1's hand conversion  | Convert inside the main process handlers | One more module boundary                                                                     | 2026-07-17 |
| Mapper JS matched by regex against the single v1-generated shape                  | No code execution on untrusted input (spec); covers 100% of real v1 files                               | Sandboxed evaluation (vm, worker)        | Hand-written mappers fall back to 127/0 + warning — accepted, v2 doesn't support code anyway | 2026-07-17 |
| Two-step IPC (pick → import), file re-read at import                              | Renderer stays untrusted; no v1 blobs shuttled over IPC; dialog UX needs the counts before board choice | Single call doing dialog + import        | Second disk read — irrelevant at these file sizes                                            | 2026-07-17 |
| Generated mapping is a plain user mapping (placeholder ports, no auto-activation) | Reuses PAM-3's activate/bind/save path unchanged; import stays side-effect-free for the engine          | Auto-activate after import               | One extra user step (Add device) — deliberate, keeps Save the only engine-touching action    | 2026-07-17 |
| Final schema validation before write, converter blamed on failure                 | A converter bug must never produce a file the loader rejects (AC-2)                                     | Trust the converter                      | Tiny extra work per import                                                                   | 2026-07-17 |
| Warnings appended to the file's `notes`                                           | Approximations survive the dialog; same convention as PAM-1's documented approximations                 | Summary only in the dialog               | Slightly longer notes field                                                                  | 2026-07-17 |

## Open Questions

- None

## Implementation Notes (added during /build)

- **Button feedback is derived per action statefulness, not blanket per LED.** PAM-1's hand conversion (the golden fixture) encodes what v1 actually did: LED buttons get `on-off` only for actions the engine mirrors state for — **executor, command, modifier**. Stateless triggers (**quickKey, timecodeSelect, timecodePlayPause**) get `none`; v1 never sent feedback for them. The design's feedback step 4 is refined accordingly.
- **Two v1 files carry documented defects; the importer warns instead of fixing.** `akiApcMini1.json` addresses note 72, which doesn't exist on the hardware (PAM-1 manually moved it to the shift button, note 98); `akaiApcMini2-Controller.json` has an empty `quicKey` on the shift button. Both convert with exactly one warning each — an importer must not guess (spec decision: no silent repairs). All other eight files convert 100% warning-free; the golden test matches PAM-1's conversion exactly (124/124 assignments).
- **Import paths are allow-listed in the main process.** `importV1Mapping` only accepts a `filePath` that `pickV1MappingFile`'s own dialog returned earlier in the session — a compromised renderer can't point the main process at arbitrary files.
- **Unique ids also dodge stray files.** Besides loaded mapping ids, the id search skips file names already present in the user mappings folder (an invalid file owns its name without having a loadable id).

### Review fixes (round 1 — after NOT READY verdict)

- **BUG-1 (High, ReDoS) fixed.** `mapperToOnOff` now rejects any `buttonFeedbackMapper` longer than `MAX_MAPPER_LENGTH` (300 chars) _before_ running `V1_MAPPER_PATTERN.exec`, falling back to `on-off` 127/0 + warning. The real v1 mapper is ~90 chars, so legitimate mappers (even with generous whitespace) are unaffected; a megabyte-scale adversarial string can no longer feed the quadratic-backtracking regex and freeze the main process. Regression test asserts a 1 MB evil string resolves in <100 ms.
- **BUG-2 (Low, concurrent-import race) fixed.** Imports are serialized through `ImportSerializer` (a single promise chain) in the `importV1Mapping` IPC handler, so the non-atomic id-check → write → refresh sequence can't interleave. A rejected task doesn't wedge the queue. Two unit tests: concurrent same-name imports yield `compact` + `compact-2` (neither clobbered), and a rejected task doesn't block the next import.
- **BUG-3 (Low, Escape glitch) fixed.** `ImportV1Dialog` handles `onCancel` and `preventDefault`s while `busy`, so Escape during an import no longer tears the native `<dialog>` out of the DOM.
- **Not fixed (accepted for this scope):** BUG-4 (defensive post-write "did not load" branch leaves a file), BUG-5 (raw fs errors / unbounded schema fields), BUG-6 (empty-boards-list dead end — bundled devices guarantee a non-empty list), BUG-7 (imported buttons carry arbitrary MA3 commands — inherent to the feature; a UX caution belongs with community sharing in PAM-7). All Low/informational.
