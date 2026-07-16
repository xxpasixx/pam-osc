import { describe, expect, it } from "vitest";
import type { SettingsDraft } from "./schema.js";
import { validateDraft } from "./validate.js";

const IDS = new Set(["map-a", "map-b"]);

function draft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return {
    console: { address: "192.168.0.10", sendPort: 9003, receivePort: 9004 },
    activeMappings: [{ id: "map-a", input: "Port A", output: "Port A" }],
    ...overrides,
  };
}

describe("validateDraft (AC-6)", () => {
  it("passes a valid draft", () => {
    expect(validateDraft(draft(), IDS)).toEqual([]);
  });

  it("rejects malformed addresses and empty address", () => {
    for (const address of ["", "  ", "192.168.0.999", "with space", "ip:9000", "-bad-"]) {
      const errors = validateDraft(draft({ console: { address, sendPort: 9003, receivePort: 9004 } }), IDS);
      expect(errors.some((error) => error.field === "console.address"), `address "${address}"`).toBe(true);
    }
  });

  it("accepts IPv4 and hostnames", () => {
    for (const address of ["127.0.0.1", "10.0.0.2", "console.local", "ma3-console", "onpc.example.com"]) {
      const errors = validateDraft(draft({ console: { address, sendPort: 9003, receivePort: 9004 } }), IDS);
      expect(errors.filter((error) => error.field === "console.address"), `address "${address}"`).toEqual([]);
    }
  });

  it("rejects ports outside 1-65535", () => {
    const errors = validateDraft(draft({ console: { address: "10.0.0.2", sendPort: 0, receivePort: 70000 } }), IDS);
    expect(errors.map((error) => error.field)).toEqual(["console.sendPort", "console.receivePort"]);
  });

  it("rejects identical ports only when the console is local", () => {
    const local = validateDraft(draft({ console: { address: "127.0.0.1", sendPort: 9003, receivePort: 9003 } }), IDS);
    expect(local.some((error) => error.field === "console.receivePort")).toBe(true);
    const remote = validateDraft(draft({ console: { address: "10.0.0.2", sendPort: 9003, receivePort: 9003 } }), IDS);
    expect(remote).toEqual([]);
  });

  it("rejects unknown mapping ids, missing inputs, and duplicate ports across mappings", () => {
    const errors = validateDraft(
      draft({
        activeMappings: [
          { id: "map-a", input: "Port A", output: "Port A" },
          { id: "map-b", input: "Port A", output: "Port A" },
          { id: "ghost", input: "Port C" },
          { id: "map-a", input: "" },
        ],
      }),
      IDS,
    );
    expect(errors.some((error) => error.field === "mapping:map-b.input" && error.message.includes("already used"))).toBe(true);
    expect(errors.some((error) => error.field === "mapping:map-b.output")).toBe(true);
    expect(errors.some((error) => error.field === "mapping:ghost")).toBe(true);
    expect(errors.some((error) => error.field === "mapping:map-a.input" && error.message.includes("Pick a MIDI input"))).toBe(true);
  });
});
