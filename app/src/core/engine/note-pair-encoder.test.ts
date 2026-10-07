import { describe, expect, it } from "vitest";
import { buildUnit } from "./routing-table.js";
import { handleMidiEvent, type InputContext } from "./input-router.js";
import { createRuntimeState } from "./state.js";
import { DEFAULT_TIMING } from "./types.js";
import type { UnitRuntime } from "./device-manager.js";
import { deviceDefinitionSchema, mappingSchema } from "../format/index.js";
import type { OscMessage } from "../../transports/osc.js";

/**
 * PAM-27: note-pair relative encoders — hardware that fires one note press per
 * rotation detent on two distinct notes (X-Touch Compact MC-mode side encoders
 * 15/16: clockwise = the control's own note, counter-clockwise =
 * encoding.decrementNote). One press = ±1 detent.
 */

const device = deviceDefinitionSchema.parse({
  formatVersion: 1,
  id: "note-pair-board",
  name: "Note Pair Board",
  defaultMidiChannel: 1,
  layout: { width: 2, height: 2 },
  controls: [
    {
      id: "knob-15",
      type: "encoder",
      midi: { kind: "note", number: 47 },
      position: { x: 0, y: 0, width: 1, height: 1 },
      capabilities: { encoding: { mode: "note-pair", decrementNote: 46 } },
    },
  ],
});

const mapping = mappingSchema.parse({
  formatVersion: 1,
  id: "note-pair-map",
  name: "Note Pair Map",
  deviceDefinitionId: "note-pair-board",
  midiPort: { input: "In" },
  assignments: [{ controlId: "knob-15", action: { type: "executor", number: 297 } }],
});

function harness() {
  const unit = buildUnit(mapping, device, []);
  const unitRuntime: UnitRuntime = {
    unit,
    connection: undefined,
    cache: new Map(),
    colors: new Array(8).fill(0),
    rgb: new Map(),
  };
  const sent: OscMessage[] = [];
  const context: InputContext = {
    state: createRuntimeState(),
    sendOsc: (message) => sent.push(message),
    allUnits: () => [unitRuntime],
    timing: DEFAULT_TIMING,
    enqueueCmdKey: () => {},
    log: () => {},
  };
  const press = (note: number, value = 127) =>
    handleMidiEvent(context, unitRuntime, { kind: "note", channel: 1, note, value });
  const lastFader = () => sent.filter((m) => m.address === "/Page1/Fader297").at(-1);
  return { press, lastFader, sent };
}

describe("note-pair encoder → executor routing (PAM-27)", () => {
  it("accumulates +1 per clockwise detent and −1 per counter-clockwise detent", () => {
    const { press, lastFader } = harness();

    press(47); // CW
    press(47);
    press(47);
    expect(lastFader()).toEqual({ address: "/Page1/Fader297", args: [{ type: "float", value: 3 }] });

    press(46); // CCW
    expect(lastFader()).toEqual({ address: "/Page1/Fader297", args: [{ type: "float", value: 2 }] });
  });

  it("clamps at 0 instead of going negative", () => {
    const { press, lastFader } = harness();
    press(46);
    press(46);
    expect(lastFader()).toEqual({ address: "/Page1/Fader297", args: [{ type: "float", value: 0 }] });
  });

  it("ignores the note-off half of a detent press (no double-fire)", () => {
    const { press, sent } = harness();
    press(47);
    press(47, 0); // release
    expect(sent.filter((m) => m.address === "/Page1/Fader297")).toHaveLength(1);
  });

  it("never emits a Key press — the notes are motion, not buttons", () => {
    const { press, sent } = harness();
    press(47);
    press(46);
    expect(sent.filter((m) => m.address.includes("/Key"))).toHaveLength(0);
  });
});

describe("note-pair encoder schema (PAM-27)", () => {
  const base = {
    formatVersion: 1,
    id: "b",
    name: "B",
    layout: { width: 1, height: 1 },
  };
  const control = (overrides: object) => ({
    id: "enc",
    type: "encoder",
    midi: { kind: "note", number: 47 },
    position: { x: 0, y: 0, width: 1, height: 1 },
    capabilities: { encoding: { mode: "note-pair", decrementNote: 46 } },
    ...overrides,
  });

  it("accepts a well-formed note-pair encoder", () => {
    expect(deviceDefinitionSchema.safeParse({ ...base, controls: [control({})] }).success).toBe(true);
  });

  it("requires decrementNote", () => {
    const bad = control({ capabilities: { encoding: { mode: "note-pair" } } });
    expect(deviceDefinitionSchema.safeParse({ ...base, controls: [bad] }).success).toBe(false);
  });

  it("requires a note midi address", () => {
    const bad = control({ midi: { kind: "cc", number: 47 } });
    expect(deviceDefinitionSchema.safeParse({ ...base, controls: [bad] }).success).toBe(false);
  });

  it("rejects decrementNote equal to the clockwise note", () => {
    const bad = control({ capabilities: { encoding: { mode: "note-pair", decrementNote: 47 } } });
    expect(deviceDefinitionSchema.safeParse({ ...base, controls: [bad] }).success).toBe(false);
  });

  it("rejects decrementNote on a non-note-pair encoder", () => {
    const bad = control({
      midi: { kind: "cc", number: 16 },
      capabilities: {
        encoding: { mode: "range", increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 }, decrementNote: 46 },
      },
    });
    expect(deviceDefinitionSchema.safeParse({ ...base, controls: [bad] }).success).toBe(false);
  });
});
