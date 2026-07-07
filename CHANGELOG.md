# Changelog

## 1.4.0.0 — unreleased

### Breaking changes

- **QuickKeys are now created and triggered by name.** Buttons mapped with `quicKey` trigger QuickKeys named `pam-osc_<KEY>` (e.g. `pam-osc_CLEAR`). The Lua plugin creates all of them automatically on startup (QuickKey pool, starting at slot 1000, skipping occupied slots — they are stored in your showfile). **Run the v1.4 Lua plugin on the console once before using the new module version**, otherwise QuickKey buttons do nothing.
- **Fader values now use the MA3-native 0-100 range** (previously 0-127). You no longer need to change the fader range to 127 in the MA3 OSC settings — leave it at (or reset it to) the default. If you built custom Open Stage Control panels whose fader widgets send 0-127, change their range to 0-100.
- Relative encoders acting as faders now step in 0-100 units (one tick = 1% instead of 1/127).

### New features

- **Connection check:** on startup the module pings the console and reports in the Open Stage Control terminal whether GrandMA3 is reachable and whether the pam-osc plugin is running — including hints on what to check (send option, MA3 OSC settings, firewall). Retries every 30 seconds until the connection works.
- **Port diagnosis:** if the connection check gets no response, pam-osc checks its local OSC input port and names the process that blocks it (e.g. `UDP port 8080 is already used by "QLab"`) — or reports that the port is fine or was not opened at all (works on Windows, macOS and Linux).
- **MIDI output test:** on startup, every device plays a short animation (~3.5 s) — a running light across all mapped LEDs and a wave through the motor faders and encoder rings — so you can immediately see whether the MIDI connection works.
- **OSC entry by name:** name your MA3 OSC entry `pam-osc` and the plugin/module use it regardless of its line number. Without that name, line 2 is used (as before).
- **Better encoder support:** encoders work with encoder commands and allow different actions while the MA button is held (#29).
- **Full 14-bit resolution for motor faders:** pitch-based fader values are no longer rounded to 127 steps.

### Fixes & improvements

- Fixed wrong negative encoder values.
- A missing mapping file or an unknown MIDI device no longer crashes the module — it is skipped with a clear error message in the terminal.
- Missing `send`/`midi` options are reported with a clear error message instead of crashing.
- The loaded MIDI mappings are logged on startup.
- Button feedback without a `buttonFeedbackMapper` falls back to plain on/off values (127/0).
- Removed leftover debug output (encoder logs, settings dialog).
- README reworked: clearer feature list, production disclaimer, Discord link, troubleshooting and update notes.
