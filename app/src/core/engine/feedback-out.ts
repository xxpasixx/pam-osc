import type { RoutingEntry, Unit } from "./routing-table.js";
import { sendToUnit, type UnitRuntime } from "./device-manager.js";
import type { RuntimeState } from "./state.js";
import { mapValue, scribbleLine } from "./v1-compat.js";

/**
 * Everything the engine sends *to* the boards — LED values, motor faders,
 * scribble strips, 7-segment timecode. Wire shapes are v1's, byte for byte.
 */

/** The LED value an entry shows for on/off, resolved via its feedback type. */
export function buttonFeedbackValue(entry: RoutingEntry, on: boolean): number | undefined {
  const feedback = entry.assignment.feedback;
  switch (feedback.type) {
    case "on-off":
      return on ? feedback.onValue : feedback.offValue;
    case "always-on":
      return feedback.value; // fixed, regardless of state (v1 permanentFeedback)
    default:
      return undefined; // feedback "none" — the board shows nothing
  }
}

export function sendButtonFeedback(unitRuntime: UnitRuntime, entry: RoutingEntry, on: boolean): void {
  if (entry.control.type !== "button") return;
  if (entry.control.midi.kind !== "note") return;
  const velocity = buttonFeedbackValue(entry, on);
  if (velocity === undefined) return;
  sendToUnit(unitRuntime, {
    kind: "note",
    channel: entry.channel,
    note: entry.control.midi.number,
    velocity,
  });
}

/** v1 sendAttributeLED: exactly the matching attributeSelect button is lit. */
export function sendAttributeLeds(unitRuntimes: UnitRuntime[], state: RuntimeState): void {
  for (const unitRuntime of unitRuntimes) {
    for (const entry of unitRuntime.unit.attributeSelects) {
      const action = entry.assignment.action;
      if (action.type !== "modifier" || action.attribute === undefined) continue;
      const on = action.attribute.toLowerCase() === state.attribute.toLowerCase();
      sendButtonFeedback(unitRuntime, entry, on);
    }
  }
}

/** v1 sendPermanentFeedback: always-on values, sent at startup/rebind. */
export function sendAlwaysOnFeedback(unitRuntime: UnitRuntime): void {
  for (const entry of unitRuntime.unit.entries) {
    if (entry.assignment.feedback.type === "always-on") {
      sendButtonFeedback(unitRuntime, entry, true);
    }
  }
}

// ---- 7-segment timecode display (mc-mode boards only, v1 wire format) ----

const SEGMENT_BASE_CC = 75; // segment position p is written via CC (75 - p)

function timecodeCapable(unit: Unit): boolean {
  return unit.mcMode && unit.timecodeEnabled;
}

export function sendSegment(unitRuntime: UnitRuntime, position: number, value: number): void {
  if (!timecodeCapable(unitRuntime.unit)) return;
  sendToUnit(unitRuntime, {
    kind: "cc",
    channel: unitRuntime.unit.device.defaultMidiChannel,
    controller: SEGMENT_BASE_CC - position,
    value,
  });
}

/** v1 resetSegments: positions 0-11 to blank. */
export function resetSegments(unitRuntime: UnitRuntime): void {
  for (let position = 0; position < 12; position++) {
    sendSegment(unitRuntime, position, 0);
  }
}

/** Position 1 shows the selected slot number (its digit's ASCII code, v1). */
export function sendSlotDigit(unitRuntime: UnitRuntime, slot: number): void {
  sendSegment(unitRuntime, 1, slot.toString().charCodeAt(0));
}

/** v1 updateSegmentsBySlot: hours 2-4, minutes 5-6, seconds 7-8, hundredths 9-10. */
export function sendSlotTime(
  unitRuntime: UnitRuntime,
  slot: { hrs: string; mins: string; secs: string; mili: string },
): void {
  const write = (startPosition: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      sendSegment(unitRuntime, startPosition + i, text.charCodeAt(i));
    }
  };
  write(9, slot.mili.padEnd(2, "0"));
  write(7, slot.secs.padStart(2, "0"));
  write(5, slot.mins.padStart(2, "0"));
  write(2, slot.hrs.padStart(3, "0"));
}

// ---- X-Touch scribble strips (sysex, v1 byte frames) ----

const SYSEX_HEADER = [0xf0, 0x00, 0x00, 0x66, 0x14];

/** One frame carries all 8 strip colors (v1: F0 00 00 66 14 72 <8 bytes> F7). */
export function sendStripColors(unitRuntime: UnitRuntime): void {
  sendToUnit(
    unitRuntime,
    { kind: "sysex", bytes: [...SYSEX_HEADER, 0x72, ...unitRuntime.colors, 0xf7] },
    "sysex:color",
  );
}

/** Line 1 (sequence) offset = strip × 7, line 2 (cue) offset = 56 + strip × 7 (v1). */
export function sendStripText(unitRuntime: UnitRuntime, stripIndex: number, sequence: string, cue: string): void {
  // Offsets beyond strip 7 would exceed 0x7F — illegal as sysex data bytes.
  // The schema bounds display indices to 0-7; this is the last line of defense.
  if (stripIndex < 0 || stripIndex > 7) return;
  sendToUnit(
    unitRuntime,
    { kind: "sysex", bytes: [...SYSEX_HEADER, 0x12, stripIndex * 7, ...scribbleLine(sequence), 0xf7] },
    `sysex:name:${stripIndex}:1`,
  );
  sendToUnit(
    unitRuntime,
    { kind: "sysex", bytes: [...SYSEX_HEADER, 0x12, 56 + stripIndex * 7, ...scribbleLine(cue), 0xf7] },
    `sysex:name:${stripIndex}:2`,
  );
}

// ---- motor faders / encoder rings ----

export function sendFaderFeedback(unitRuntime: UnitRuntime, entry: RoutingEntry, ma3Value: number): void {
  const control = entry.control;
  if (control.type === "fader" && entry.assignment.feedback.type === "fader-position") {
    if (control.midi.kind === "cc") {
      sendToUnit(unitRuntime, {
        kind: "cc",
        channel: entry.channel,
        controller: control.midi.number,
        value: Math.round((ma3Value / 100) * 127),
      });
    } else if (control.midi.kind === "pitchbend") {
      sendToUnit(unitRuntime, {
        kind: "pitchbend",
        channel: entry.channel,
        value: Math.round((ma3Value / 100) * 16380),
      });
    }
    return;
  }
  if (control.type === "encoder" && entry.assignment.feedback.type === "encoder-ring") {
    const ring = control.capabilities.ledRing;
    if (!ring) return;
    sendToUnit(unitRuntime, {
      kind: "cc",
      channel: entry.channel,
      controller: ring.controller,
      value: Math.round(mapValue(ma3Value, 0, 100, ring.from, ring.to)),
    });
  }
}

/**
 * Restore a unit's hardware after (re)bind: replay what MA3 last told us,
 * then overwrite with the freshly computed engine state (attribute LEDs,
 * always-on values, timecode display) — no animation here by design.
 */
export function restoreUnit(unitRuntime: UnitRuntime, state: RuntimeState): void {
  for (const message of unitRuntime.cache.values()) {
    try {
      unitRuntime.connection?.send(message);
    } catch {
      return; // yanked again — the poll will retry
    }
  }
  sendAlwaysOnFeedback(unitRuntime);
  sendAttributeLeds([unitRuntime], state);
  if (timecodeCapable(unitRuntime.unit)) {
    resetSegments(unitRuntime);
    sendSlotDigit(unitRuntime, state.timecode.selectedSlot);
    const slot = state.timecode.slots.get(state.timecode.selectedSlot);
    if (slot) sendSlotTime(unitRuntime, slot);
  }
}
