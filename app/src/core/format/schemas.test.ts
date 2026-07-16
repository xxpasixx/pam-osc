import { describe, expect, it } from "vitest";
import { deviceDefinitionSchema } from "./device-definition.js";
import { mappingSchema } from "./mapping.js";

export function minimalDevice(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    id: "test-board",
    name: "Test Board",
    layout: { width: 10, height: 4 },
    controls: [
      {
        id: "fader-1",
        type: "fader",
        midi: { kind: "pitchbend", channel: 1 },
        position: { x: 0, y: 0, width: 1, height: 3 },
        capabilities: { motorized: true },
      },
      {
        id: "btn-1",
        type: "button",
        midi: { kind: "note", number: 8 },
        position: { x: 1, y: 0, width: 1, height: 1 },
        capabilities: { led: "on-off" },
      },
      {
        id: "enc-1",
        type: "encoder",
        midi: { kind: "cc", number: 16 },
        position: { x: 2, y: 0, width: 1, height: 1, shape: "circle" },
        capabilities: {
          encoding: { increment: { from: 1, to: 63 }, decrement: { from: 65, to: 127 } },
          ledRing: { channel: 1, from: 48, to: 58 },
        },
      },
      {
        id: "display-1",
        type: "display",
        midi: { kind: "cc", number: 100 },
        position: { x: 3, y: 0, width: 2, height: 1 },
        capabilities: { segments: 7 },
      },
    ],
    ...overrides,
  };
}

export function minimalMapping(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    id: "test-mapping",
    name: "Test Mapping",
    deviceDefinitionId: "test-board",
    midiPort: { input: "Test Board MIDI 1", output: "Test Board MIDI 1" },
    assignments: [
      { controlId: "fader-1", action: { type: "executor", number: 201 }, feedback: { type: "fader-position" } },
      { controlId: "btn-1", action: { type: "quickKey", key: "CLEAR" }, feedback: { type: "on-off", onValue: 5 } },
    ],
    ...overrides,
  };
}

describe("deviceDefinitionSchema", () => {
  it("accepts a valid device and applies defaults", () => {
    const device = deviceDefinitionSchema.parse(minimalDevice());
    expect(device.mode).toBe("standard");
    expect(device.defaultMidiChannel).toBe(1);
    const fader = device.controls[0];
    expect(fader?.position.shape).toBe("rect");
  });

  it("rejects unknown fields", () => {
    const result = deviceDefinitionSchema.safeParse(minimalDevice({ surprise: true }));
    expect(result.success).toBe(false);
  });

  it("rejects a pitchbend address with a number", () => {
    const device = minimalDevice();
    (device.controls[0] as { midi: unknown }).midi = { kind: "pitchbend", channel: 1, number: 3 };
    expect(deviceDefinitionSchema.safeParse(device).success).toBe(false);
  });

  it("rejects a cc address without a number", () => {
    const device = minimalDevice();
    (device.controls[2] as { midi: unknown }).midi = { kind: "cc", channel: 1 };
    expect(deviceDefinitionSchema.safeParse(device).success).toBe(false);
  });

  it("rejects duplicate control ids", () => {
    const device = minimalDevice();
    (device.controls as { id: string }[])[1]!.id = "fader-1";
    const result = deviceDefinitionSchema.safeParse(device);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('duplicate control id "fader-1"'))).toBe(true);
    }
  });

  it("rejects a non-kebab-case id", () => {
    expect(deviceDefinitionSchema.safeParse(minimalDevice({ id: "Test Board" })).success).toBe(false);
  });
});

describe("mappingSchema", () => {
  it("accepts a valid mapping and applies defaults", () => {
    const mapping = mappingSchema.parse(minimalMapping());
    expect(mapping.enableTimecodeSend).toBe(false);
    expect(mapping.assignments[1]?.feedback).toEqual({ type: "on-off", onValue: 5, offValue: 0 });
  });

  it("defaults feedback to none", () => {
    const mapping = mappingSchema.parse(
      minimalMapping({ assignments: [{ controlId: "btn-1", action: { type: "command", command: "Go+" } }] }),
    );
    expect(mapping.assignments[0]?.feedback).toEqual({ type: "none" });
  });

  it("rejects attributeSelect without an attribute", () => {
    const mapping = minimalMapping({
      assignments: [{ controlId: "btn-1", action: { type: "modifier", modifier: "attributeSelect" } }],
    });
    expect(mappingSchema.safeParse(mapping).success).toBe(false);
  });

  it("rejects a control assigned twice", () => {
    const mapping = minimalMapping({
      assignments: [
        { controlId: "btn-1", action: { type: "quickKey", key: "CLEAR" } },
        { controlId: "btn-1", action: { type: "quickKey", key: "HIGH" } },
      ],
    });
    const result = mappingSchema.safeParse(mapping);
    expect(result.success).toBe(false);
  });

  it("rejects executable-looking extra fields (pure data only)", () => {
    expect(mappingSchema.safeParse(minimalMapping({ buttonFeedbackMapper: "function() {}" })).success).toBe(false);
  });
});
