# PAM-32 — MA3 Lua API deprecation: HasActivePlayback → IsRunningPlayback

> Lite spec, written inline during build (2026-09-10).

## Why

A newer GrandMA3 release deprecated the Lua API function `HasActivePlayback()` in
favour of `IsRunningPlayback()`. The plugin calls the old name once
(`pam-OSC.lua:552`), inside the executor loop of the ~10 Hz main loop, for every
watched executor — up to 104 of them (101–122, 201–222, 301–322, 401–422,
191–198, 291–298). The console therefore emits up to ~1000 deprecation warnings
per second into the System Monitor.

Observed effect on the maintainer's console: the app reports **"plugin not
running" while the plugin is demonstrably running**. The pong that proves
liveness (`/status/pluginPong`) is sent with `Cmd('SendOSC …')` from inside that
same loop (`pam-OSC.lua:461`); under the log flood it no longer arrives within
the app's ping timeout, so the connection check concludes the plugin is absent.
Feedback degrades with it.

The plugin must keep working on **GrandMA3 2.x** (PRD constraint), so the old
name cannot simply be replaced — the new one may not exist there.

## Acceptance Criteria

- **AC-1** The plugin calls `IsRunningPlayback()` when the MA3 build provides it,
      and falls back to `HasActivePlayback()` when it does not — so no
      deprecation warning is emitted on new builds and old 2.x builds keep
      working unchanged.
- **AC-2** The method is resolved **once** and reused, not probed per call: the
      detection must not itself run at loop frequency (that would trade one flood
      for another).
- **AC-3** The playback read is wrapped so a raising call can never unwind the
      main loop (today's comment at `pam-OSC.lua:548` notes it is deliberately
      unguarded); on failure the button state degrades to "not running" rather
      than killing the plugin.
- **AC-4** Which method was selected is logged **once** at resolution time, so a
      support package shows what the console offered.
- **AC-5** The plugin file version in `app/scripts/build-plugin-xml.mjs` is
      bumped (mini/patch component), so an install mismatch stays visible.
      `PLUGIN_PROTOCOL` does **not** move — the app↔plugin wire contract is
      unchanged.

## Out of Scope

- Auditing the other four MA3 object methods (`CurrentChild`, `Children`,
  `GetFader`, `Find`) for future deprecations — none warn on the maintainer's
  build; revisit when one does.
- Reducing the default 104-executor watch-set or the 10 Hz tick — a real
  efficiency question, but not this bug (parked in `docs/ideas.md`).
- The dormant `automaticResendButtons` tick (already out of scope in PAM-25).

## Open Questions

- [ ] Which MA3 version introduced `IsRunningPlayback` — not needed for the
      fallback approach, but worth recording in the README compatibility note
      once known.
- [ ] Whether "plugin not running" fully clears once the flood stops, or whether
      the ping timeout also needs raising — verify on hardware after the fix.
