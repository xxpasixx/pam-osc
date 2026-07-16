# PAM-1 — Design

**Date:** 2026-07-16

> The technical design (HOW). Two readers: the PM (approves) and `/build` (implements against it). No code — but implementation-grade precise. The contract (WHAT) lives in `spec.md`.

## Component Structure

No user interface in this feature — PAM-1 delivers the core format module, the bundled content, and the format documentation:

```
app/src/core/format/
+-- Device definition schema + derived types
+-- Mapping schema + derived types
+-- Loader (scans folders, validates, resolves references)
+-- Validation errors (structured, human-readable)
resources/
+-- devices/      (5 bundled device definitions)
+-- mappings/     (10 bundled default mappings, re-expressed from v1)
docs/file-format.md   (user-facing format documentation — AC-6)
```

Surfacing loader results in the app UI is PAM-3/PAM-4 work; PAM-1 exposes them as structured results with tests.

## Data Model

Two file types, both JSON, both starting with the same envelope:

```
Envelope (every file):
- formatVersion — integer, required, starts at 1. Loader rejects files with a
  newer version than it knows, naming file and version ("made with a newer
  pam-osc"). Older versions get migrated in future releases.
- id — string, required, kebab-case, unique within its file type
  (e.g. "x-touch-compact", "x-touch-compact-default-a")
- name — display name, text, required
- notes — free text, optional (JSON has no comments; this is where they go)
```

**Device Definition** — describes a board *type*, never a concrete unit:

```
- manufacturer — text, optional
- mode — one of: "standard", "mc" (Mackie Control: note-off is sent as
  note-on with velocity 0; scribble displays and 7-segment areas exist).
  Default "standard".
- defaultMidiChannel — integer 1–16, default 1
- layout — width and height of the board in abstract grid units (numbers > 0)
- controls — list, at least 1, each:
    - id — string, unique within the device (e.g. "fader-1", "btn-mute-3")
    - label — text, optional (what's printed on the hardware)
    - type — one of: "fader", "encoder", "button", "display"
    - midi — kind: one of "cc", "note", "pitchbend";
             channel: integer 1–16, optional (falls back to defaultMidiChannel);
             number: integer 0–127, required for cc/note, absent for pitchbend
             (pitchbend is addressed by its channel alone)
    - position — x, y, width, height in grid units; shape "rect" or "circle",
      default "rect" (data only in the MVP — rendered first by the PAM-6 editor)
    - capabilities — by type:
        fader:   motorized (yes/no, default no — motorized faders receive
                 position feedback via pitchbend on their channel)
        button:  led — one of "none", "on-off", "velocity-colors"
                 (velocity-colors: LED color is picked by velocity value,
                 like APC mini / Launchpad)
        encoder: encoding — increment range (from–to) and decrement range
                 (from–to), the raw CC values the hardware sends per detent
                 (hardware fact, so it lives here, NOT in the mapping);
                 ledRing — optional: CC number (controller) + value range for
                 the feedback ring
        display: segments — integer > 0 (character count of the strip)
```

**Mapping** — binds a device definition to a concrete unit and assigns actions:

```
- deviceDefinitionId — must reference an existing device definition id
- midiPort — input port name (text, required) and output port name
  (text, optional — input-only boards have no feedback);
  OS-level port names, chosen by the user in PAM-3
- enableTimecodeSend — yes/no, default no (device shows timecode on its
  7-segment area, mc-mode boards only)
- assignments — list, each:
    - controlId — must reference a control id in the device definition
    - action — exactly one of:
        executor        — number (integer, MA3 executor number on the current
                          page, e.g. 201)
        command         — command (text, sent to the MA3 command line)
        quickKey        — key (text, becomes QuickKey "pam-osc_<KEY>")
        attribute       — attribute (text, e.g. "dimmer", "pan", "tilt")
        modifier        — one of "encoderFine", "encoderRough",
                          "attributeSelect" (with attribute) — handled inside
                          the app, never sent to MA3 (v1 "local")
        timecodeSelect  — slot (integer ≥ 1)
        timecodePlayPause — no parameters
        display         — number (executor whose sequence/cue/appearance the
                          display control shows)
    - options — minValue (integer 0–127, optional: velocity threshold below
      which button input is ignored); amount (number, optional: sensitivity
      per detent for encoder + attribute/executor actions)
    - feedback — exactly one of the predefined types (pure data, AC-2):
        none            — (default for input-only situations)
        on-off          — onValue (0–127, default 127), offValue (0–127,
                          default 0). Covers every v1 buttonFeedbackMapper:
                          the APC/Launchpad color variants are onValue 2/3/5.
        always-on       — value (0–127), sent permanently (v1
                          "permanentFeedback")
        fader-position  — motorized fader follows the executor (only valid on
                          faders whose device capability says motorized)
        encoder-ring    — LED ring shows the value (only valid on encoders
                          with a ledRing capability)

Validation rules (loader):
- Unknown fields, wrong types, broken references (deviceDefinitionId,
  controlId), feedback types that the control's capabilities can't do,
  duplicate control assignments → structured error naming file, path, and
  problem in plain language; the file is skipped, loading continues (AC-4).
- Duplicate id across user and bundled files: the user file wins (shadowing —
  lets users tweak a bundled board before the editor exists); the loader
  reports this as an info notice, never silently.
```

**Stored in:**
- Bundled content ships read-only inside the app package (`resources/`)
- User files live in the OS app-data folder (`<userData>/devices/`,
  `<userData>/mappings/`), created on first start; hand-edited files there are
  loaded exactly like bundled ones (AC-6)

Access: everything is local files owned by the local user — consistent with `docs/data-model.md` (no change to the app-wide map needed).

## Tech Decisions

- **JSON as the file format** — native to the stack, v1 users already know JSON mappings, and the PAM-6 editor can read/write it losslessly. Comments are replaced by explicit `notes` fields.
- **One schema library as single source of truth (zod)** — the same schema validates files at runtime *and* derives the TypeScript types, so format and code can never drift apart; its error messages map cleanly to "file + path + problem" (AC-4).
- **Hardware facts live in the device definition, user choices in the mapping** — v1 mixed encoder encoding ranges (hardware) with executor targets (user intent) in one file; the split is what makes definitions reusable across many mappings (AC-5) and is the line the PAM-6 editor will draw in its UI.
- **Ports by OS name, not index** — v1 used Open Stage Control port indexes ("0,1"), which shift when devices are re-plugged; names are stable and human-readable.
- **Integer formatVersion per file** — cheap to check, unambiguous to migrate; rejecting newer-than-known versions with a clear message beats guessing.

## Dependencies

- `zod` — schema validation + derived TypeScript types for both file formats

(Deliberately nothing else: the loader uses Node's built-in file APIs; `easymidi`/`osc` arrive with PAM-2.)

## Build Plan

```
Level 1 — Format:   T1      zod schemas + types (envelope, device, mapping)
                            · files: app/src/core/format/*  · → AC-2, AC-4
Level 2 — Loader:   T2      folder scan, validation, reference resolution,
                            shadowing, structured errors + unit tests
                            · files: app/src/core/format/loader*  · → AC-4, AC-5, AC-6
Level 3 — Content:  T3 [P]  5 device definitions (one file per board)
                            · files: resources/devices/*  · → AC-1
                    T4 [P]  10 default mappings re-expressed from v1
                            · files: resources/mappings/*  · → AC-3
Level 4 — Docs:     T5      docs/file-format.md (user-facing format guide)
                            · → AC-6
```

Note: T3/T4 need the app scaffold (`app/` with Vite/Electron/Vitest) to exist — `/build` creates it as part of Level 1 (plumbing, no own feature).

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| JSON file format | Stack-native, v1-familiar, editor-safe round-tripping | YAML (comments, friendlier syntax) | No comments → explicit `notes` fields; stricter syntax for hand-editing | 2026-07-16 |
| zod schema as single source (validation + types) | Format and code can't drift; precise error paths for AC-4 | Hand-written TS types + JSON Schema files | Runtime dependency; JSON-Schema export possible later if editors want it | 2026-07-16 |
| Encoder encoding ranges in device definition, not mapping | Hardware fact vs user intent; makes definitions reusable (AC-5) | Keep v1 shape (all in mapping) | Bundled definitions must be captured carefully once per board | 2026-07-16 |
| User file shadows bundled file with same id (with notice) | Lets users tweak bundled boards before the PAM-6 editor exists | Reject duplicate ids | A stale user copy can hide bundled improvements — the notice mitigates | 2026-07-16 |
| MIDI ports referenced by OS name | Stable across replugging, human-readable, PAM-3 picks them from a list | Numeric port indexes (v1) | Name changes across OSes/hubs → PAM-3 re-pick, PAM-7 import remaps | 2026-07-16 |

## Open Questions

- None — executor numbering semantics (page-relative behavior) are runtime concerns owned by PAM-2; the format stores the plain number.

## Implementation Notes (added during /build)

- **Display controls carry an `index` instead of a `midi` address.** v1 addresses scribble strips per sysex by slot index (0–7); a CC/note number would have been fiction. Deviation from the original data model table, same product behavior.
- **Absolute-CC rotary knobs are modeled as `fader` with `shape: "circle"`.** The v2 `encoder` type means *relative* encoding; X-Touch Compact knobs in standard mode send absolute CC and behave protocol-wise like faders.
- **App scaffold kept minimal (TypeScript + Vitest + zod only).** Electron/Vite/React arrive with the first feature that needs them (PAM-2/PAM-3) — nothing in PAM-1 runs in a window. The loader takes folder paths as parameters, so wiring bundled/userData paths is trivial later.
- Versions pinned from the npm registry on 2026-07-16: zod 4.4.3, TypeScript 7.0.2, Vitest 4.1.10.
- **`ledRing` addresses a CC number (`controller`), not a MIDI channel.** v1's `returnChannel` is in truth the ring's CC number (X-Touch: encoders in on CC 16–23, rings out on CC 48–55); the original design's channel field would have rejected the only board with rings. Found during content conversion.
- **Six bundled device definitions, not five.** The v1 APC mini files cover two hardware generations — `apc-mini` (mk1) and `apc-mini-mk2` (Controller layout, notes 100–122, RGB palette). All five spec'd board types are covered; the mk2 is a bonus, and each of the ten v1 mappings targets its correct hardware.
- **X-Touch Compact: `motorized: true` expresses "value feedback via the control's own CC".** v1 sends MA3 fader levels back to every absolute-CC control (motor faders and encoder LED rings alike); `fader-position` feedback + the motorized flag is the schema-honest way to carry that, documented in the device's `notes`.
- **Known, documented approximations** (each recorded in the affected file's `notes`): v1's cycling timecode-slot select became `timecodeSelect slot 1`; Launchpad top-row CC buttons mirrored the executor fader level in v1, now `on-off`; APC mini mk2 per-LED brightness channels and Launchpad flash/pulse channels are not machine-readable yet (parked in `docs/ideas.md` for PAM-10).
