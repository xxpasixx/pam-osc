# Review — PAM-35

**Reviewed:** 2026-10-08
**Where tested:** local, `v2` at `2ef75ea` (implementation `1a3defe`, MA3 tab since rebuilt by PAM-36 `fe97df2`/`6cffdab`). I ran `vitest run wizard-logic.test.ts osc-config.test.ts feedback-ip.test.ts connection.test.ts ma3-install.test.ts`: 5 files, 48 tests, all green. `tsc --noEmit` is clean. I did not re-run the full suite, because another reviewer may be using the virtual MIDI ports at the same time. Everything else here comes from static review of the current code: `SetupWizard.tsx`, `Ma3SetupView.tsx`, `ConnectionCheck.tsx`, `wizard-logic.ts`, `ConsoleSection.tsx`, `StatusView.tsx`, `shared/osc-config.ts`, `shared/feedback-ip.ts`, `core/engine/connection.ts`, `main/index.ts`, `main/ma3-install.ts` and `preload/index.ts`. **Not tried in a running app or against onPC or a desk.**
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] **AC-1:** `STEP_TITLES` (`SetupWizard.tsx:28-35`) has exactly the six spec steps. The header list and the "Step N of 6" counter come from the same array and the same `step`, so they always agree. No card carries a "Step N" heading. OscCard and PluginCard do have short `<ol class="guide-steps">` sub-step lists (1-3). I read those as instructions inside a step, not as a competing step number.
- [x] **AC-2:**
  - Each chosen controller has a live LED and text from `inputPortConnected(mapping, midiPorts.inputs)` (`SetupWizard.tsx:191-208`). `midiPorts` follows hot-plug via `onMidiPorts` (`App.tsx:112`).
  - MIDI in and MIDI out can be re-picked with `PortPicker`.
  - Next is disabled until `controllersReady` passes: at least one controller, each with an input port (`wizard-logic.ts:93-95`, tested).
- [x] **AC-3:**
  - There is a radio pair. "onPC on this computer" sets `127.0.0.1`, and the typed network address is restored when switching back.
  - The IP/hostname field appears only on the network route.
  - Ports sit under `<details>`, and the summary shows their current values. It opens automatically when a port has an error.
  - No check runs in this step. Next saves and applies the settings. If saving fails, Next still moves on (see BUG-2).
- [x] **AC-4:** `primary`/`secondary` follow `consoleRoute(address)`. The other route stays reachable behind "Use a USB stick or folder instead" or "Install into onPC … instead" (`Ma3SetupView.tsx:645-649, 691-699`). When no onPC is found, the empty state says so and points to the USB/folder route (`:222-227`).
- [x] **AC-5** (generator and validation pass; **verify on onPC** that the import keeps the values):
  - **Generated, not static.** Both onPC install and USB copy go through `generateOscConfig` → `writeGeneratedOscConfig` → `installFile` (`main/index.ts:299-305, 333-344, 409-418`).
  - **Contents.** There is a receive entry on `sendPort` and a send entry named exactly `pam-osc` with DestinationIP = feedback IP and Port = `receivePort`. The toggle set matches the bundled export. Byte parity with `gma3_library/inout/osc/pam-osc.xml` is tested.
  - **Main-process validation.** `parseOscConfigValues` checks for strict IPv4: the whole string is matched by an anchored regex, octets are ≤ 255, and no `m` flag lets a trailing newline through. Ports must be integers of type `number` in 1-65535. The IP is the only string that reaches the XML, so attribute or markup injection isn't possible (tested).
  - **File paths.** The file name is fixed and the output directory is under `userData`. The targets are still limited to detected onPC bases and to detected or dialog-picked drives (PAM-9/PAM-23 gates unchanged).
  - **Feedback-IP pick.**
    - Console on this computer → `127.0.0.1`.
    - Exactly one subnet match → auto-pick.
    - Several matches or a hostname → preselected with a visible "make sure" hint.
    - IPv4 console outside all our subnets → hint.
    - No address → explained, and Install/Copy is disabled.
    - Gap: with a single local address that is *not* on the console's subnet, the pick happens without a hint (BUG-4).
- [x] **AC-6:**
  - The guide leads with Interface → **Import** the generated `pam-osc` config → check both entries with live values (`Ma3SetupView.tsx:491-505`).
  - The manual two-entry setup is behind a "by hand instead" disclosure with live values. It has Receive + Receive Command on the send port, and the send entry is named `pam-osc` → this computer on the receive port with only Send Command on.
  - With the "reachable" target, both `plugin-missing` and `plugin-outdated` count as success: `ok` LED, "OSC works — Next: start the plugin" (`wizard-logic.ts:126-145`, tested).
- [~] **AC-7: partial.**
  - The guide covers importing and running the plugin. The "connected" target works. On success the step invites the user to move a fader.
  - An outdated plugin shows the update hint (`wizard-logic.ts:156-162`).
  - Missing controllers are named, and in that case the blanket "You're live" is not shown.
  - Not met: "**each** chosen controller shows bound/missing". Only the missing ones are listed, and only once the console is connected. A chosen mapping with no `DeviceStatus` entry counts as fine. See BUG-5.
- [x] **AC-8:**
  - `ConnectionCheck` starts the bridge once per activation when it is stopped and something is bound. If the bridge is already running it does a quiet check right away. Then it polls every 5 s (`POLL_MS`) while `live && running && !reached` (`ConnectionCheck.tsx:41-62`).
  - Quiet checks emit no `checking` state and only log when the result changes (`connection.ts:75-131`, tested).
  - The IPC handler skips the port-diagnosis reset for quiet checks (`main/index.ts:765-771`).
  - The session log records connection-state *changes* only (`main/index.ts:149-155`).
  - The v1 retry timer (30 s) is cleared by every 5 s poll, so it can't interfere while polling.
  - Remaining wrinkle: once the "reachable" target is reached in wizard step 5, polling stops and the v1 retry brings back a ~3 s "checking" flicker every 30 s (BUG-3).
- [x] **AC-9:** the current PAM-36 checklist keeps the order **1 Copy the files to GrandMA3 · 2 Set up OSC on the console · 3 Import & start the plugin** (`Ma3Checklist.tsx:5-9, 47`, `ma3-checklist.ts:43`).
  - The files step uses route-dependent primary/secondary.
  - The OSC step's "reachable" readout reads the shared state that the plugin step polls. There is one live check per tab, as intended (PAM-36 AC-4).
  - The plugin step is live with the "connected" target.
- [x] **AC-10:** `UNREACHABLE_HINTS` describe both entries correctly: receive on the send port with Receive + Receive Command, and send named exactly `pam-osc` → this computer, receive port, only Send Command. There is no v1 "line 2" and no "port = send port" for the send entry. An "Open MA3 setup guide" button sits under the hints (`StatusView.tsx:16-20, 129-133`).
- [x] **AC-11:** the labels read "Send port — MA3 listens here" and "Receive port — pam-osc listens here (feedback)" (`ConsoleSection.tsx:65, 75`). `ConsolePortFields` is shared by the Setup tab and wizard step 3.

### Edge cases

- [ ] **EC-1: fails in part.** With no controller, the steps 5-6 readout explains it: "No controller selected — the check needs a running bridge. Pick a controller first." Next and Finish still work. But there is **no link back to the Controller step** (BUG-1).
- [x] **EC-2:** for a hostname console, the only address is used ("single"), or the first candidate with an "ambiguous" hint (`feedback-ip.ts:61-65`, tested).
- [x] **EC-3:** if the setup is already working, the existing `connected` state is shown immediately. The kick-off does a quiet re-check and nothing polls, because the target is already reached.
- [x] **EC-4:** onPC install goes through `installFile` without overwrite, which returns `exists` → Replace/Keep. The USB copy checks *both* targets before it generates or writes anything (`main/index.ts:395-405`).

### Security (red team)

- **XML injection / file content:** pass. The validation in the main process doesn't depend on the renderer. The only free-form value is a strict IPv4, and ports are integers.
- **Path traversal:** pass. `installMa3Asset` only accepts bases this app detected itself. `copyPluginToUsb` only accepts drives it detected or folders picked through the dialog. The generated file goes to a fixed name under `userData`.
- **Defense in depth (Info):**
  - The main process doesn't check that `feedbackIp` is one of this computer's addresses, or that the ports match the saved settings. A compromised renderer could write a well-formed config pointing elsewhere. That doesn't matter much, because the renderer can already copy files to the same targets.
  - `isIpv4` accepts leading-zero octets such as `010.0.0.1`. `os.networkInterfaces()` never produces those.
- **IPC `checkConnection({quiet})`:** strict `=== true` check. Any other value falls back to a normal check. Pass.
- **Logging:** the session log records feedback IP and ports. That is local network config, not personal data, and it's appropriate for the support package.

### Bugs

**BUG-1: EC-1, no link back to the Controller step in steps 5-6**

- **Severity:** Medium (an explicit edge-case requirement isn't met. The workaround is pressing Back three or four times.)
- **Where:** `app/src/renderer/src/components/SetupWizard.tsx:322-383`; readout text at `app/src/renderer/src/wizard-logic.ts:113-118`
- **Steps:** In step 2 choose "Continue without one for now" → Next through to step 5 or 6.
- **Expected:** an explanation plus a button or link that jumps to step 2.
- **Actual:** only the text "Pick a controller first." There is no jump. Step 6 shows no other hint in this state, because both success paragraphs and "Not green yet?" require `activeMappings.length > 0`.

**BUG-2: wizard step 3 "Next" moves on even when saving fails**

- **Severity:** Low (client validation mirrors the server's, so this is rare. The logic is inherited from PAM-14.)
- **Where:** `SetupWizard.tsx:117-125` together with `App.tsx:143-164`. `save` swallows rejections and server field errors, and `goApplyThen` always calls `setStep(next)`.
- **Effect:** step 4 generates the OSC config from the unsaved draft, while the bridge keeps running with the old settings. The checks in steps 5-6 then test the old address or ports. Server field errors only show in step 3, which is no longer visible.
- **Fix idea:** have `onApply` return success, and stay on step 3 when it fails.

**BUG-3: after the "reachable" target is reached, the v1 retry flickers "checking" every 30 s**

- **Severity:** Low
- **Where:** `app/src/core/engine/connection.ts:133` (`this.sendPing()` drops `quiet`) together with `ConnectionCheck.tsx:57-62` (polling stops once the target is reached)
- **Steps:** Wizard step 5, the console answers but the plugin isn't running (`plugin-missing`), so the step is green. Wait about 30 s.
- **Actual:** the checker's own retry sends a non-quiet ping. The step-5 readout flips to "Checking the connection …" for about 3 s, then back to green, roughly every 30 s. Each time the session log gets "checking connection … (attempt N)" plus the result line. This is v1 retry behaviour (at most 20 attempts), not a flood. But it is exactly the flicker that AC-8 wants to avoid on a step that is showing its result.
- **Fix idea:** keep `quiet` for retries that follow a quiet check, or have the readout hold the last settled result, as PAM-36 does with `settledConnection`.

**BUG-4: single local address outside the console's subnet is picked without a hint**

- **Severity:** Low
- **Where:** `app/src/shared/feedback-ip.ts:64`
- **Details:** the console is `10.0.0.5` and the only local address is `192.168.1.20`, so the reason is `single`. The dropdown shows the address with no hint. A likely typo in the console IP goes unnoticed, and the config is generated for it. The `no-subnet-match` hint already exists. It only fires when there are two or more candidates.
- **Fix idea:** check for an IPv4 target with no match before the `single` fallback. Keep `single` for hostnames only (EC-2).

**BUG-5: AC-7, controllers aren't shown one by one, and an unlisted mapping counts as fine**

- **Severity:** Low
- **Where:** `SetupWizard.tsx:140-141, 357-372`
- **Details:**
  - Step 6 names only `devices` with `state === "missing"`, and only once connected. There is no bound/missing line per chosen controller.
  - A chosen mapping that has no `DeviceStatus` entry, for example because the engine skipped it after a load issue, is neither missing nor bound, so "You're live" still shows.
- **Fix idea:** iterate over `activeMappings`, look each one up in `devices`, and treat "not found" as not bound.

**BUG-6: the USB route under "onPC on this computer" writes a 127.0.0.1 config without a warning on the card**

- **Severity:** Low
- **Where:** `Ma3SetupView.tsx:375, 644-649`
- **Details:** in the "this computer" route, the secondary USB card is titled "(console or another computer)", but it copies a config whose feedback goes to `127.0.0.1`. That config is unusable on a real desk. OscTargetCard does say so above it, but the USB card itself doesn't. Suggestion: one line on the USB card when the route is this-computer ("switch to 'another computer' in step 3 for a real console").

**Info (no action needed for this feature):**

- The MA3 tab generates the config from the *draft* console values (`App.tsx:597`), even when they are unsaved. This is pre-existing PAM-9 behaviour. In the wizard, step 3 saves first.
- Unit tests cover the pure logic, the generator, validation, the quiet checker and the main-side write. The components aren't tested: wizard rendering, ConnectionCheck kick-off and polling, the EC-1 view.

### Open question (verify on onPC + a real desk)

- Does importing the generated file on a fresh onPC/console keep DestinationIP, Port and the Receive / Receive Command / Send Command toggles? And what exactly is the import gesture in MENU → In & Out → OSC? Not failed. This can only be checked on hardware, per the spec's Open Question.

### Verdict

- **ACs:** 10/11 pass, and AC-7 is partial (BUG-5, Low). **ECs:** 3/4 pass; EC-1 is partial (BUG-1, Medium). **Bugs:** 6 (0 Critical / 0 High / 1 Medium / 5 Low). **Security:** pass.
- **Ship:** **Approved.** No Critical or High bugs. Fix BUG-1 (small: a "Back to Controller" button next to the readout) before the next beta; BUG-2 to BUG-6 can follow. Release readiness still needs the onPC import check from the open question, and a run with at least one real device.
