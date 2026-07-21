import { describe, expect, it } from "vitest";
import { signedDetents } from "./v1-compat.js";
import { buildUnit } from "./routing-table.js";
import { handleMidiEvent, type InputContext } from "./input-router.js";
import { createRuntimeState } from "./state.js";
import { DEFAULT_TIMING } from "./types.js";
import type { UnitRuntime } from "./device-manager.js";
import { deviceDefinitionSchema, mappingSchema } from "../format/index.js";
import type { OscMessage } from "../../transports/osc.js";

/**
 * PAM-20: signed (two's-complement) relative encoder decoding — the Akai scheme
 * (APC40 mkII Cue Level / Tempo). AC-2 is the pure decode; AC-3 is the routed
 * direction/magnitude through an executor.
 */

describe("signedDetents (PAM-20 AC-2)", () => {
  it("decodes the Akai two's-complement relative scheme", () => {
    expect(signedDetents(0)).toBeUndefined(); // no change
    expect(signedDetents(1)).toBe(1);
    expect(signedDetents(63)).toBe(63);
    expect(signedDetents(64)).toBe(-64);
    expect(signedDetents(126)).toBe(-2);
    expect(signedDetents(127)).toBe(-1); // one slow detent left
    expect(signedDetents(128)).toBeUndefined(); // out of MIDI range
    expect(signedDetents(-1)).toBeUndefined();
  });
});

const device = deviceDefinitionSchema.parse({
  formatVersion: 1,
  id: "signed-board",
  name: "Signed Board",
  defaultMidiChannel: 1,
  layout: { width: 2, height: 2 },
  controls: [
    {
      id: "cue",
      type: "encoder",
      midi: { kind: "cc", number: 47 },
      position: { x: 0, y: 0, width: 1, height: 1 },
      capabilities: { encoding: { mode: "signed" } },
    },
  ],
});

const mapping = mappingSchema.parse({
  formatVersion: 1,
  id: "signed-map",
  name: "Signed Map",
  deviceDefinitionId: "signed-board",
  midiPort: { input: "In" },
  assignments: [{ controlId: "cue", action: { type: "executor", number: 211 } }],
});

function harness() {
  const unit = buildUnit(mapping, device, []);
  const unitRuntime: UnitRuntime = { unit, connection: undefined, cache: new Map(), colors: new Array(8).fill(0), rgb: new Map() };
  const sent: OscMessage[] = [];
  const context: InputContext = {
    state: createRuntimeState(),
    sendOsc: (message) => sent.push(message),
    allUnits: () => [unitRuntime],
    timing: DEFAULT_TIMING,
    enqueueCmdKey: () => {},
    log: () => {},
  };
  const turn = (value: number) => handleMidiEvent(context, unitRuntime, { kind: "cc", channel: 1, controller: 47, value });
  const lastFader = () => sent.filter((m) => m.address === "/Page1/Fader211").at(-1);
  return { turn, lastFader };
}

describe("signed encoder → executor routing (PAM-20 AC-3)", () => {
  it("nudges the executor fader up on a right turn and down on a slow left turn", () => {
    const { turn, lastFader } = harness();

    turn(5); // +5 detents
    expect(lastFader()).toEqual({ address: "/Page1/Fader211", args: [{ type: "float", value: 5 }] });

    turn(127); // one slow detent left → −1
    expect(lastFader()).toEqual({ address: "/Page1/Fader211", args: [{ type: "float", value: 4 }] });

    turn(64); // full left step → −64, clamped at 0
    expect(lastFader()).toEqual({ address: "/Page1/Fader211", args: [{ type: "float", value: 0 }] });
  });

  it("ignores a stationary report (value 0)", () => {
    const { turn, lastFader } = harness();
    turn(0);
    expect(lastFader()).toBeUndefined();
  });
});
