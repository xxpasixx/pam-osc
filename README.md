# pam-osc

Control GrandMA3 with MIDI devices over Open Stage Control and a plugin to get feedback for motorized faders and button lights.

## Features

- **MIDI Control:** Send fader, encoder, and button values to GrandMA3 executors on the current page
- **WYSIWYG Playback:** Executes what you see in the playback window (configurable: Master, Speed, Temp, Flash, etc.)
- **Motorized Fader Feedback:** Real-time position feedback for motorized faders
- **Command Integration:** Send commands, control attributes, and execute QuickKeys (automatically created)
- **LED Feedback:** Button LED feedback for running sequences, highlights, and more
- **Visual Displays:** Show current sequence, cue, and color appearance on xTouch LED displays
- **Desk Lock Protection:** Input is blocked when GrandMA3 is in DeskLock mode; motorized faders automatically reset upon unlock
- **Enhanced Encoder Support:** Works with encoder commands and allows different actions when the **MA** button is pressed
- **Connection Check:** Automatic ping on startup that tells you whether GrandMA3 is reachable and whether the pam-osc plugin is running
- **MIDI Output Test:** A short startup animation (LED running light + a wave through the motor faders) on every device, so you can verify the MIDI connection at a glance

All changes per release: [CHANGELOG.md](CHANGELOG.md)

<a href="http://www.youtube.com/watch?feature=player_embedded&v=GCBT6tBH6DE
" target="_blank"><img src="http://img.youtube.com/vi/GCBT6tBH6DE/0.jpg" 
alt="Youtube Video" width="240" height="180" border="10" /></a>

## Can I use this on a live show?

If you want to use this in a production environment, ensure you have thoroughly tested it in your specific setup before using it.

This software was primarily developed for pre-programming sessions and is provided "as-is" without warranty of any kind.

**Disclaimer:** The author assumes no liability or responsibility for any issues, malfunctions, or damages that may occur during live shows or production use. Use at your own risk.

Tested with Grandma3 Version **2.3.1.1**

## How to Setup

[Setup Instructions](https://github.com/xxpasixx/pam-osc/wiki/Setup)

### MA3 OSC entry

Name the OSC entry in the MA3 OSC settings `pam-osc` — pam-osc then finds it no matter which line it is in. Without that name, line **2** is used (like in the setup guide).

Since v1.4, fader values are exchanged in the MA3-native **0-100** range — you no longer need to change the fader range to 127 in the MA3 OSC settings, just leave it at the default.

Something is not working ?

Check the terminal where Open Stage Control is running: on startup, pam-osc pings the console and tells you whether GrandMA3 is reachable and whether the pam-osc plugin is running — including hints on what to check (send option, MA3 OSC settings, firewall). The check retries every 30 seconds until the connection works.

If no response arrives, pam-osc also checks its local OSC input port and names the program that blocks it (e.g. `UDP port 8080 is already used by "QLab"`), or tells you when the port is fine and the problem is more likely the MA3 destination settings or a firewall.

Also watch your MIDI device on startup: pam-osc plays a short animation (a running light across the LEDs and a wave through the motor faders, about 3.5 seconds). If nothing lights up, the problem is on the MIDI side (device name or connection). If the animation plays but nothing else works, the problem is on the OSC/MA3 side.

Please make sure you followed all the steps correctly. If something still doesn't work, you can get help on our [Discord](https://discord.gg/4dcKjTH9Pm)

## QuickKeys (changed in v1.4)

Buttons mapped with `quicKey` now trigger QuickKeys named `pam-osc_<KEY>` (e.g. `pam-osc_CLEAR`). The pam-osc plugin creates these automatically in the QuickKey pool when it starts on the console (starting at slot 1000, skipping occupied slots). The created QuickKeys are stored in your showfile.

**Breaking change:** Run the updated Lua plugin (v1.4) on the console at least once before using the new module version — otherwise QuickKey buttons will do nothing.

## Known Limitations

Currently it is only possible to give Midi Feedback for Channel 1.

## Found an Issue ?

Issues could happen. Please create a [Ticket](https://github.com/xxpasixx/pam-osc/issues) if you find something.

## Upcoming things

- more predefined Devices
- colored button feedback
- add for LED Feedback: Freeze, Prvw, Fixture, Channel, Edit, Update, Align, At, Clear
- Dynamic Attribute Encoder https://forum.malighting.com/forum/thread/9089-get-encoder-pool-in-lua-plugin
- Show PageID instead of Timecode Slot on the XTouch
