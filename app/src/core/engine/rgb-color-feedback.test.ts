import { describe, expect, it } from "vitest";
import { handleOscMessage, type FeedbackContext } from "./feedback-router.js";
import { nearestPaletteVelocity } from "./led-palette.js";
import { buildUnit } from "./routing-table.js";
import { createRuntimeState } from "./state.js";
import type { UnitRuntime } from "./device-manager.js";
import type { MidiOutputMessage } from "../../transports/midi.js";
import { deviceDefinitionSchema, mappingSchema } from "../format/index.js";

/**
 * PAM-10: RGB button LEDs reflect the executor's live MA3 appearance colour.
 */

describe("nearestPaletteVelocity (PAM-10 AC-1/AC-3)", () => {
  const c = (red: number, green: number, blue: number, alpha = 255) => ({ red, green, blue, alpha });

  it("maps pure colours to their exact APC40 mkII palette velocity", () => {
    expect(nearestPaletteVelocity("apc40-mk2", c(0, 255, 0))).toBe(21); // #00FF00
    expect(nearestPaletteVelocity("apc40-mk2", c(255, 0, 0))).toBe(5); // #FF0000
    expect(nearestPaletteVelocity("apc40-mk2", c(0, 0, 255))).toBe(45); // #0000FF
    expect(nearestPaletteVelocity("apc40-mk2", c(255, 255, 255))).toBe(3); // #FFFFFF
  });

  it("returns 0 (off) for black, full transparency, and unknown/absent palettes", () => {
    expect(nearestPaletteVelocity("apc40-mk2", c(0, 0, 0))).toBe(0);
    expect(nearestPaletteVelocity("apc40-mk2", c(0, 255, 0, 0))).toBe(0); // alpha 0
    expect(nearestPaletteVelocity("no-such-palette", c(0, 255, 0))).toBe(0);
    expect(nearestPaletteVelocity(undefined, c(0, 255, 0))).toBe(0);
  });

  it("snaps a near-green to the closest palette entry", () => {
    // #10D000 (named "Green", velocity 122) is closer to a slightly-dim green.
    expect(nearestPaletteVelocity("apc40-mk2", c(20, 210, 5))).toBe(122);
  });
});

const device = deviceDefinitionSchema.parse({
  formatVersion: 1,
  id: "rgb-board",
  name: "RGB Board",
  ledPalette: "apc40-mk2",
  defaultMidiChannel: 1,
  layout: { width: 2, height: 2 },
  controls: [
    {
      id: "pad",
      type: "button",
      midi: { kind: "note", number: 5 },
      position: { x: 0, y: 0, width: 1, height: 1 },
      capabilities: { led: "velocity-colors" },
    },
  ],
});

const mapping = mappingSchema.parse({
  formatVersion: 1,
  id: "rgb-map",
  name: "RGB Map",
  deviceDefinitionId: "rgb-board",
  midiPort: { input: "In", output: "Out" },
  assignments: [{ controlId: "pad", action: { type: "executor", number: 301 }, feedback: { type: "rgb-color" } }],
});

function harness() {
  const unit = buildUnit(mapping, device, []);
  const sent: MidiOutputMessage[] = [];
  const unitRuntime: UnitRuntime = {
    unit,
    connection: { send: (m) => sent.push(m), close: () => {} },
    cache: new Map(),
    colors: new Array(8).fill(0),
    rgb: new Map(),
  };
  const context: FeedbackContext = {
    state: createRuntimeState(),
    allUnits: () => [unitRuntime],
    onConnectionPong: () => {},
    onPluginPong: () => {},
    onCmdKeyAck: () => {},
    onConsoleChanged: () => {},
    log: () => {},
  };
  const button = (on: boolean) =>
    handleOscMessage(context, { address: "/Page1/Button301", args: [{ type: "string", value: on ? "On" : "Off" }] });
  const color = (rgba: string) =>
    handleOscMessage(context, { address: "/Page1/Color301", args: [{ type: "string", value: rgba }] });
  return { button, color, last: () => sent.at(-1) };
}

describe("rgb-color feedback routing (PAM-10 AC-2)", () => {
  it("lights the pad in the MA colour while running, off when not", () => {
    const { button, color, last } = harness();

    color("0;255;0;255"); // colour known, but not running yet
    expect(last()).toEqual({ kind: "note", channel: 1, note: 5, velocity: 0 });

    button(true); // now running → shows green (velocity 21)
    expect(last()).toEqual({ kind: "note", channel: 1, note: 5, velocity: 21 });

    color("255;0;0;255"); // live colour change while running → red (velocity 5)
    expect(last()).toEqual({ kind: "note", channel: 1, note: 5, velocity: 5 });

    button(false); // stopped → off (offValue 0), colour retained internally
    expect(last()).toEqual({ kind: "note", channel: 1, note: 5, velocity: 0 });
  });

  it("works regardless of message order (running before colour)", () => {
    const { button, color, last } = harness();
    button(true); // running, no colour yet → off
    expect(last()).toEqual({ kind: "note", channel: 1, note: 5, velocity: 0 });
    color("0;0;255;255"); // blue → velocity 45
    expect(last()).toEqual({ kind: "note", channel: 1, note: 5, velocity: 45 });
  });
});
