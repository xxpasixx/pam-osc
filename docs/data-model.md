# Data Model — pam-osc v2

> Product-altitude sketch. File formats and exact fields are per-feature `/design` work (starting with PAM-1).
>
> Refined by `/design` as each feature is designed.

**All data is local files owned by the user — no accounts, no server, no sync.** Sharing happens by exporting/importing files.

## Entities

| Entity            | What it represents                                                                                                                                                                                                                                                                                                                                                                                             | Owned by / who can see it                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Device Definition | A physical MIDI board **type** (e.g. "X-Touch Compact"): its Controls (faders, encoders, buttons), each with a MIDI address (note/CC, channel) and a 2D position/size for the board layout. Deliberately contains **no MIDI port name** — that binding is per mapping, so two units of the same board type can run side by side. Bundled with the app for known boards; users add their own via the P1 editor. | Local user (bundled ones ship with the app) |
| Mapping           | Binds one Device Definition to a **concrete MIDI port** (the connected unit) and assigns its controls to GrandMA3 actions (executor, command, QuickKey, attribute …) including feedback behavior (motor fader, LED, display). Also carries **per-mapping feedback toggles** (send colors, send names, resend buttons, send timecode — PAM-16) and a **status** (draft / community / tested — PAM-19, self-declared). Several mappings per device type are possible — different units or different use cases. This is the file users share.                                                            | Local user                                  |
| App Settings      | Console connection (IP, send/receive ports), which mappings are active, UI preferences. Also the **global fixed-page override** (PAM-16), the **onboarding-completed** flag (PAM-14), and the **best-effort auto-rearm** opt-in (PAM-15). One per installation.                                                                                                                                                  | Local user                                  |

## Relationships

- A Mapping references exactly **one** Device Definition and exactly **one** MIDI port name.
- A Device Definition can be referenced by **many** Mappings (different units of the same board, or different use cases).
- When **several Mappings are active at once**, the runtime config sent to the plugin merges them: feedback toggles OR together, executor watch-sets union; the fixed-page override stays a single global value (PAM-16).
- App Settings reference the currently **active** Mappings (one per connected unit).
- On import of a shared Mapping, the receiving machine remaps the MIDI port name to its own unit.

## Not persisted

Runtime state (current page, fader positions, DeskLock, sequence/cue/color displays) lives in the MA3 console and is mirrored live — never written to disk.

## Diagram

```
Device Definition (board type, bundled or user-created)
  └─ referenced by many Mappings
       ├─ binds one MIDI port (the concrete unit)
       ├─ assigns controls → MA3 actions + feedback
       └─ activated via App Settings
```
