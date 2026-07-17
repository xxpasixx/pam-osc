import { describe, expect, it } from "vitest";
import { minimalDevice, minimalMapping } from "../format/schemas.test.js";
import { commandCaution, detectShareKind, MAX_SHARE_BYTES, parseShareFile } from "./share.js";
import type { Mapping } from "../format/index.js";

/**
 * PAM-7 AC-13: the kind comes from the content, never the extension; wrong
 * or foreign files are refused with a specific message and nothing passes
 * the gate unvalidated (AC-5).
 */

describe("detectShareKind", () => {
  it("recognizes mappings and devices by their disjoint required keys", () => {
    expect(detectShareKind(minimalMapping())).toBe("mapping");
    expect(detectShareKind(minimalDevice())).toBe("device");
  });

  it("returns unknown for foreign shapes", () => {
    expect(detectShareKind({})).toBe("unknown");
    expect(detectShareKind([])).toBe("unknown");
    expect(detectShareKind("x")).toBe("unknown");
    expect(detectShareKind(null)).toBe("unknown");
    expect(detectShareKind({ assignments: [] })).toBe("unknown"); // no deviceDefinitionId
    expect(detectShareKind({ controls: [] })).toBe("unknown"); // no layout
  });
});

describe("parseShareFile (AC-13, AC-5)", () => {
  it("accepts a valid mapping and a valid device", () => {
    const mapping = parseShareFile("mapping", JSON.stringify(minimalMapping()));
    expect(mapping).toMatchObject({ ok: true, kind: "mapping" });
    const device = parseShareFile("device", JSON.stringify(minimalDevice()));
    expect(device).toMatchObject({ ok: true, kind: "device" });
  });

  it("refuses the wrong kind with a message pointing at the right action", () => {
    const wrongForMapping = parseShareFile("mapping", JSON.stringify(minimalDevice()));
    expect(wrongForMapping).toMatchObject({ ok: false });
    expect((wrongForMapping as { error: string }).error).toContain("looks like a device definition");
    expect((wrongForMapping as { error: string }).error).toContain("Import board");

    const wrongForDevice = parseShareFile("device", JSON.stringify(minimalMapping()));
    expect((wrongForDevice as { error: string }).error).toContain("looks like a mapping");
    expect((wrongForDevice as { error: string }).error).toContain("Import mapping");
  });

  it("refuses foreign files, garbage, and oversized content — friendly, never a throw", () => {
    expect(parseShareFile("mapping", "{ nope")).toMatchObject({ ok: false });
    expect((parseShareFile("mapping", "{ nope") as { error: string }).error).toContain("JSON");
    expect(parseShareFile("mapping", JSON.stringify({ some: "config" }))).toMatchObject({ ok: false });
    const oversized = JSON.stringify({ x: "a".repeat(MAX_SHARE_BYTES) });
    expect((parseShareFile("mapping", oversized) as { error: string }).error).toContain("1 MB");
  });

  it("runs the strict schema — a detected-but-invalid entity is refused with the failing path", () => {
    const broken = minimalMapping({ assignments: [{ controlId: "x", action: { type: "warp" } }] });
    const result = parseShareFile("mapping", JSON.stringify(broken));
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("not a valid mapping file");
  });
});

describe("commandCaution (AC-7)", () => {
  it("warns only when a free-text command is present", () => {
    const plain = minimalMapping() as unknown as Mapping;
    expect(commandCaution(plain)).toBeUndefined();
    const withCommand = minimalMapping({
      assignments: [{ controlId: "btn-1", action: { type: "command", command: "Go+ Sequence 1" } }],
    }) as unknown as Mapping;
    expect(commandCaution(withCommand)).toContain("exactly as written");
  });
});
