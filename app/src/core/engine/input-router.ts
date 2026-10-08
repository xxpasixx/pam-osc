import type { MidiInputEvent } from "../../transports/midi.js";
import type { OscMessage } from "../../transports/osc.js";
import { oscFloat, oscInteger, oscString } from "../../transports/osc.js";
import { canonicalQuickKey } from "../format/quickkeys.js";
import { cmdModeActive } from "./cmd-keys.js";
import type { UnitRuntime } from "./device-manager.js";
import { sendAttributeLeds, sendModifierLeds } from "./feedback-out.js";
import { midiKey, type RoutingEntry } from "./routing-table.js";
import { accumulatorKey, type RuntimeState } from "./state.js";
import { handleTimecodePlayPause, handleTimecodeSelect } from "./timecode.js";
import type { EngineTiming } from "./types.js";
import { MA3_KNOB_THRESHOLD, PITCH_MAX, relativeDetents, signedDetents } from "./v1-compat.js";

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

/**
 * PAM-18 hardening: keep only the safe QuickKey-code characters ([A-Za-z0-9_],
 * the canonical catalogue's charset) before the code is embedded in the quoted
 * `Quickey "pam-osc_<CODE>"` command — an unknown/hand-edited key can then never
 * break out of the argument. A stripped key simply matches no QuickKey pool
 * object on the console (a no-op), which is the correct fail-safe.
 */
export function safeQuickKeyCode(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, "");
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
      for (const entry of entries) {
        // Note-pair encoders (PAM-27) are indexed under both direction notes;
        // which note fired decides the direction.
        if (entry.control.type === "encoder") handleNotePairEntry(context, unitRuntime, entry, event.note, event.value);
        else handleNoteEntry(context, unitRuntime, entry, event.value);
      }
      return;
    }
  }
}

function handleCcEntry(context: InputContext, unitRuntime: UnitRuntime, entry: RoutingEntry, value: number): void {
  const { control, assignment } = entry;

  // CC-addressed buttons (127 = pressed / 0 = released, PAM-26) carry note-button semantics on a CC.
  if (control.type === "button") {
    handleNoteEntry(context, unitRuntime, entry, value);
    return;
  }

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
  // PAM-20: pick the decode by the encoder's relative mode. "signed" (Akai)
  // needs no ranges; "range" (default, X-Touch) uses the increment/decrement
  // windows the schema guarantees are present for that mode.
  const encoding = control.capabilities.encoding;
  let detents: number | undefined;
  if (encoding.mode === "signed") {
    detents = signedDetents(value);
  } else if (encoding.increment && encoding.decrement) {
    detents = relativeDetents(value, encoding.increment, encoding.decrement);
  } else {
    return;
  }
  if (detents === undefined) return; // no change / outside both ranges — ignored
  applyEncoderDetents(context, unitRuntime, entry, detents);
}

/**
 * Note-pair encoder (PAM-27): each rotation detent fires a note press — the
 * control's own note clockwise, encoding.decrementNote counter-clockwise
 * (X-Touch Compact MC-mode side encoders 15/16). One press = one detent.
 */
function handleNotePairEntry(
  context: InputContext,
  unitRuntime: UnitRuntime,
  entry: RoutingEntry,
  note: number,
  value: number
): void {
  const { control } = entry;
  if (control.type !== "encoder" || control.capabilities.encoding.mode !== "note-pair") return;
  if (control.midi.kind !== "note") return; // schema guarantees this; narrows the type
  if (value <= 0) return; // the release of the detent press carries no motion
  applyEncoderDetents(context, unitRuntime, entry, note === control.midi.number ? 1 : -1);
}

/** Shared encoder tail: detents → executor fader/knob or attribute command. */
function applyEncoderDetents(
  context: InputContext,
  unitRuntime: UnitRuntime,
  entry: RoutingEntry,
  detents: number
): void {
  const { control, assignment } = entry;

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
    change = context.state.encoderFine ? change / context.state.encoderFineFactor : change;
    change = context.state.encoderRough ? change * context.state.encoderRoughFactor : change;
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
  const action = assignment.action;

  // CMD mode (PAM-12 AC-2): clean up a swallowed press's release *before* the
  // minValue guard — otherwise a min-valued executor button (release = 0 ≤
  // minValue) would drop the release here and leak its interceptedPresses
  // entry forever (BUG-5). This runs for executor actions only.
  if (action.type === "executor" && value <= 0) {
    const pressKey = accumulatorKey(unitRuntime.unit.mapping.id, entry.control.id);
    if (context.state.interceptedPresses.has(pressKey)) {
      context.state.interceptedPresses.delete(pressKey);
      return;
    }
  }

  // v1's exact threshold semantics: with minValue set, everything at or
  // below it — including releases — is dropped.
  const minValue = assignment.options?.minValue;
  if (minValue && value <= minValue) return;

  switch (action.type) {
    case "executor": {
      // While the console command line waits for a target, an executor press
      // selects instead of triggering. The matching release is handled above.
      // A release whose press happened *before* CMD mode started is not in the
      // set and falls through to a normal Key 0 (flash executors need it) —
      // that press/release pairing is intentional, not an orphan (F7).
      const pressKey = accumulatorKey(unitRuntime.unit.mapping.id, entry.control.id);
      if (value > 0 && cmdModeActive(context.state)) {
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

    case "quickKey": {
      if (value <= 0) return; // fire on press only (see design notes)
      // Resolve mixed-case / legacy spellings (v1 stored "Move", "<<<<", …) to
      // the canonical code so imported mappings still hit a real pool object on
      // the console; falls back to the raw value when unknown.
      const code = canonicalQuickKey(action.key);
      // PAM-18 hardening: QuickKey codes are [A-Za-z0-9_] (the canonical
      // catalogue). Strip anything else so a hand-edited/imported key can never
      // break out of the quoted /cmd argument (e.g. `A" ; Store Show ; …`).
      context.sendOsc({ address: "/cmd", args: [oscString(`Quickey "pam-osc_${safeQuickKeyCode(code)}"`)] });
      return;
    }

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
  const factor = entry.assignment.action.type === "modifier" ? (entry.assignment.action.factor ?? 10) : 10;
  switch (modifier) {
    // PAM-31: several buttons may carry the same modifier with different
    // factors — same factor toggles off, another factor switches resolution.
    case "encoderRough":
      if (state.encoderRough && state.encoderRoughFactor !== factor) {
        state.encoderRoughFactor = factor;
      } else {
        state.encoderRough = !state.encoderRough;
        state.encoderRoughFactor = factor;
      }
      sendModifierLeds(context.allUnits(), state);
      return;
    case "encoderFine":
      if (state.encoderFine && state.encoderFineFactor !== factor) {
        state.encoderFineFactor = factor;
      } else {
        state.encoderFine = !state.encoderFine;
        state.encoderFineFactor = factor;
      }
      sendModifierLeds(context.allUnits(), state);
      return;
    case "attributeSelect":
      if (!attribute) return;
      state.attribute = attribute;
      sendAttributeLeds(context.allUnits(), state);
      return;
  }
}
