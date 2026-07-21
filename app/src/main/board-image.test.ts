import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeFixtures } from "../testing/fixtures.js";
import { deviceDefinitionSchema } from "../core/format/index.js";
import { Catalog, type CatalogPaths } from "./catalog.js";

/**
 * PAM-21: board images — convention lookup, `image` override, graceful
 * absence, and path-traversal safety.
 */

function device(id: string, image?: string) {
  return {
    formatVersion: 1,
    id,
    name: id,
    ...(image ? { image } : {}),
    layout: { width: 2, height: 2 },
    controls: [
      { id: "b1", type: "button", midi: { kind: "note", number: 1 }, position: { x: 0, y: 0, width: 1, height: 1 }, capabilities: { led: "none" } },
    ],
  };
}

describe("Catalog.deviceImage (PAM-21)", () => {
  let paths: CatalogPaths;
  let catalog: Catalog;
  let userImagesDir: string;

  beforeEach(async () => {
    const bundled = await writeFixtures();
    const userDir = await mkdtemp(join(tmpdir(), "pam-img-"));
    paths = {
      bundledDevicesDir: bundled[0]!.devicesDir,
      bundledMappingsDir: bundled[0]!.mappingsDir,
      userDevicesDir: join(userDir, "devices"),
      userMappingsDir: join(userDir, "mappings"),
    };
    catalog = new Catalog(paths);
    await mkdir(paths.userDevicesDir, { recursive: true });
    userImagesDir = join(paths.userDevicesDir, "images");
    await mkdir(userImagesDir, { recursive: true });
  });

  it("finds images/<id>.png by convention and returns a PNG data URL (AC-1)", async () => {
    await writeFile(join(paths.userDevicesDir, "conv-board.json"), JSON.stringify(device("conv-board")), "utf8");
    await writeFile(join(userImagesDir, "conv-board.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await catalog.refresh();
    const url = await catalog.deviceImage("conv-board");
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("honours an explicit image override with the right MIME (AC-2)", async () => {
    await writeFile(join(paths.userDevicesDir, "ov-board.json"), JSON.stringify(device("ov-board", "shot.jpg")), "utf8");
    await writeFile(join(userImagesDir, "shot.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
    await catalog.refresh();
    const url = await catalog.deviceImage("ov-board");
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns null when no image file exists (AC-3)", async () => {
    await writeFile(join(paths.userDevicesDir, "bare-board.json"), JSON.stringify(device("bare-board")), "utf8");
    await catalog.refresh();
    expect(await catalog.deviceImage("bare-board")).toBeNull();
  });

  it("returns null for an unknown board id", async () => {
    await catalog.refresh();
    expect(await catalog.deviceImage("nope")).toBeNull();
  });

  it("rejects a traversal filename at the schema layer (AC-4)", () => {
    expect(deviceDefinitionSchema.safeParse(device("evil", "../../secret.png")).success).toBe(false);
    expect(deviceDefinitionSchema.safeParse(device("evil", "sub/dir.png")).success).toBe(false);
    expect(deviceDefinitionSchema.safeParse(device("ok", "fine.png")).success).toBe(true);
  });
});
