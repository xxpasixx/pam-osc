import { describe, expect, it } from "vitest";
import { handleMidiEvent, type InputContext } from "./input-router.js";
import { handleOscMessage, type FeedbackContext } from "./feedback-router.js";
import { buildUnit } from "./routing-table.js";
import { createRuntimeState } from "./state.js";
import { DEFAULT_TIMING } from "./types.js";
import type { UnitRuntime } from "./device-manager.js";
import type { MidiOutputMessage } from "../../transports/midi.js";
import type { OscMessage } from "../../transports/osc.js";
import { deviceDefinitionSchema, mappingSchema } from "../format/index.js";

/**
 * PAM-26: CC-addressed buttons (X32 Compact mute row in "MIDI CC" remote mode).
 * The button sends CC value 127/0 instead of note on/off, and its LED listens
 * on the same CC — both directions must behave exactly like a note button.
 */

const device = deviceDefinitionSchema.parse({
  formatVersion: 1,
  id: "cc-board",
  name: "CC Board",
  defaultMidiChannel: 1,
  layout: { width: 2, height: 2 },
  controls: [
    {
      id: "mute-1",
      type: "button",
      midi: { kind: "cc", channel: 2, number: 0 },
      position: { x: 0, y: 0, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
  ],
});

const mapping = mappingSchema.parse({
  formatVersion: 1,
  id: "cc-map",
  name: "CC Map",
  deviceDefinitionId: "cc-board",
  midiPort: { input: "In", output: "Out" },
  assignments: [
    {
      controlId: "mute-1",
      action: { type: "executor", number: 201 },
      feedback: { type: "on-off", onValue: 127, offValue: 0 },
    },
  ],
});

function harness() {
  const unit = buildUnit(mapping, device, []);
  const sentMidi: MidiOutputMessage[] = [];
  const unitRuntime: UnitRuntime = {
    unit,
    connection: { send: (m) => sentMidi.push(m), close: () => {} },
    cache: new Map(),
    colors: new Array(8).fill(0),
    rgb: new Map(),
  };
  const sentOsc: OscMessage[] = [];
  const inputContext: InputContext = {
    state: createRuntimeState(),
    sendOsc: (message) => sentOsc.push(message),
    allUnits: () => [unitRuntime],
    timing: DEFAULT_TIMING,
    enqueueCmdKey: () => {},
    log: () => {},
  };
  const feedbackContext: FeedbackContext = {
    state: inputContext.state,
    allUnits: () => [unitRuntime],
    onConnectionPong: () => {},
    onPluginPong: () => {},
    onCmdKeyAck: () => {},
    onConsoleChanged: () => {},
    log: () => {},
  };
  const press = (value: number) =>
    handleMidiEvent(inputContext, unitRuntime, { kind: "cc", channel: 2, controller: 0, value });
  const executorState = (on: boolean) =>
    handleOscMessage(feedbackContext, {
      address: "/Page1/Button201",
      args: [{ type: "string", value: on ? "On" : "Off" }],
    });
  return { press, executorState, sentMidi, sentOsc };
}

describe("cc-addressed button input (PAM-26 AC-2)", () => {
  it("routes press and release to the executor Key like a note button", () => {
    const { press, sentOsc } = harness();
    press(127);
    expect(sentOsc.at(-1)).toEqual({ address: "/Page1/Key201", args: [{ type: "integer", value: 100 }] });
    press(0);
    expect(sentOsc.at(-1)).toEqual({ address: "/Page1/Key201", args: [{ type: "integer", value: 0 }] });
  });
});

describe("cc-addressed button LED feedback (PAM-26 AC-3)", () => {
  it("mirrors the executor state on the button's own CC", () => {
    const { executorState, sentMidi } = harness();
    executorState(true);
    expect(sentMidi.at(-1)).toEqual({ kind: "cc", channel: 2, controller: 0, value: 127 });
    executorState(false);
    expect(sentMidi.at(-1)).toEqual({ kind: "cc", channel: 2, controller: 0, value: 0 });
  });
});
