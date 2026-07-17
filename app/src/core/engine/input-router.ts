import type { MidiInputEvent } from "../../transports/midi.js";
import type { OscMessage } from "../../transports/osc.js";
import { oscFloat, oscInteger, oscString } from "../../transports/osc.js";
import { cmdModeActive } from "./cmd-keys.js";
import type { UnitRuntime } from "./device-manager.js";
import { sendAttributeLeds, sendButtonFeedback } from "./feedback-out.js";
import { midiKey, type RoutingEntry } from "./routing-table.js";
import { accumulatorKey, type RuntimeState } from "./state.js";
import { handleTimecodePlayPause, handleTimecodeSelect } from "./timecode.js";
import type { EngineTiming } from "./types.js";
import { MA3_KNOB_THRESHOLD, PITCH_MAX, relativeDetents } from "./v1-compat.js";

/**
 * MIDI → MA3, the v1 parity table from design.md. Every scaling formula is
 * v1's, byte for byte; the routing itself is driven by the PAM-1 format
 * (control type + action type) instead of v1's parallel maps.
 */

export interface InputContext {
  state: RuntimeState;
  sendOsc: (message: OscMessage) => void;
  /** All unit runtimes — attribute LEDs update across devices. */
  allUnits: () => UnitRuntime[];
  timing: EngineTiming;
  /** CMD mode (PAM-12): an intercepted executor press enters the serialized queue. */
  enqueueCmdKey: (executor: number) => void;
  log: (line: string) => void;
}

export function handleMidiEvent(context: InputContext, unitRuntime: UnitRuntime, event: MidiInputEvent): void {
  // AC-8: while the desk is locked nothing MIDI-originated happens at all.
  if (context.state.deskLocked) {
    context.log(`desk is locked — blocking MIDI event from "${unitRuntime.unit.mapping.midiPort.input}"`);
    return;
  }

  const unit = unitRuntime.unit;
  switch (event.kind) {
    case "cc": {
      const entries = unit.byCc.get(midiKey(event.channel, event.controller));
      if (!entries) return; // EC-1: unmapped events are ignored
      for (const entry of entries) handleCcEntry(context, unitRuntime, entry, event.value);
      return;
    }
    case "pitchbend": {
      const entries = unit.byPitch.get(event.channel);
      if (!entries) return;
      for (const entry of entries) handlePitchEntry(context, entry, event.value);
      return;
    }
    case "note": {
      const entries = unit.byNote.get(midiKey(event.channel, event.note));
      if (!entries) return;
      for (const entry of entries) handleNoteEntry(context, unitRuntime, entry, event.value);
      return;
    }
  }
}

function handleCcEntry(context: InputContext, unitRuntime: UnitRuntime, entry: RoutingEntry, value: number): void {
  const { control, assignment } = entry;

  // Absolute CC fader (incl. absolute knobs) → executor fader, v1 formula.
  if (control.type === "fader") {
    if (assignment.action.type !== "executor") return; // warned at startup
    context.sendOsc({
      address: `/Page${context.state.page}/Fader${assignment.action.number}`,
      args: [oscFloat((value / 127) * 100)],
    });
    return;
  }

  if (control.type !== "encoder") return;
  const detents = relativeDetents(
    value,
    control.capabilities.encoding.increment,
    control.capabilities.encoding.decrement
  );
  if (detents === undefined) return; // outside both ranges — ignored (documented deviation)

  if (assignment.action.type === "executor") {
    const executor = assignment.action.number;
    const amount = assignment.options?.amount ?? 1;

    // MA3 rotary-knob executors additionally get the relative Encoder message (v1).
    if (executor > MA3_KNOB_THRESHOLD) {
      context.sendOsc({
        address: `/Page${context.state.page}/Encoder${executor}`,
        args: [oscInteger(detents)],
      });
    }

    const key = accumulatorKey(unitRuntime.unit.mapping.id, control.id);
    const current = context.state.accumulators.get(key) ?? 0;
    const next = Math.min(Math.max(current + detents * amount, 0), 100) || 0;
    context.state.accumulators.set(key, next);
    context.sendOsc({
      address: `/Page${context.state.page}/Fader${executor}`,
      args: [oscFloat(next)],
    });
    return;
  }

  if (assignment.action.type === "attribute") {
    let change = detents * (assignment.options?.amount ?? 1);
    change = context.state.encoderFine ? change / 10 : change;
    change = context.state.encoderRough ? change * 10 : change;
    const plusMinus = change > 0 ? " + " : " - ";
    const attribute = assignment.action.attribute === "current" ? context.state.attribute : assignment.action.attribute;
    // v1's exact command string — including the double space after "at".
    context.sendOsc({
      address: "/cmd",
      args: [oscString("Attribute " + attribute + " at " + plusMinus + Math.abs(change))],
    });
  }
}

function handlePitchEntry(context: InputContext, entry: RoutingEntry, value: number): void {
  if (entry.control.type !== "fader" || entry.assignment.action.type !== "executor") return;
  // Full 14-bit resolution, v1 constant 16380 (AC-1).
  context.sendOsc({
    address: `/Page${context.state.page}/Fader${entry.assignment.action.number}`,
    args: [oscFloat((value / PITCH_MAX) * 100)],
  });
}

function handleNoteEntry(context: InputContext, unitRuntime: UnitRuntime, entry: RoutingEntry, value: number): void {
  const { assignment } = entry;
  // v1's exact threshold semantics: with minValue set, everything at or
  // below it — including releases — is dropped.
  const minValue = assignment.options?.minValue;
  if (minValue && value <= minValue) return;

  const action = assignment.action;
  switch (action.type) {
    case "executor": {
      // CMD mode (PAM-12 AC-2): while the console command line waits for a
      // target, an executor press selects instead of triggering. Press and
      // release always pair — an intercepted press swallows its release even
      // if the flags changed in between.
      const pressKey = accumulatorKey(unitRuntime.unit.mapping.id, entry.control.id);
      const isPress = value > 0;
      if (!isPress && context.state.interceptedPresses.has(pressKey)) {
        context.state.interceptedPresses.delete(pressKey);
        return;
      }
      if (isPress && cmdModeActive(context.state)) {
        context.state.interceptedPresses.add(pressKey);
        context.enqueueCmdKey(action.number);
        return;
      }
      // Press and release both reach MA3 (flash executors need Key 0).
      context.sendOsc({
        address: `/Page${context.state.page}/Key${action.number}`,
        args: [oscInteger(Math.round((value / 127) * 100))],
      });
      return;
    }

    case "quickKey":
      if (value <= 0) return; // fire on press only (see design notes)
      context.sendOsc({ address: "/cmd", args: [oscString(`Quickey "pam-osc_${action.key}"`)] });
      return;

    case "command":
      if (value <= 0) return; // fire on press only (see design notes)
      context.sendOsc({ address: "/cmd", args: [oscString(action.command)] });
      return;

    case "modifier":
      if (value <= 0) return; // toggles must not double-fire on release
      handleModifier(context, unitRuntime, entry, action.modifier, action.attribute);
      return;

    case "timecodeSelect":
      if (value <= 0) return;
      if (!unitRuntime.unit.timecodeEnabled) return;
      handleTimecodeSelect(context.state, context.allUnits(), action.slot);
      return;

    case "timecodePlayPause":
      if (!unitRuntime.unit.timecodeEnabled) return;
      // Needs press AND release — tap toggles on release, hold sends Off.
      handleTimecodePlayPause(context.state, context.sendOsc, context.timing, value);
      return;

    default:
      return; // display actions never react to input
  }
}

function handleModifier(
  context: InputContext,
  unitRuntime: UnitRuntime,
  entry: RoutingEntry,
  modifier: "encoderFine" | "encoderRough" | "attributeSelect",
  attribute: string | undefined
): void {
  const state = context.state;
  switch (modifier) {
    case "encoderRough":
      state.encoderRough = !state.encoderRough;
      sendButtonFeedback(unitRuntime, entry, state.encoderRough);
      return;
    case "encoderFine":
      state.encoderFine = !state.encoderFine;
      sendButtonFeedback(unitRuntime, entry, state.encoderFine);
      return;
    case "attributeSelect":
      if (!attribute) return;
      state.attribute = attribute;
      sendAttributeLeds(context.allUnits(), state);
      return;
  }
}
