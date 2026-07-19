# PAM-15 — Design

**Date:** 2026-07-19 · **Priority: P1 — later**

> Technical design (HOW). No code — implementation-grade precise. Contract lives in `spec.md`.
> **This design is gated on one onPC fact** (can OSC command input invoke a plugin?). Until that's
> verified, only the architecture and the opt-in/backoff behaviour are settled; the core mechanism
> (AC-2) is pending and may collapse the feature to "improved guidance only".

## Component Structure

```
App (engine)
+-- ReArmController (opt-in; off by default)
    +-- watches the PAM-4 connection state
    +-- on "reachable but plugin not answering" → attempt a re-trigger (bounded)
    +-- on success (pong returns) → reset; on N failures → back off + fall back to guidance
```

## Data Model

```
App Settings gains (global):
- autoRearm: boolean — default false. Opt-in; honestly labelled "Try to re-run the plugin
  automatically (best effort)".

Transient (engine): retry counter + backoff timer per connection episode. Not persisted.
```

## Behaviors & Access

- **Trigger (AC-1):** only when `autoRearm` is on AND PAM-4 reports reachable-but-plugin-missing.
- **Re-trigger (AC-2, onPC-pending):** send an OSC command-line call that runs the plugin (e.g. `Plugin "pam-osc"`) via the receive-command entry. **Feasibility unverified** — see Open Questions.
- **Honest opt-in (AC-3):** off by default; label never promises guaranteed always-on.
- **Bounded retries (AC-4):** stop after a small fixed number of attempts (proposed: 3, spaced by backoff), then fall back to the existing "please run the plugin" guidance; never spam the console or log.
- **No interference (AC-5):** while the plugin answers normally, ReArmController sends nothing.

**Access:** local; acts only on the user's configured console connection.

## Tech Decisions

- **Opt-in, off by default:** silently re-firing commands at a live console is surprising; the user must choose it knowingly.
- **Reuse the PAM-4 connection state as the trigger:** no new detection logic — the "plugin not answering" state already exists.
- **Bounded, backed-off, guidance fallback:** MA3 has no native autostart; when re-arm can't work (real console, restricted input, non-master station) the feature must degrade quietly to guidance.

## Dependencies

- None new. Consumes PAM-4 (connection state) and the OSC send path; needs PAM-13's reliably-present OSC entries.

## Build Plan

_Deferred until the onPC linchpin is verified. If AC-2 is feasible: Level 1 add `autoRearm` setting; Level 2 ReArmController (trigger + backoff) in the engine; Level 3 the opt-in UI + honest labelling. If infeasible: the feature becomes a documentation/guidance improvement only._

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| -------- | --------- | ---------------------- | --------- | ---- |
| Opt-in best-effort, off by default | No native autostart; over-promising erodes trust | On by default | Users must discover/enable it | 2026-07-19 |
| Gate the whole design on the onPC linchpin | The core mechanism may be impossible; designing detail now would be waste | Fully design now | Feature stays "later" until verified | 2026-07-19 |

## Open Questions

- [ ] **onPC-pending — LINCHPIN: can OSC command input invoke a plugin?** Verify that an OSC message on the receive-command entry can execute `Plugin "pam-osc"` and actually start the loop. If not, AC-2 is infeasible → feature degrades to guidance only.
- [ ] **onPC-pending — session-master only:** external OSC inputs are processed only on the session-master station; document the limitation.
