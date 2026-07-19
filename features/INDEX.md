# Feature Index

> Central tracking for all features. Updated by skills automatically.

## Status Legend

- **Roadmap** - on the feature map (`/init`), no spec yet
- **Spec'd** - `spec.md` exists with AC-IDs
- **Building** - `/build` active or done, not yet reviewed
- **In Review** - `/review` active
- **Approved** - review passed, no Critical/High bugs, ready to ship
- **Live** - shipped to production
- **Cancelled** - deliberately stopped before going live; the row stays (with a one-line reason) so the history survives
- **Retired** - was live, now taken down — note the date and what happened to any collected data

## Features

> The **Spec** column links to the feature **folder** (`features/PROJ-X-name/`): `spec.md` (always), `design.md` (when it helps), `review.md` (after review).

| ID     | Feature                                                                                                                                                                 | Priority | Depends on          | Status   | Spec                                               | Created    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- | -------- | -------------------------------------------------- | ---------- |
| PAM-1  | Device & mapping file format — devices (controls, MIDI notes, 2D positions) separated from mappings (control → MA3 action); bundled definitions for v1-supported boards | P0       | —                   | Approved | [PAM-1](PAM-1-device-mapping-file-format/)         | 2026-07-16 |
| PAM-2  | Bridge engine — ported v1 core with feature parity (faders, encoders, buttons, LED/display feedback, DeskLock), reads the new file format                               | P0       | PAM-1               | Approved | [PAM-2](PAM-2-bridge-engine/)                      | 2026-07-16 |
| PAM-3  | Setup & settings UI — console IP/ports, device selection, persisted locally                                                                                             | P0       | PAM-2               | Approved | [PAM-3](PAM-3-setup-settings-ui/)                  | 2026-07-16 |
| PAM-4  | Status & diagnostics UI — connection check, plugin check, port diagnosis, MIDI test mode                                                                                | P0       | PAM-2, PAM-3        | Approved | [PAM-4](PAM-4-status-diagnostics-ui/)              | 2026-07-16 |
| PAM-5  | v1 mapping import                                                                                                                                                       | P0       | PAM-1, PAM-3        | Approved | [PAM-5](PAM-5-v1-mapping-import/)                  | 2026-07-16 |
| PAM-6  | Visual mapping editor — 2D board layout, remap controls, add buttons/faders/encoders                                                                                    | P1       | PAM-1, PAM-3        | Approved | [PAM-6](PAM-6-visual-mapping-editor/)              | 2026-07-16 |
| PAM-7  | Mapping/device export & import + support package (community sharing)                                                                                                    | P1       | PAM-1, PAM-3, PAM-6 | Approved | [PAM-7](PAM-7-mapping-export-import/)              | 2026-07-16 |
| PAM-8  | Code signing & notarization                                                                                                                                             | P2       | —                   | Roadmap  | —                                                  | 2026-07-16 |
| PAM-9  | MA3 setup assistant — plugin install into local MA3 folder + in-app console setup guide (live values); network push cut to ideas                                        | P1       | PAM-3, PAM-4        | Building | [PAM-9](PAM-9-ma3-setup-assistant/)                | 2026-07-16 |
| PAM-10 | Colored button feedback                                                                                                                                                 | P2       | PAM-2               | Roadmap  | —                                                  | 2026-07-16 |
| PAM-11 | Board-centric mapping management — boards list their mappings, board-first mapping picker/dropdown in Setup, create new (empty) mappings                                | P1       | PAM-1, PAM-3, PAM-6 | Approved | [PAM-11](PAM-11-board-centric-mapping-management/) | 2026-07-17 |
| PAM-12 | Command-line aware executor buttons (CMD mode, plugin v2) — console keyword + board button targets executors; oops-clean macros; occupancy; version handshake           | P1       | PAM-2, PAM-4        | Approved | [PAM-12](PAM-12-cmd-mode/)                         | 2026-07-17 |
| PAM-13 | Self-configuring plugin — merge the two UserPlugins into one; auto-check/create the two OSC entries on start (warn if not possible); fix bundled OSC config to ship both  | P1       | PAM-2, PAM-9, PAM-12 | Spec'd   | [PAM-13](PAM-13-self-configuring-plugin/)          | 2026-07-18 |
| PAM-14 | First-run setup wizard — linear onboarding from launch to a verified connection (move-a-fader success); reuses existing screens                                          | P1       | PAM-3, PAM-4, PAM-9 | Spec'd   | [PAM-14](PAM-14-first-run-setup-wizard/)           | 2026-07-18 |
| PAM-15 | Plugin auto-start / OSC re-arm (best effort) — re-trigger the plugin via OSC when reachable but not answering; no native autostart, honestly labeled                    | P1 later | PAM-4, PAM-13       | Spec'd   | [PAM-15](PAM-15-plugin-auto-rearm/)                | 2026-07-18 |
| PAM-16 | Config handshake — app tells the plugin which executors + feature flags to watch (from mapping + settings), with a periodic re-sync that self-heals a stuck plugin       | P1       | PAM-2, PAM-12, PAM-3 | Spec'd   | [PAM-16](PAM-16-config-handshake/)                 | 2026-07-18 |
| PAM-17 | UX review follow-ups — notices over the editor (High), clipboard/retry recoverability, selectable text, modal/tab a11y, jargon &amp; copy cleanup, editor keyboard nav        | P1       | PAM-3, PAM-4, PAM-6 | Spec'd   | [PAM-17](PAM-17-ux-review-followups/)              | 2026-07-18 |
| PAM-18 | QuickKey dropdown + uninstall + confirmed-native key handling — dropdown from one canonical key list (no free text); "Remove QuickKeys" cleanup; EvoFaderWing review baked in (executors stay CMD, hardkeys stay QuickKey) | P1       | PAM-6, PAM-1, PAM-2 | Building | [PAM-18](PAM-18-quickkey-dropdown/)                | 2026-07-19 |
| PAM-19 | Mapping status — draft / community / tested badge per mapping (self-declared), shown in lists &amp; pickers; supports community sharing                                    | P2       | PAM-1, PAM-11, PAM-7 | Building | [PAM-19](PAM-19-mapping-status/)                   | 2026-07-19 |

<!-- Add features above this line -->

**Recommended build order:** PAM-1 → PAM-2 → PAM-3 → PAM-4 → PAM-5 = MVP release, then PAM-6/PAM-7 (P1), then P2. New onboarding/plugin cluster (P1): PAM-13 + PAM-16 together (both regenerate the plugin) → PAM-14 (wizard, reuses PAM-9) → PAM-15 (later, best-effort re-arm).

## Next Available ID: PAM-20

## Operations

_Filled by `/ship` at the first production release. A live product is in operations: it has an owner and a lightweight recurring review — that's the whole handoff._

- **Owner:** —
- **Ops review:** every 3–6 months, ~30 min, key stakeholder + maintainer (the owner makes sure it happens)
- **Last review:** —
- **Last release:** —
