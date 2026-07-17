# pam-osc File Format (v2)

pam-osc v2 stores everything as plain JSON files you can read, edit, and share. There are two file types:

- **Device definitions** describe a board _type_ — which faders, encoders, buttons, and displays it has, which MIDI messages they send, and where they sit on the board.
- **Mappings** connect one device definition to _your_ concrete unit (its MIDI port) and decide what each control does in GrandMA3.

Both are pure data: **no code, no scripts**. Files are validated on load; problems are reported with the file name, the exact location, and a plain-language message — a broken file is skipped, the rest keeps working.

**Where files live**

- Bundled files ship read-only inside the app.
- Your own files go into the app's data folder (`devices/` and `mappings/` — the app shows you the exact location and creates the folders on first start).
- A file of yours with the **same `id`** as a bundled one replaces it — handy for tweaking a bundled board. The app tells you when that happens.

## Common fields (every file)

| Field           | Type             | Notes                                                                        |
| --------------- | ---------------- | ---------------------------------------------------------------------------- |
| `formatVersion` | integer          | Currently `1`. Files from a newer pam-osc are rejected with a clear message. |
| `id`            | string           | kebab-case (`x-touch-compact`), unique per file type.                        |
| `name`          | string           | Display name.                                                                |
| `notes`         | string, optional | Free text — JSON has no comments, this is where they go.                     |

## Device definition

```json
{
  "formatVersion": 1,
  "id": "my-board",
  "name": "My Board",
  "manufacturer": "Example Corp",
  "mode": "standard",
  "defaultMidiChannel": 1,
  "layout": { "width": 10, "height": 4 },
  "controls": [
    {
      "id": "fader-1",
      "type": "fader",
      "midi": { "kind": "pitchbend", "channel": 1 },
      "position": { "x": 0, "y": 1, "width": 1, "height": 3 },
      "capabilities": { "motorized": true }
    },
    {
      "id": "btn-go",
      "label": "GO",
      "type": "button",
      "midi": { "kind": "note", "number": 8 },
      "position": { "x": 1, "y": 1, "width": 1, "height": 1 },
      "capabilities": { "led": "on-off" }
    }
  ]
}
```

- `mode` — `"standard"` or `"mc"` (Mackie Control boards like the X-Touch: note-off is note-on with velocity 0; scribble displays exist).
- `layout` — the board's size in abstract grid units; every control's `position` (x, y, width, height, optional `shape`: `"rect"`/`"circle"`) lives in that grid. Positions only need to be roughly right — they feed the visual editor.
- `midi` — `kind` is `"cc"`, `"note"` (both need `number` 0–127), or `"pitchbend"` (addressed by its `channel` alone). `channel` falls back to `defaultMidiChannel`.

**Control types and their capabilities**

| Type      | Capabilities                                                                                                                                                                                                                                                                                                                                          | Meaning                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `fader`   | `motorized` (default false)                                                                                                                                                                                                                                                                                                                           | Anything sending _absolute_ values — sliders, and knobs that send absolute CC. Motorized faders can follow the show. |
| `encoder` | `encoding` (required): `increment`/`decrement`, each `{from, to}` — the raw CC values per detent. `ledRing` (optional): `{controller, from, to}` — the CC number the ring listens on and its value range. `push` (optional): `{midi, led}` — the knob's integrated press: its own `note`/`cc` address plus an LED capability (composite push-encoder) | _Relative_ rotary encoders. With `push`, one control describes the whole knob: turn **and** press.                   |
| `button`  | `led`: `"none"`, `"on-off"`, or `"velocity-colors"` (LED color picked by velocity — APC mini, Launchpad)                                                                                                                                                                                                                                              | Anything sending notes (or CC buttons).                                                                              |
| `display` | `segments` (character count); `index` (0–7) instead of `midi`                                                                                                                                                                                                                                                                                         | Scribble strips / LED displays, addressed by slot index (the protocol carries 8 strips).                             |

## Mapping

```json
{
  "formatVersion": 1,
  "id": "my-board-show-a",
  "name": "My Board — Show A",
  "deviceDefinitionId": "my-board",
  "midiPort": { "input": "My Board MIDI 1", "output": "My Board MIDI 1" },
  "enableTimecodeSend": false,
  "assignments": [
    {
      "controlId": "fader-1",
      "action": { "type": "executor", "number": 201 },
      "feedback": { "type": "fader-position" }
    },
    {
      "controlId": "btn-go",
      "action": { "type": "quickKey", "key": "CLEAR" },
      "options": { "minValue": 10 },
      "feedback": { "type": "on-off", "onValue": 5 }
    }
  ]
}
```

- `midiPort` — OS port names (the app lists what's connected). `output` is optional for boards without feedback. Two units of the same board type? Two mappings, same `deviceDefinitionId`, different ports.
- `enableTimecodeSend` — `true` mirrors MA3 timecode on the board's 7-segment area. Only does something on `"mode": "mc"` boards (X-Touch); the timecode actions below need it too.
- Each control may appear **once** in `assignments` — except composite push-encoders: add `"part": "push"` to address the knob's press, so one encoder carries at most one rotate **and** one push assignment. Push assignments take button-style actions; `on-off`/`always-on` feedback needs the push's `led`.

**Actions**

| `type`              | Parameters                                                                     | Does                                                                                     |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `executor`          | `number`                                                                       | Controls that executor on the current page (fader moves it, button presses it).          |
| `command`           | `command`                                                                      | Sends the text to the MA3 command line.                                                  |
| `quickKey`          | `key`                                                                          | Triggers the QuickKey `pam-osc_<KEY>` (auto-created by the Lua plugin).                  |
| `attribute`         | `attribute`                                                                    | Controls the attribute (e.g. `dimmer`, `pan`, `tilt`).                                   |
| `modifier`          | `modifier`: `encoderFine` / `encoderRough` / `attributeSelect` (+ `attribute`) | App-internal modifier keys — nothing is sent to MA3.                                     |
| `timecodeSelect`    | `slot` (optional, 1–8)                                                         | With `slot`: selects that timecode slot. Without: cycles 0→1→…→8→0 per press (0 = none). |
| `timecodePlayPause` | —                                                                              | Tap: play/pause the selected timecode slot. Hold ≥ 0.5 s: switches it off.               |
| `display`           | `number`                                                                       | The display shows that executor's sequence, cue, and color.                              |

**Feedback types** (what the board's LEDs/motors do)

| `type`           | Parameters                                      | Needs                                                                   |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `none`           | —                                               | (default)                                                               |
| `on-off`         | `onValue` (default 127), `offValue` (default 0) | Button with an LED. On velocity-color boards, `onValue` _is_ the color. |
| `always-on`      | `value`                                         | Button with an LED — lit permanently.                                   |
| `fader-position` | —                                               | Motorized fader — follows the executor.                                 |
| `encoder-ring`   | —                                               | Encoder with an LED ring.                                               |

**Options** (per assignment): `minValue` — ignore button velocities below this; `amount` — sensitivity per encoder detent.

## Sharing

Mappings are single JSON files — send them to anyone. On another machine only the `midiPort` names usually need re-picking (that's what the import flow adjusts).

One thing to know: `command` actions contain real GrandMA3 console commands, sent verbatim when the button is pressed. The files carry no code that pam-osc executes — but a command like `Delete Sequence 1` is still a command. Skim the `command` values of a mapping you didn't write before using it in a show.
