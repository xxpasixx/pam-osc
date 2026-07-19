# PAM-14 — Design

**Date:** 2026-07-19

> Technical design (HOW). No code — implementation-grade precise. Contract lives in `spec.md`.

## Component Structure

The wizard is a full-window overlay that replaces the tabbed UI (same slot as the editor overlay in `App.tsx`), driven by one `wizardStep` state. It **reuses existing components** rather than reimplementing screens.

```
App
+-- SetupWizard (overlay, shown when onboarding.completed = false OR user reopens)
|   +-- WizardChrome (step indicator 1..6, Back / Skip, per-step primary button)
|   +-- Step 1: Welcome            (static copy + "what you'll need")
|   +-- Step 2: Pick controller    (reuses AddDeviceDialog board→mapping picker + "Import v1" → ImportV1Dialog)
|   +-- Step 3: Connect console    (reuses ConsoleSection fields + an inline "Test connection" using the PAM-4 check)
|   +-- Step 4: Install files       (reuses Ma3SetupView → InstallCard: plugin + OSC config, USB fallback)
|   +-- Step 5: OSC on the console  (reuses Ma3SetupView → OscEntryCard, live ports/IP; PAM-13 note when present)
|   +-- Step 6: Verify & finish     (live connection check + "move a fader" success; auto-starts the engine)
+-- (existing tabbed UI, revealed after Skip/Finish)
+-- "Setup guide" button in the tab bar / header  (reopens the wizard at step 1)
```

Reused components stay the single source of truth; the wizard imports them, it does not fork them. Where a reused component needs a "wizard mode" (e.g. hide its own card chrome), that is a presentation prop, not a copy.

## Data Model

One new **optional** field on App Settings (`persistedSettings`, `core/settings/schema.ts`) — everything else is transient wizard UI state held in the renderer.

```
App Settings gains:
- onboarding (optional object)
    - completed: boolean — default false (absent = never completed). Set true when the user
      finishes OR explicitly skips the wizard. When true, the wizard does not auto-open on launch.

Transient (renderer only, not persisted):
- wizardStep: one of 1..6
- per-step working values reuse the existing settings draft (console fields) and the boards/mappings
  catalog already loaded by App — the wizard writes through the SAME "Save & apply" path, so a
  controller picked or ports entered in the wizard persist exactly as they do on the normal tabs.

Access / ownership: local user, single installation (consistent with all pam-osc data).
Stored in: settings.json in the OS userData folder (same file as all App Settings).
```

`onboarding` is optional and additive — no `SETTINGS_FORMAT_VERSION` bump needed (older files simply lack it → treated as not completed).

## Behaviors & Access

Frontend-only feature (no backend). Key behaviors:

- **Auto-open trigger:** on app load, if `onboarding.completed` is not `true`, the wizard opens at step 1 instead of the tabbed UI. (AC-1)
- **Skip:** available on every step; sets `onboarding.completed = true` and reveals the tabbed UI. (AC-2)
- **Reopen:** a "Setup guide" action in the tab bar reopens the wizard at step 1 at any time; reopening does **not** reset `onboarding.completed` (so closing it again won't nag). (AC-2)
- **Step 3 gate:** the "Next" on the connect step is enabled once the console fields are valid; the inline test reports reachable / plugin-running / not-reachable (reusing the PAM-4 connection state), but a failed test does **not** block Next (EC-1) — it shows a warning and offers a link to diagnostics. (AC-4, EC-1)
- **Step 4:** auto-detects onPC (existing `detectMa3Installs`); one-click install of plugin + OSC config (existing `installMa3Asset`); USB route when none found. (AC-5)
- **Finish (step 6):** runs the live connection check; on success shows the "move a fader" state, **auto-starts the bridge engine**, and sets `onboarding.completed = true`. If the check never turns green the user can still finish (EC-1) with a clear "feedback not confirmed yet" note. (AC-7, AC-8)

## Tech Decisions

- **Overlay, not a route:** the app has no router; the wizard uses the same full-window overlay mechanism as the editor. Consistent with the codebase, no new dependency.
- **Reuse screens, don't rebuild:** the MA3 guide, console fields and connection check already work well; the wizard only sequences them. This keeps one source of truth and means the wizard inherits future fixes to those screens for free.
- **Auto-start on finish (maintainer, 2026-07-19):** the least-friction path — the PRD success metric is a moving fader, so the wizard ends by actually starting the bridge, directly resolving the Setup→Status dead-end (UX-H1) for first run.
- **`onboarding.completed` in settings, optional:** survives updates, additive, no migration; absence = not done.

## Dependencies

- None new. Reuses `ConsoleSection`, `Ma3SetupView` (InstallCard/OscEntryCard), `AddDeviceDialog`, `ImportV1Dialog`, the PAM-4 connection check, and the existing Save/apply + engine-start IPC.

## Build Plan

```
Level 1 — Data:      T1      add optional `onboarding.completed` to persistedSettings + default   · files: app/src/core/settings/schema.ts                          · → AC-1, AC-2
Level 2 — Shell:     T2      SetupWizard overlay + step state + chrome (Back/Skip/Next), auto-open + reopen wiring in App · files: app/src/renderer/src/components/SetupWizard.tsx, App.tsx · → AC-1, AC-2
Level 3 — Steps:     T3 [P]  Steps 1–2 (welcome, controller picker via reused dialogs)             · files: SetupWizard.tsx (+ presentation props on AddDeviceDialog/ImportV1Dialog) · → AC-3
                     T4 [P]  Steps 3 (connect + inline test)                                        · files: SetupWizard.tsx (reuse ConsoleSection + PAM-4 check)     · → AC-4, EC-1
                     T5 [P]  Steps 4–5 (install + OSC guide via reused Ma3SetupView cards)          · files: SetupWizard.tsx (reuse InstallCard/OscEntryCard)         · → AC-5, AC-6
Level 4 — Finish:    T6      Step 6 verify + auto-start engine + mark completed + "move a fader"    · files: SetupWizard.tsx, App.tsx                                 · → AC-7, AC-8
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| -------- | --------- | ---------------------- | --------- | ---- |
| Full-window overlay reusing existing screens | No router in the app; sequencing is the gap, not the screens | New wizard screens built from scratch | Reused components must accept a "wizard mode" prop | 2026-07-19 |
| Auto-start engine on finish | PRD metric is a moving fader; removes the Setup→Status dead-end | Land on Status with Start emphasized | Engine starts without an explicit Start click (acceptable at end of a guided flow) | 2026-07-19 |
| `onboarding.completed` optional in settings | Additive, no migration, survives updates | Separate marker file | One more optional settings field | 2026-07-19 |

## Open Questions

- [ ] Should "Setup guide" live in the tab bar or a header/menu button? Cosmetic; decide during build against the existing chrome.
