import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeFixtures } from "../testing/fixtures.js";
import { Catalog, type CatalogPaths } from "./catalog.js";

/** PAM-22: deleting user (local) boards and mappings — never bundled. */

function userDevice(id: string) {
  return {
    formatVersion: 1,
    id,
    name: id,
    layout: { width: 2, height: 2 },
    controls: [
      { id: "b1", type: "button", midi: { kind: "note", number: 1 }, position: { x: 0, y: 0, width: 1, height: 1 }, capabilities: { led: "none" } },
    ],
  };
}
function userMapping(id: string, deviceDefinitionId: string) {
  return { formatVersion: 1, id, name: id, deviceDefinitionId, midiPort: { input: "In" }, assignments: [] };
}

describe("Catalog delete (PAM-22)", () => {
  let paths: CatalogPaths;
  let catalog: Catalog;

  beforeEach(async () => {
    const bundled = await writeFixtures();
    const userDir = await mkdtemp(join(tmpdir(), "pam-del-"));
    paths = {
      bundledDevicesDir: bundled[0]!.devicesDir,
      bundledMappingsDir: bundled[0]!.mappingsDir,
      userDevicesDir: join(userDir, "devices"),
      userMappingsDir: join(userDir, "mappings"),
    };
    catalog = new Catalog(paths);
    await mkdir(paths.userDevicesDir, { recursive: true });
    await mkdir(paths.userMappingsDir, { recursive: true });
    await writeFile(join(paths.userDevicesDir, "u-board.json"), JSON.stringify(userDevice("u-board")), "utf8");
    await writeFile(join(paths.userMappingsDir, "u-map.json"), JSON.stringify(userMapping("u-map", "u-board")), "utf8");
    await catalog.refresh();
  });

  it("deletes a user mapping and drops it from the catalog", async () => {
    expect(catalog.entries().some((e) => e.id === "u-map")).toBe(true);
    expect(await catalog.deleteMapping("u-map")).toEqual({ ok: true });
    expect(catalog.entries().some((e) => e.id === "u-map")).toBe(false);
  });

  it("refuses to delete a bundled mapping", async () => {
    const result = await catalog.deleteMapping("test-map");
    expect(result).toHaveProperty("error");
    expect(catalog.entries().some((e) => e.id === "test-map")).toBe(true);
  });

  it("refuses to delete a user board still referenced by a mapping, then allows it once free", async () => {
    const blocked = await catalog.deleteDevice("u-board");
    expect(blocked).toHaveProperty("error");
    expect((blocked as { error: string }).error).toMatch(/still used by/i);
    expect(catalog.boards().some((b) => b.id === "u-board")).toBe(true);

    await catalog.deleteMapping("u-map");
    expect(await catalog.deleteDevice("u-board")).toEqual({ ok: true });
    expect(catalog.boards().some((b) => b.id === "u-board")).toBe(false);
  });

  it("refuses to delete a bundled board", async () => {
    const result = await catalog.deleteDevice("test-board");
    expect(result).toHaveProperty("error");
  });

  it("reports not found for unknown ids", async () => {
    expect(await catalog.deleteMapping("nope")).toEqual({ error: 'mapping "nope" not found' });
    expect(await catalog.deleteDevice("nope")).toEqual({ error: 'board "nope" not found' });
  });
});
