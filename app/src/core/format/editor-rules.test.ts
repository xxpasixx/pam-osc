import { describe, expect, it } from "vitest";
import {
  controlUsage,
  orphanedAssignments,
  suffixedCopy,
  validateDeviceDraft,
  validateMappingDraft,
  type MappingRef,
} from "./editor-rules.js";
import type { DeviceDefinition } from "./device-definition.js";

/** Minimal valid board draft; tests mutate copies of it. */
const board = () => ({
  formatVersion: 1,
  id: "board",
  name: "Board",
  defaultMidiChannel: 1,
  layout: { width: 8, height: 4 },
  controls: [
    {
      id: "fader-1",
      type: "fader",
      midi: { kind: "cc", number: 7 },
      position: { x: 0, y: 0, width: 1, height: 4 },
      capabilities: { motorized: true },
    },
    {
      id: "btn-1",
      type: "button",
      midi: { kind: "note", number: 10 },
      position: { x: 1, y: 0, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
  ],
});

const mapping = () => ({
  formatVersion: 1,
  id: "map",
  name: "Map",
  deviceDefinitionId: "board",
  midiPort: { input: "Port A" },
  assignments: [
    { controlId: "fader-1", action: { type: "executor", number: 201 }, feedback: { type: "fader-position" } },
    { controlId: "btn-1", action: { type: "executor", number: 301 }, feedback: { type: "on-off" } },
  ],
});

const parsedBoard = (): DeviceDefinition => {
  const result = validateDeviceDraft(board());
  if (!result.ok) throw new Error("fixture board must be valid");
  return result.value;
};

describe("validateDeviceDraft", () => {
  it("accepts a valid board", () => {
    expect(validateDeviceDraft(board()).ok).toBe(true);
  });

  it("anchors schema errors to the causing field", () => {
    const draft = board();
    (draft.controls[0]!.midi as { number?: number }).number = undefined;
    const result = validateDeviceDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "controls[0].midi.number")).toBe(true);
  });

  it("rejects two controls on the same wire address (AC-7)", () => {
    const draft = board();
    draft.controls[1]!.midi = { kind: "cc", number: 7 };
    const result = validateDeviceDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe("controls[1].midi");
    expect(result.issues[0]!.message).toContain('"fader-1"');
  });

  it("treats an explicit channel equal to the default as the same address", () => {
    const draft = board();
    draft.controls[1]!.midi = { kind: "cc", number: 7, channel: 1 } as (typeof draft.controls)[1]["midi"];
    expect(validateDeviceDraft(draft).ok).toBe(false);
  });

  it("allows the same number on different channels", () => {
    const draft = board();
    draft.controls[1]!.midi = { kind: "cc", number: 7, channel: 2 } as (typeof draft.controls)[1]["midi"];
    expect(validateDeviceDraft(draft).ok).toBe(true);
  });

  it("keys pitchbend by channel alone", () => {
    const draft = board();
    draft.controls[0]!.midi = { kind: "pitchbend", channel: 3 } as unknown as (typeof draft.controls)[0]["midi"];
    draft.controls[1]!.midi = { kind: "pitchbend", channel: 3 } as unknown as (typeof draft.controls)[1]["midi"];
    expect(validateDeviceDraft(draft).ok).toBe(false);
  });

  it("rejects a control outside the board layout (AC-7)", () => {
    const draft = board();
    draft.controls[1]!.position = { x: 7.5, y: 0, width: 1, height: 1 };
    const result = validateDeviceDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe("controls[1].position");
    expect(result.issues[0]!.message).toContain("btn-1");
  });

  it("rejects shrinking the board below its controls", () => {
    const draft = board();
    draft.layout = { width: 8, height: 2 };
    expect(validateDeviceDraft(draft).ok).toBe(false);
  });
});

describe("validateMappingDraft", () => {
  it("accepts a valid mapping against its board", () => {
    expect(validateMappingDraft(mapping(), parsedBoard()).ok).toBe(true);
  });

  it("rejects an assignment to a missing control", () => {
    const draft = mapping();
    draft.assignments[1]!.controlId = "gone";
    const result = validateMappingDraft(draft, parsedBoard());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe("assignments[1].controlId");
  });

  it("rejects feedback the control's capabilities cannot do", () => {
    const draft = mapping();
    draft.assignments[1]!.feedback = { type: "fader-position" };
    const result = validateMappingDraft(draft, parsedBoard());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe("assignments[1]");
  });

  it("rejects a mapping edited against the wrong device", () => {
    const other = { ...parsedBoard(), id: "other-board" };
    const result = validateMappingDraft(mapping(), other);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe("deviceDefinitionId");
  });
});

const ref = (id: string, controlIds: string[], origin: "bundled" | "user" = "user"): MappingRef => ({
  id,
  name: id,
  origin,
  deviceDefinitionId: "board",
  assignments: controlIds.map((controlId) => ({ controlId })),
});

describe("controlUsage / orphanedAssignments", () => {
  it("lists mappings per control, ignoring other boards", () => {
    const foreign: MappingRef = { ...ref("elsewhere", ["fader-1"]), deviceDefinitionId: "other" };
    const usage = controlUsage("board", [ref("a", ["fader-1", "btn-1"]), ref("b", ["fader-1"]), foreign]);
    expect(usage.get("fader-1")?.map((mapping) => mapping.id)).toEqual(["a", "b"]);
    expect(usage.get("btn-1")?.map((mapping) => mapping.id)).toEqual(["a"]);
  });

  it("finds assignments orphaned by a deleted control", () => {
    const definition = { id: "board", controls: parsedBoard().controls.filter((c) => c.id !== "btn-1") };
    const orphans = orphanedAssignments(definition, [ref("a", ["fader-1", "btn-1"]), ref("b", ["fader-1"])]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.mapping.id).toBe("a");
    expect(orphans[0]!.controlIds).toEqual(["btn-1"]);
  });
});

describe("suffixedCopy", () => {
  it("appends the first free suffix", () => {
    expect(suffixedCopy("x-touch", "X-Touch", new Set(["x-touch"]))).toEqual({ id: "x-touch-2", name: "X-Touch (2)" });
    expect(suffixedCopy("x-touch", "X-Touch", new Set(["x-touch", "x-touch-2"]))).toEqual({
      id: "x-touch-3",
      name: "X-Touch (3)",
    });
  });

  it("counts up from the original when copying a copy", () => {
    expect(suffixedCopy("x-touch-2", "X-Touch (2)", new Set(["x-touch", "x-touch-2"]))).toEqual({
      id: "x-touch-3",
      name: "X-Touch (3)",
    });
  });

  it("keeps a trailing number that is not a suffix", () => {
    expect(suffixedCopy("mpx-16", "MPX 16", new Set(["mpx-16"]))).toEqual({ id: "mpx-16-2", name: "MPX 16 (2)" });
  });
});
