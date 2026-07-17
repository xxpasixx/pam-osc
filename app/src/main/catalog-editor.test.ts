import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeFixtures } from "../testing/fixtures.js";
import { Catalog, type CatalogPaths } from "./catalog.js";
import type { DeviceDefinition, Mapping } from "../core/format/index.js";
import type { DeviceEditData, MappingEditData } from "../shared/ipc.js";

/**
 * PAM-6 editor surface of the catalog over real folders: content queries,
 * save with validation, copy-on-edit, retarget, and orphan cleanup
 * (AC-2, AC-3, AC-5, AC-6, AC-7).
 */

const NONE = new Set<string>();

describe("Catalog editor surface (PAM-6)", () => {
  let paths: CatalogPaths;
  let catalog: Catalog;

  beforeEach(async () => {
    const bundled = await writeFixtures();
    const userDir = await mkdtemp(join(tmpdir(), "pam-user-"));
    paths = {
      bundledDevicesDir: bundled[0]!.devicesDir,
      bundledMappingsDir: bundled[0]!.mappingsDir,
      userDevicesDir: join(userDir, "devices"),
      userMappingsDir: join(userDir, "mappings"),
    };
    catalog = new Catalog(paths);
    await catalog.refresh();
  });

  const loadEdit = (id: string): MappingEditData => {
    const data = catalog.mappingForEdit(id);
    if ("error" in data) throw new Error(data.error);
    return data;
  };

  const loadDevice = (id: string, active = NONE): DeviceEditData => {
    const data = catalog.deviceForEdit(id, active);
    if ("error" in data) throw new Error(data.error);
    return data;
  };

  it("boards() carries the origin for the boards manager", () => {
    const board = catalog.boards().find((candidate) => candidate.id === "test-board");
    expect(board?.origin).toBe("bundled");
  });

  it("mappingForEdit returns full content, its board, and the origin", () => {
    const data = loadEdit("test-map");
    expect(data.origin).toBe("bundled");
    expect(data.device.id).toBe("test-board");
    expect(data.mapping.assignments.length).toBeGreaterThan(0);
    expect(catalog.mappingForEdit("ghost")).toEqual({ error: 'mapping "ghost" not found' });
  });

  it("deviceForEdit lists per-control usage with the active flag (AC-7 warning data)", () => {
    const data = loadDevice("test-board", new Set(["test-map"]));
    const usage = data.usage.find((entry) => entry.controlId === "fader-cc");
    expect(usage?.mappings).toEqual([{ id: "test-map", name: "Test Mapping", origin: "bundled", active: true }]);
  });

  it("saveMapping rejects an invalid draft and writes nothing (AC-7)", async () => {
    const draft = structuredClone(loadEdit("test-map").mapping);
    draft.assignments[0]!.controlId = "ghost";
    const result = await catalog.saveMapping(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe("assignments[0].controlId");
    expect(await readdir(paths.userMappingsDir)).toEqual([]);
  });

  it("saveMapping on a bundled mapping creates a suffixed user copy (AC-5), original untouched", async () => {
    const draft = structuredClone(loadEdit("test-map").mapping);
    draft.assignments = draft.assignments.filter((assignment) => assignment.controlId !== "btn-exec");
    const result = await catalog.saveMapping(draft);
    expect(result).toMatchObject({ ok: true, id: "test-map-2" });

    const copy = JSON.parse(await readFile(join(paths.userMappingsDir, "test-map-2.json"), "utf8")) as Mapping;
    expect(copy.name).toBe("Test Mapping (2)");
    expect(copy.assignments.some((assignment) => assignment.controlId === "btn-exec")).toBe(false);
    // both visible: bundled original + user copy
    const ids = catalog.entries().map((entry) => entry.id);
    expect(ids).toContain("test-map");
    expect(ids).toContain("test-map-2");
  });

  it("saveMapping on a user mapping rewrites it in place (AC-2)", async () => {
    await catalog.materializePorts([{ id: "test-map", input: "In", output: "Out" }]); // user copy, same id
    const draft = structuredClone(loadEdit("test-map").mapping);
    draft.assignments = draft.assignments.filter((assignment) => assignment.controlId !== "btn-exec");
    const result = await catalog.saveMapping(draft);
    expect(result).toMatchObject({ ok: true, id: "test-map" });
    const files = await readdir(paths.userMappingsDir);
    expect(files.sort()).toEqual(["test-map.json"]);
  });

  it("saveDeviceDefinition on a bundled board creates a copy and retargets chosen user mappings (AC-5)", async () => {
    await catalog.materializePorts([{ id: "test-map", input: "In", output: "Out" }]);
    const draft = structuredClone(loadDevice("test-board").device);
    draft.layout.width += 1;
    const result = await catalog.saveDeviceDefinition({ draft, retargetMappingIds: ["test-map"] });
    expect(result).toMatchObject({ ok: true, id: "test-board-2" });
    if (!result.ok) return;
    expect(result.rewrittenMappings).toContain("test-map");

    const retargeted = JSON.parse(await readFile(join(paths.userMappingsDir, "test-map.json"), "utf8")) as Mapping;
    expect(retargeted.deviceDefinitionId).toBe("test-board-2");
    // copy exists as a user board; the bundled original stays listed
    const boards = catalog.boards();
    expect(boards.find((board) => board.id === "test-board-2")?.origin).toBe("user");
    expect(boards.some((board) => board.id === "test-board")).toBe(true);
  });

  it("saveDeviceDefinition never retargets bundled mappings", async () => {
    const draft = structuredClone(loadDevice("test-board").device);
    const result = await catalog.saveDeviceDefinition({ draft, retargetMappingIds: ["test-map"] });
    expect(result).toMatchObject({ ok: true, id: "test-board-2" });
    if (!result.ok) return;
    expect(result.rewrittenMappings).toEqual([]);
    const bundled = loadEdit("test-map");
    expect(bundled.mapping.deviceDefinitionId).toBe("test-board");
  });

  it("deleting an assigned control cleans up the orphaned assignments in user mappings (AC-7)", async () => {
    await catalog.materializePorts([{ id: "test-map", input: "In", output: "Out" }]);
    const draft = structuredClone(loadDevice("test-board").device);
    draft.controls = draft.controls.filter((control) => control.id !== "btn-exec");

    const result = await catalog.saveDeviceDefinition({ draft, retargetMappingIds: ["test-map"] });
    expect(result).toMatchObject({ ok: true, id: "test-board-2" });
    if (!result.ok) return;

    const rewritten = JSON.parse(await readFile(join(paths.userMappingsDir, "test-map.json"), "utf8")) as Mapping;
    expect(rewritten.deviceDefinitionId).toBe("test-board-2");
    expect(rewritten.assignments.some((assignment) => assignment.controlId === "btn-exec")).toBe(false);
    expect(rewritten.assignments.length).toBeGreaterThan(0);
    // the loader accepts the result — the mapping is still usable (not skipped)
    expect(catalog.entries().some((entry) => entry.id === "test-map")).toBe(true);
  });

  it("saveDeviceDefinition validates the draft (duplicate address → error, nothing written)", async () => {
    const draft = structuredClone(loadDevice("test-board").device);
    const button = draft.controls.find((control) => control.id === "btn-pad")!;
    if (button.type !== "display") button.midi = { kind: "note", number: 10 } as typeof button.midi;
    const result = await catalog.saveDeviceDefinition({ draft, retargetMappingIds: [] });
    expect(result.ok).toBe(false);
    expect(await readdir(paths.userDevicesDir)).toEqual([]);
  });

  it("createNew writes a fresh user board and auto-suffixes a colliding id (AC-6)", async () => {
    const board: DeviceDefinition = {
      formatVersion: 1,
      id: "my-board",
      name: "My Board",
      mode: "standard",
      defaultMidiChannel: 1,
      layout: { width: 4, height: 4 },
      controls: [
        {
          id: "button-1",
          type: "button",
          midi: { kind: "note", number: 1 },
          position: { x: 0, y: 0, width: 1, height: 1, shape: "rect" },
          capabilities: { led: "none" },
        },
      ],
    };
    const first = await catalog.saveDeviceDefinition({ draft: board, retargetMappingIds: [], createNew: true });
    expect(first).toMatchObject({ ok: true, id: "my-board" });
    const second = await catalog.saveDeviceDefinition({ draft: board, retargetMappingIds: [], createNew: true });
    expect(second).toMatchObject({ ok: true, id: "my-board-2" });
    expect((await readdir(paths.userDevicesDir)).sort()).toEqual(["my-board-2.json", "my-board.json"]);
  });
});
