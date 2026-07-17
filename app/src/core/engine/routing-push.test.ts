import { describe, expect, it } from "vitest";
import { buildUnit, midiKey } from "./routing-table.js";
import { deviceDefinitionSchema, mappingSchema } from "../format/index.js";
import type { EngineIssue } from "./types.js";

/**
 * Composite push-encoders in the routing table (PAM-1 AC-7): the push part
 * expands into a virtual button so input routing and LED feedback reuse the
 * button paths unchanged.
 */

const device = deviceDefinitionSchema.parse({
  formatVersion: 1,
  id: "push-board",
  name: "Push Board",
  defaultMidiChannel: 1,
  layout: { width: 4, height: 4 },
  controls: [
    {
      id: "enc-1",
      label: "Enc 1",
      type: "encoder",
      midi: { kind: "cc", number: 16 },
      position: { x: 0, y: 0, width: 2, height: 2 },
      capabilities: {
        encoding: { increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 } },
        push: { midi: { kind: "note", number: 32, channel: 2 }, led: "on-off" },
      },
    },
  ],
});

const mapping = mappingSchema.parse({
  formatVersion: 1,
  id: "push-map",
  name: "Push Map",
  deviceDefinitionId: "push-board",
  midiPort: { input: "In" },
  assignments: [
    { controlId: "enc-1", action: { type: "executor", number: 201 } },
    { controlId: "enc-1", part: "push", action: { type: "executor", number: 301 }, feedback: { type: "on-off" } },
  ],
});

describe("buildUnit with a push assignment (PAM-1 AC-7)", () => {
  it("routes rotate and push independently: cc for the encoder, note for the virtual button", () => {
    const issues: EngineIssue[] = [];
    const unit = buildUnit(mapping, device, issues);

    const rotate = unit.byCc.get(midiKey(1, 16));
    expect(rotate).toHaveLength(1);
    expect(rotate![0]!.control.type).toBe("encoder");

    const push = unit.byNote.get(midiKey(2, 32));
    expect(push).toHaveLength(1);
    expect(push![0]!.control).toMatchObject({ id: "enc-1#push", type: "button", capabilities: { led: "on-off" } });
    expect(push![0]!.channel).toBe(2);

    // feedback: both executors indexed, no warnings
    expect(unit.byExecutor.get(201)).toHaveLength(1);
    expect(unit.byExecutor.get(301)).toHaveLength(1);
    expect(issues).toHaveLength(0);
  });

  it("push LED feedback targets the push address, not the encoder cc", () => {
    const unit = buildUnit(mapping, device, []);
    const entry = unit.byExecutor.get(301)![0]!;
    expect(entry.control.type).toBe("button");
    if (entry.control.type !== "button") return;
    expect(entry.control.midi).toEqual({ kind: "note", number: 32, channel: 2 });
  });
});
