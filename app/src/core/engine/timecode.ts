import type { OscMessage } from "../../transports/osc.js";
import { oscString } from "../../transports/osc.js";
import type { UnitRuntime } from "./device-manager.js";
import { resetSegments, sendSlotDigit, sendSlotTime } from "./feedback-out.js";
import type { RuntimeState, TimecodeSlotState } from "./state.js";
import type { EngineTiming } from "./types.js";
import { parseTimecodeString } from "./v1-compat.js";

/**
 * v1's timecode block: slot state shared across all devices, 7-segment
 * mirroring on mc boards, select (cycle or fixed) and tap/hold transport.
 */

function slotState(state: RuntimeState, slot: number): TimecodeSlotState {
  let existing = state.timecode.slots.get(slot);
  if (!existing) {
    existing = { hrs: "0", mins: "0", secs: "0", mili: "0", running: false, cleared: false };
    state.timecode.slots.set(slot, existing);
  }
  return existing;
}

function timecodeUnits(unitRuntimes: UnitRuntime[]): UnitRuntime[] {
  return unitRuntimes.filter((unitRuntime) => unitRuntime.unit.timecodeEnabled);
}

/** `/Timecode<slot>` "01h02m03:04" — store, and mirror when it is the selected slot. */
export function handleTimecodeFeedback(
  state: RuntimeState,
  unitRuntimes: UnitRuntime[],
  slot: number,
  time: string,
): void {
  const parsed = parseTimecodeString(time);
  const stored = slotState(state, slot);
  stored.hrs = parsed.hrs;
  stored.mins = parsed.mins;
  stored.secs = parsed.secs;
  stored.mili = parsed.mili;

  if (state.timecode.selectedSlot === slot) {
    for (const unitRuntime of timecodeUnits(unitRuntimes)) {
      sendSlotTime(unitRuntime, stored);
    }
  }
}

/** `/14.<slot>` "Go+"/other — MA3's own pool feedback drives the running flag (v1). */
export function handleTimecodeRunning(state: RuntimeState, slot: number, value: string): void {
  const stored = state.timecode.slots.get(slot);
  if (!stored) return; // v1: only tracked slots are updated
  stored.running = value === "Go+";
}

/** timecodeSelect — without a slot cycles 0→…→8→0 (v1), with a slot selects it. */
export function handleTimecodeSelect(
  state: RuntimeState,
  unitRuntimes: UnitRuntime[],
  fixedSlot: number | undefined,
): void {
  const next = fixedSlot ?? (state.timecode.selectedSlot + 1) % 9;
  state.timecode.selectedSlot = next;

  const stored = state.timecode.slots.get(next);
  for (const unitRuntime of timecodeUnits(unitRuntimes)) {
    resetSegments(unitRuntime);
    sendSlotDigit(unitRuntime, next);
    if (stored) sendSlotTime(unitRuntime, stored);
  }
}

/**
 * timecodePlayPause — tap toggles Go+/Pause for the selected slot, holding
 * ≥ holdOffMs sends Off (and the following release is consumed). Does
 * nothing while no slot is selected or the slot has no data yet (v1 —
 * except that v1 crashed on hold-without-data; the guard is documented).
 */
export function handleTimecodePlayPause(
  state: RuntimeState,
  sendOsc: (message: OscMessage) => void,
  timing: EngineTiming,
  value: number,
): void {
  const selected = state.timecode.selectedSlot;
  if (selected === 0) return;
  const slot = state.timecode.slots.get(selected);

  if (value > 0) {
    if (!slot) return;
    state.timecode.holdTimer = setTimeout(() => {
      slot.running = false;
      slot.cleared = true;
      sendOsc({ address: "/cmd", args: [oscString(`Off Timecodeslot ${selected}`)] });
    }, timing.holdOffMs);
    return;
  }

  if (state.timecode.holdTimer) clearTimeout(state.timecode.holdTimer);
  state.timecode.holdTimer = undefined;
  if (!slot) return;

  if (slot.cleared) {
    slot.cleared = false; // the release after a hold-Off is consumed (v1)
  } else if (slot.running) {
    slot.running = false;
    sendOsc({ address: "/cmd", args: [oscString(`Pause Timecodeslot ${selected}`)] });
  } else {
    slot.running = true;
    sendOsc({ address: "/cmd", args: [oscString(`Go+ Timecodeslot ${selected}`)] });
  }
}

export function cancelTimecodeTimers(state: RuntimeState): void {
  if (state.timecode.holdTimer) clearTimeout(state.timecode.holdTimer);
  state.timecode.holdTimer = undefined;
}
