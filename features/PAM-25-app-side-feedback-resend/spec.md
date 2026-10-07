# PAM-25 — App-side feedback resend (device checkbox, out of the MA3 plugin)

## Status: Spec'd

**Created:** 2026-07-23 · **Last Updated:** 2026-07-23

## Why

`resendButtons` is a v1 workaround for boards whose LEDs go stale: today it is a
**per-mapping** toggle that the PAM-16 handshake pushes to the **MA3 plugin**
(`r=` flag), which then re-sends all button states over OSC every ~1.5 s —
console traffic for a problem that is purely a **board fact**. Since v2 the app
keeps a per-unit feedback cache (replayed on rebind), so the app can re-send
stale LED state itself, locally, with zero console involvement. The toggle
therefore moves to the **device definition** (a checkbox on the board), and the
flag stops flowing to MA entirely.

## Dependencies

- **PAM-2** (engine feedback cache), **PAM-16** (config handshake carries the
  legacy flag), **PAM-1** (device format), **PAM-6** (board editor UI)

## Acceptance Criteria

- [ ] **AC-1** — Given a device definition, then it may declare an optional
      boolean `resendFeedback` (default `false`), shown in the board editor as a
      device-level checkbox ("periodically re-send feedback — for boards that lose
      LED state"); existing files load unchanged, no format-version bump.
- [ ] **AC-2** — Given a bound unit whose device declares `resendFeedback: true`,
      when the engine runs, then it periodically replays the unit's cached feedback
      (last-sent values only — no state invention) to that unit; unbound units and
      devices without the flag get nothing.
- [ ] **AC-3** — Given any combination of active mappings, when the app builds
      the `pamConfig` handshake payload, then it always sends `r=0` — the payload
      format (field order, PAM-16 v1) stays wire-compatible, but the console-side
      resend is never activated by the app anymore.
- [ ] **AC-4** — Given an existing mapping file with `resendButtons: true`, when
      it loads, then it still validates (field accepted, deprecated) but has no
      effect, and the mapping editor no longer offers the per-mapping toggle.

## Out of Scope

- **Removing `r=` from the payload format** — the plugin's v1 parser expects the
  fixed field order; the field stays, pinned to `0`.
- **Plugin-side cleanup** (dropping the dormant `automaticResendButtons` tick
  from `pam-OSC.lua`) — separate plugin release with its own version bump.
- **Resend for motor faders/displays beyond the cache replay** — the cache
  already holds exactly what was last sent; nothing new is computed.

## Open Questions

- [ ] Resend interval: default ~2 s (v1 console-side was ~1.5 s) — confirm
      during `/design`/`/build`.

## Decision Log

### Product Decisions

| Decision                                                                  | Rationale                                                                                   | Date       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| Resend is a **device** fact (checkbox on the board), not a mapping toggle | Whether LEDs go stale depends on the hardware, not on what's mapped                         | 2026-07-23 |
| The flag stops flowing to the console (`r=0` always)                      | The app owns feedback state (cache); console resend is redundant traffic and a second truth | 2026-07-23 |
| Keep `resendButtons` accepted-but-ignored in mapping files                | Shared/older mappings must keep loading; strict schema would reject them                    | 2026-07-23 |
