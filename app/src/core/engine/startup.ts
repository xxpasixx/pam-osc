import type { OscMessage } from "../../transports/osc.js";
import { oscString } from "../../transports/osc.js";
import { sendToUnit, type UnitRuntime } from "./device-manager.js";
import { buttonFeedbackValue } from "./feedback-out.js";
import type { RoutingEntry } from "./routing-table.js";
import type { EngineTiming } from "./types.js";

/**
 * v1's MIDI output test: a wave travels across LEDs, motor faders and
 * encoder rings so the user sees on the hardware that MIDI output works.
 * Only value *changes* are sent. Runs at engine start only — never on a
 * mid-show rebind (design decision).
 */

/** v1 waveLevel: crest at wavePos, both 0..1 wrapping around. */
function waveLevel(phase: number, wavePos: number, width: number): number {
  let distance = Math.abs(phase - wavePos);
  distance = Math.min(distance, 1 - distance);
  return Math.max(0, 1 - distance / width);
}

interface AnimatedUnit {
  unitRuntime: UnitRuntime;
  pitchFaders: RoutingEntry[];
  ccFaders: RoutingEntry[];
  buttons: RoutingEntry[];
  rings: RoutingEntry[];
  lastSent: Map<string, number | boolean>;
}

function midiNumber(entry: RoutingEntry): number {
  if (entry.control.type === "display") return 0;
  return entry.control.midi.kind === "pitchbend" ? entry.channel : entry.control.midi.number;
}

function collect(unitRuntime: UnitRuntime): AnimatedUnit {
  const byNumber = (a: RoutingEntry, b: RoutingEntry) => midiNumber(a) - midiNumber(b);
  const entries = unitRuntime.unit.entries;
  return {
    unitRuntime,
    pitchFaders: entries.filter((e) => e.control.type === "fader" && e.control.midi.kind === "pitchbend").sort(byNumber),
    ccFaders: entries.filter((e) => e.control.type === "fader" && e.control.midi.kind === "cc").sort(byNumber),
    buttons: entries.filter((e) => e.control.type === "button").sort(byNumber),
    rings: entries.filter((e) => e.control.type === "encoder" && e.control.capabilities.ledRing !== undefined).sort(byNumber),
    lastSent: new Map(),
  };
}

/** The velocity a button flashes with during the animation. */
function animationOnValue(entry: RoutingEntry): number {
  return buttonFeedbackValue(entry, true) ?? 127;
}

export interface AnimationHandle {
  cancel(): void;
}

export function playStartupAnimation(
  unitRuntimes: UnitRuntime[],
  timing: EngineTiming,
  onDone: () => void,
): AnimationHandle {
  const devices = unitRuntimes.map(collect);
  if (devices.length === 0) {
    onDone();
    return { cancel: () => {} };
  }

  const totalFrames = Math.round(timing.animationMs / timing.animationFrameMs);
  const waves = 2; // v1: the wave travels across each device twice
  let frame = 0;
  let finished = false;

  const interval = setInterval(() => {
    const wavePos = ((frame / totalFrames) * waves) % 1;

    for (const device of devices) {
      const phaseOf = (index: number, list: RoutingEntry[]) => (list.length > 1 ? index / (list.length - 1) : 0);
      const sendChanged = (key: string, value: number | boolean, send: () => void) => {
        if (device.lastSent.get(key) === value) return;
        device.lastSent.set(key, value);
        send();
      };

      device.pitchFaders.forEach((entry, index) => {
        const level = waveLevel(phaseOf(index, device.pitchFaders), wavePos, 0.3);
        const value = Math.round(level * 16380);
        sendChanged(`p${entry.channel}`, value, () =>
          sendToUnit(device.unitRuntime, { kind: "pitchbend", channel: entry.channel, value }),
        );
      });

      device.ccFaders.forEach((entry, index) => {
        if (entry.control.type !== "fader" || entry.control.midi.kind !== "cc") return;
        const number = entry.control.midi.number;
        const level = waveLevel(phaseOf(index, device.ccFaders), wavePos, 0.3);
        const value = Math.round(level * 127);
        sendChanged(`c${number}`, value, () =>
          sendToUnit(device.unitRuntime, { kind: "cc", channel: entry.channel, controller: number, value }),
        );
      });

      device.rings.forEach((entry, index) => {
        if (entry.control.type !== "encoder" || !entry.control.capabilities.ledRing) return;
        const ring = entry.control.capabilities.ledRing;
        const level = waveLevel(phaseOf(index, device.rings), wavePos, 0.3);
        const value = Math.round(ring.from + level * (ring.to - ring.from));
        sendChanged(`r${ring.controller}`, value, () =>
          sendToUnit(device.unitRuntime, { kind: "cc", channel: entry.channel, controller: ring.controller, value }),
        );
      });

      device.buttons.forEach((entry, index) => {
        if (entry.control.type !== "button" || entry.control.midi.kind !== "note") return;
        const note = entry.control.midi.number;
        const on = waveLevel(phaseOf(index, device.buttons), wavePos, 0.15) > 0;
        sendChanged(`n${note}`, on, () =>
          sendToUnit(device.unitRuntime, {
            kind: "note",
            channel: entry.channel,
            note,
            velocity: on ? animationOnValue(entry) : 0,
          }),
        );
      });
    }

    frame += 1;
    if (frame > totalFrames) {
      finish();
    }
  }, timing.animationFrameMs);

  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(interval);
    allOff(devices);
    onDone();
  };

  return {
    cancel() {
      if (finished) return;
      finished = true;
      clearInterval(interval);
    },
  };
}

/** v1 sendMidiOutputTest(false): everything off/down after the animation. */
function allOff(devices: AnimatedUnit[]): void {
  for (const device of devices) {
    for (const entry of device.buttons) {
      if (entry.control.type !== "button" || entry.control.midi.kind !== "note") continue;
      sendToUnit(device.unitRuntime, { kind: "note", channel: entry.channel, note: entry.control.midi.number, velocity: 0 });
    }
    for (const entry of device.ccFaders) {
      if (entry.control.type !== "fader" || entry.control.midi.kind !== "cc") continue;
      sendToUnit(device.unitRuntime, { kind: "cc", channel: entry.channel, controller: entry.control.midi.number, value: 0 });
    }
    for (const entry of device.pitchFaders) {
      sendToUnit(device.unitRuntime, { kind: "pitchbend", channel: entry.channel, value: 0 });
    }
    for (const entry of device.rings) {
      if (entry.control.type !== "encoder" || !entry.control.capabilities.ledRing) continue;
      const ring = entry.control.capabilities.ledRing;
      sendToUnit(device.unitRuntime, { kind: "cc", channel: entry.channel, controller: ring.controller, value: ring.from });
    }
  }
}

/** v1 oscUtils.triggerForceReload — makes the plugin resend all current values. */
export function forceReloadMessage(): OscMessage {
  return { address: "/cmd", args: [oscString(`Lua 'SetVar(GlobalVars(), "forceReload", true)'`)] };
}
