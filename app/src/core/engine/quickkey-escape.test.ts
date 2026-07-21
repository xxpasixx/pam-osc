import { describe, expect, it } from "vitest";
import { handleMidiEvent, safeQuickKeyCode, type InputContext } from "./input-router.js";
import { buildUnit } from "./routing-table.js";
import { createRuntimeState } from "./state.js";
import { DEFAULT_TIMING } from "./types.js";
import type { UnitRuntime } from "./device-manager.js";
import { deviceDefinitionSchema, mappingSchema } from "../format/index.js";
import type { OscMessage } from "../../transports/osc.js";

/**
 * PAM-18 hardening: a QuickKey code is restricted to [A-Za-z0-9_] before it is
 * embedded in the quoted `Quickey "pam-osc_<CODE>"` command, so a hand-edited /
 * imported key cannot break out of the argument.
 */

describe("safeQuickKeyCode", () => {
  it("passes canonical codes through unchanged", () => {
    for (const code of ["GO", "PAGE_UP", "NUM0", "DEF_GO", "MA1"]) {
      expect(safeQuickKeyCode(code)).toBe(code);
    }
  });

  it("strips quotes, semicolons, spaces and every other breakout character", () => {
    expect(safeQuickKeyCode('A" ; DROP')).toBe("ADROP");
    expect(safeQuickKeyCode('X" ; Store Show ; Quickey "pam-osc_Y')).toBe("XStoreShowQuickeypamosc_Y");
  });
});

function harness(key: string) {
  const device = deviceDefinitionSchema.parse({
    formatVersion: 1,
    id: "qk-board",
    name: "QK Board",
    defaultMidiChannel: 1,
    layout: { width: 2, height: 2 },
    controls: [
      { id: "btn", type: "button", midi: { kind: "note", number: 10 }, position: { x: 0, y: 0, width: 1, height: 1 }, capabilities: { led: "none" } },
    ],
  });
  const mapping = mappingSchema.parse({
    formatVersion: 1,
    id: "qk-map",
    name: "QK Map",
    deviceDefinitionId: "qk-board",
    midiPort: { input: "In" },
    assignments: [{ controlId: "btn", action: { type: "quickKey", key } }],
  });
  const unit = buildUnit(mapping, device, []);
  const unitRuntime: UnitRuntime = { unit, connection: undefined, cache: new Map(), colors: new Array(8).fill(0), rgb: new Map() };
  const sent: OscMessage[] = [];
  const context: InputContext = {
    state: createRuntimeState(),
    sendOsc: (m) => sent.push(m),
    allUnits: () => [unitRuntime],
    timing: DEFAULT_TIMING,
    enqueueCmdKey: () => {},
    log: () => {},
  };
  handleMidiEvent(context, unitRuntime, { kind: "note", channel: 1, note: 10, value: 127 });
  return sent[0]?.args[0]?.value as string | undefined;
}

describe("quickKey /cmd is injection-safe (PAM-18)", () => {
  it("sends the canonical key verbatim", () => {
    expect(harness("GO")).toBe('Quickey "pam-osc_GO"');
  });

  it("cannot be broken out of by a hostile key", () => {
    const cmd = harness('A" ; Store Show ; Quickey "pam-osc_B');
    expect(cmd).toBe('Quickey "pam-osc_AStoreShowQuickeypamosc_B"');
    expect((cmd?.match(/"/g) ?? []).length).toBe(2); // only the wrapping quotes
    expect(cmd).not.toContain(";");
  });
});
