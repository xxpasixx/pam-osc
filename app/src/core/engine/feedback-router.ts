import type { OscMessage } from "../../transports/osc.js";
import type { UnitRuntime } from "./device-manager.js";
import { sendButtonFeedback, sendFaderFeedback, sendStripColors, sendStripText } from "./feedback-out.js";
import { accumulatorKey } from "./state.js";
import type { RuntimeState } from "./state.js";
import { handleTimecodeFeedback, handleTimecodeRunning } from "./timecode.js";
import { nearestDisplayColor, parseColorString, trailingExecutor } from "./v1-compat.js";

/**
 * MA3 → MIDI: the unchanged Lua-plugin OSC contract (see design.md).
 * Anything unmatched is ignored (EC-2) — never an error.
 */

export interface FeedbackContext {
  state: RuntimeState;
  allUnits: () => UnitRuntime[];
  /** Connection checker taps — pongs are consumed here. */
  onConnectionPong: () => void;
  onPluginPong: () => void;
  log: (line: string) => void;
}

export function handleOscMessage(context: FeedbackContext, message: OscMessage): void {
  const { address, args } = message;

  if (address === "/status/connectionPong") {
    context.onConnectionPong();
    return;
  }
  if (address === "/status/pluginPong") {
    context.onPluginPong();
    return;
  }
  if (address === "/status/deskLocked") {
    const lock = args[0];
    if (lock?.type === "true") {
      context.state.deskLocked = true;
      context.log("desk locked — MIDI input is blocked until unlock");
    } else if (lock?.type === "false") {
      context.state.deskLocked = false;
      context.log("desk unlocked");
    }
    return;
  }
  if (address.includes("/updatePage/current")) {
    const page = args[0];
    if (page && typeof page.value === "number") {
      context.state.page = page.value;
    }
    return;
  }

  const segments = address.split("/");
  const kind = segments[2];
  const executor = trailingExecutor(address);

  if (segments[1]?.includes("masterEnabled") && segments[2]) {
    handleMasterEnabled(context, segments[2], args[0]?.value);
    return;
  }

  if (kind && executor !== undefined) {
    if (kind.startsWith("Fader")) {
      const value = numericArg(args[0]?.value);
      if (value === undefined) return;
      handleFader(context, executor, value);
      return;
    }
    if (kind.startsWith("Button")) {
      handleButton(context, executor, args[0]?.value);
      return;
    }
    if (kind.startsWith("Color")) {
      handleColor(context, executor, args[0]?.value);
      return;
    }
    if (kind.startsWith("Name")) {
      handleName(context, executor, args[0]?.value);
      return;
    }
  }

  // Timecode feedback only matters when a timecode-enabled mapping runs (v1).
  if (context.allUnits().some((unitRuntime) => unitRuntime.unit.timecodeEnabled)) {
    const first = segments[1];
    if (first?.startsWith("Timecode")) {
      const slot = Number.parseInt(first.substring("Timecode".length), 10);
      const time = args[0]?.value;
      if (validSlot(slot) && typeof time === "string") {
        handleTimecodeFeedback(context.state, context.allUnits(), slot, time);
      }
      return;
    }
    // MA3's own pool feedback: /14.<slot> "Go+" drives the running flag.
    if (first?.startsWith("14.")) {
      const slot = Number.parseInt(first.substring(3), 10);
      const value = args[0]?.value;
      if (validSlot(slot) && typeof value === "string") {
        handleTimecodeRunning(context.state, slot, value);
      }
    }
  }
}

/** Only MA3's real slots 0-8 are tracked — anything else from the LAN would
 * grow the slot map without bound. */
function validSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot <= 8;
}

function numericArg(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** "On"/"Off" strings from the plugin; numbers from other sources count as truthiness. */
function isOn(value: unknown): boolean {
  if (typeof value === "string") return value !== "Off" && value !== "";
  if (typeof value === "number") return value > 0;
  return value === true;
}

function handleFader(context: FeedbackContext, executor: number, ma3Value: number): void {
  for (const unitRuntime of context.allUnits()) {
    const entries = unitRuntime.unit.byExecutor.get(executor);
    if (!entries) continue;
    for (const entry of entries) {
      // Relative encoders track the console value in their accumulator (v1).
      if (entry.control.type === "encoder") {
        context.state.accumulators.set(accumulatorKey(unitRuntime.unit.mapping.id, entry.control.id), ma3Value);
      }
      sendFaderFeedback(unitRuntime, entry, ma3Value);
    }
  }
}

function handleButton(context: FeedbackContext, executor: number, value: unknown): void {
  const on = isOn(value);
  for (const unitRuntime of context.allUnits()) {
    const entries = unitRuntime.unit.byExecutor.get(executor);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.control.type !== "button") continue;
      sendButtonFeedback(unitRuntime, entry, on);
    }
  }
}

function handleMasterEnabled(context: FeedbackContext, name: string, value: unknown): void {
  const on = isOn(value);
  for (const unitRuntime of context.allUnits()) {
    const entries = unitRuntime.unit.byCommand.get(name.toLowerCase());
    if (!entries) continue;
    for (const entry of entries) {
      sendButtonFeedback(unitRuntime, entry, on);
    }
  }
}

function handleColor(context: FeedbackContext, executor: number, value: unknown): void {
  if (typeof value !== "string") return;
  for (const unitRuntime of context.allUnits()) {
    const entries = unitRuntime.unit.byDisplayExecutor.get(executor);
    if (!entries) continue;
    let changed = false;
    for (const entry of entries) {
      if (entry.control.type !== "display") continue;
      // Defense in depth: the schema bounds index to 0-7, and the frame is
      // fixed at 8 strips — never grow the array past it.
      if (entry.control.index >= unitRuntime.colors.length) continue;
      unitRuntime.colors[entry.control.index] = nearestDisplayColor(parseColorString(value));
      changed = true;
    }
    // One sysex frame carries all 8 strips (v1) — per device, not global.
    if (changed) sendStripColors(unitRuntime);
  }
}

function handleName(context: FeedbackContext, executor: number, value: unknown): void {
  if (typeof value !== "string") return;
  const parts = value.split(";");
  const sequence = parts[0] ?? "";
  const cue = parts[1] ?? "";
  for (const unitRuntime of context.allUnits()) {
    const entries = unitRuntime.unit.byDisplayExecutor.get(executor);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.control.type !== "display") continue;
      sendStripText(unitRuntime, entry.control.index, sequence, cue);
    }
  }
}
