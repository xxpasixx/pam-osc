# PAM-9: MA3 setup assistant — build decisions log

<!-- Written by /build (case 2: spec-only feature). Not a full design — the
     non-obvious technical choices, so /review and future work can follow them. -->

**Created:** 2026-07-18 · **Spec:** [spec.md](spec.md)

## Decisions

| Decision | Rationale | Date |
| -------- | --------- | ---- |
| Detection candidates: Windows `%ProgramData%\MALightingTechnology`, macOS `~/MALightingTechnology`; an install counts when `<base>/gma3_library` exists (AC-1). The `datapools/plugins` part is created on install — fresh onPC setups don't have it yet. Linux gets the USB route (onPC does not exist there). | Standard onPC locations; the user library folder is version-independent, so one entry per base — "all versions" collapses to the shared library | 2026-07-18 |
| The bundled plugin is the generated `gma3_library/datapools/plugins/pam-osc.xml` (repo file in dev, `extraResources → resources/plugin` in the package) — no second copy in the repo | Single source of truth: the PAM-12 generator + parity test already guard this file | 2026-07-18 |
| Install targets are restricted to folders the app itself detected (main re-detects before every copy) | The renderer can never point the file copy at an arbitrary path — defense in depth on the IPC surface | 2026-07-18 |
| Overwrite flow is two-step: install → `exists` result with the installed version → UI asks → install with `overwrite=true` (AC-2) | Explicit confirmation without native dialogs; the version comparison (installed vs bundled) is visible in the prompt | 2026-07-18 |
| Guide is its own tab ("MA3 Setup"), values come from the **draft** console settings | AC-5 wants live values — the draft updates as the user types in Setup, no save needed | 2026-07-18 |
| Destination IP: all non-internal IPv4 addresses are listed; `127.0.0.1`/`localhost` console address switches the guide to the same-machine wording (EC-2) | Multiple NICs are common (LAN + WLAN); guessing one silently was ruled out by the spec | 2026-07-18 |
| Status tab links into the guide from both `plugin-missing` and `plugin-outdated` (AC-6 + PAM-12 AC-7) | The outdated state is new with PAM-12 and has the same remedy — reinstall via the assistant | 2026-07-18 |

## Open question carried from the spec

The single-OSC-entry question (one entry for both directions vs. two ports, especially onPC on the same machine) is **still unverified** — the guide currently documents one entry named `pam-osc` with Send+Receive enabled and names both ports explicitly (destination port = receive port; console input = send port). After the onPC test, only the wording in `Ma3SetupView.tsx` (OscEntryCard) needs adjusting.
