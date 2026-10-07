# PAM-35: Design notes (decisions log from /build)

> Built straight from the spec. This file only records the non-obvious technical choices, so `/review` and later work don't have to reverse-engineer them.

## Generated OSC config (AC-5)

- **One generator, two routes.** `shared/osc-config.ts` builds the XML. The main process validates the renderer's values (`parseOscConfigValues`: strict IPv4 plus ports 1–65535; the IP is the only string that reaches the XML, so the IPv4 check also rules out markup injection). It then writes the file to `userData/generated/osc/pam-osc.xml` (`writeGeneratedOscConfig` in `main/ma3-install.ts`). From there, the existing `installFile()` copies it into an onPC library or onto a stick, so the exists / replace-confirm / manual-copy-source rules of PAM-9 and PAM-23 apply unchanged.
- **Attribute style mirrors the maintainer's export.** Toggles that should be on are omitted, because MA3 exports leave defaults out. Only `DestinationIP` and `Port` vary. The receive entry also gets this computer's address as `DestinationIP`: this is harmless for a receive entry and correct if MA3 ever filters by it.
- **Parity with the bundled file.** Generating with the default values (`127.0.0.1`, 9003/9004) reproduces `gma3_library/inout/osc/pam-osc.xml` byte for byte (`osc-config.test.ts`). The receive-entry name typo `pam-osc-recive` was fixed to `pam-osc-receive` in both places (the name is functionally irrelevant).
- **"Reveal OSC config"** now shows the last generated file (the bundled default when none exists yet).

## This computer's address (AC-5, EC-2)

- `shared/feedback-ip.ts` picks the address: loopback for a console on this computer, otherwise the one local address on the console's subnet (main now sends `{address, netmask}` instead of bare IPs). Every other case is shown and flagged, never guessed silently: `ambiguous` (several match, or a hostname), `no-subnet-match` (an IPv4 console outside all of our subnets) and `none`.
- The user's pick is **not persisted** (spec Out of Scope). It lives in `App` state so it survives wizard steps and tab switches, and a stale pick falls back to the auto-pick.

## Staged live checks (AC-6/7/8)

- **Quiet re-check** (`ConnectionChecker.checkNow({ quiet: true })`): no `checking` emit in between, so nothing flickers. The engine log only records a result that differs from the previous one. The IPC handler skips the port-diagnosis reset for quiet checks (a diagnosis runs once per failure streak, not every 5 s). The session log in `main/index.ts` now records connection-state **changes** only, which preserves the normal path, where `checking` and the result alternate.
- `ConnectionCheck` (renderer) owns kick-off and polling. When `live`, it starts the bridge **once per activation** if it is stopped and something is bound; otherwise it re-checks immediately, then every 5 s until the target is reached. A user who stops the bridge while the step is open is not overridden.
- The **MA3 tab** polls via the step 3 check (target "connected"); the step 2 check only reads the shared state, so there is never a double poll.
- Readouts are pure (`checkReadout` in `wizard-logic.ts`, unit-tested): "console answers, plugin not yet" is success for the OSC step and a warning for the plugin step.

## IPC contract changes

- `Ma3SetupInfo`: `localIps: string[]` became `localAddresses: {address, netmask}[]`, and `hasBundledOscConfig` was removed (the config is always generated now).
- `installMa3Asset(base, asset, overwrite, osc?)`, `copyPluginToUsb(driveId, overwrite, osc)` and `checkConnection({ quiet }?)`.

## Verification notes

- Unit: generator + parity, IP pick, quiet checker, wizard logic, main-side write + install (tmp dirs).
- Driven in the real app (isolated `--user-data-dir`, a fake MA3 on UDP 9003). The OSC step turned green when the fake console started answering, the plugin step turned green when it answered `pluginPong`, polling ran every ~5 s, and the session log held one line per state change. The missing controller was named in the success state.
- **Not verified:** importing the generated file on a real onPC/console (spec Open Question).
