import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeFixtures } from "../testing/fixtures.js";
import { Catalog, type CatalogPaths } from "./catalog.js";

/**
 * Catalog over real folders: the fixture board acts as "bundled", a fresh
 * temp folder as the user's mappings folder.
 */

describe("Catalog (AC-2, EC-4)", () => {
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

  it("lists bundled entries with board name and origin; creates user folders", async () => {
    const entries = catalog.entries();
    expect(entries.map((entry) => entry.id)).toContain("test-map");
    const testMap = entries.find((entry) => entry.id === "test-map")!;
    expect(testMap.boardName).toBe("Test Board");
    expect(testMap.origin).toBe("bundled");
    expect(testMap.midiPort.input).toBe("Test Unit");
    expect(await readdir(paths.userMappingsDir)).toEqual([]); // exists and empty
  });

  it("lists invalid user files with their error, greyed out (EC-4)", async () => {
    await writeFile(join(paths.userMappingsDir, "broken.json"), "{ nope", "utf8");
    await writeFile(
      join(paths.userMappingsDir, "bad-ref.json"),
      JSON.stringify({
        formatVersion: 1,
        id: "bad-ref",
        name: "Bad",
        deviceDefinitionId: "ghost",
        midiPort: { input: "X" },
        assignments: [],
      }),
      "utf8"
    );
    await catalog.refresh();
    const invalid = catalog.invalidFiles();
    expect(invalid.some((file) => file.file === "broken.json" && file.error.includes("JSON"))).toBe(true);
    expect(invalid.some((file) => file.file === "bad-ref.json" && file.error.includes("ghost"))).toBe(true);
    expect(catalog.entries().some((entry) => entry.id === "bad-ref")).toBe(false);

    // BUG-4: the support package needs the full paths of these broken user files.
    const invalidPaths = catalog.invalidUserFiles();
    expect(invalidPaths).toContain(join(paths.userMappingsDir, "broken.json"));
    expect(invalidPaths).toContain(join(paths.userMappingsDir, "bad-ref.json"));
    expect(
      invalidPaths.every((path) => path.startsWith(paths.userMappingsDir) || path.startsWith(paths.userDevicesDir))
    ).toBe(true);
  });

  it("materializes a bundled activation as a user copy with the chosen ports (copy-on-activate)", async () => {
    await catalog.materializePorts([{ id: "test-map", input: "My Unit In", output: "My Unit Out" }]);

    const copy = JSON.parse(await readFile(join(paths.userMappingsDir, "test-map.json"), "utf8")) as {
      id: string;
      midiPort: { input: string; output?: string };
      assignments: unknown[];
    };
    expect(copy.id).toBe("test-map");
    expect(copy.midiPort).toEqual({ input: "My Unit In", output: "My Unit Out" });
    expect(copy.assignments.length).toBeGreaterThan(0); // full mapping, not a stub

    // after refresh the user copy shadows the bundled one
    const entry = catalog.entries().find((candidate) => candidate.id === "test-map")!;
    expect(entry.origin).toBe("user");
    expect(entry.midiPort.input).toBe("My Unit In");
    expect(catalog.notices().some((notice) => notice.message.includes("overrides"))).toBe(true);
  });

  it("rewrites a user mapping's ports in place and skips unchanged ones", async () => {
    await catalog.materializePorts([{ id: "test-map", input: "First", output: "First" }]);
    const file = join(paths.userMappingsDir, "test-map.json");
    const before = await readFile(file, "utf8");

    await catalog.materializePorts([{ id: "test-map", input: "First", output: "First" }]); // unchanged → no write
    expect(await readFile(file, "utf8")).toBe(before);

    await catalog.materializePorts([{ id: "test-map", input: "Second", output: undefined }]);
    const raw = JSON.parse(await readFile(file, "utf8")) as { midiPort: unknown };
    expect(raw.midiPort).toEqual({ input: "Second" });
  });

  it("duplicates a mapping with the first free id suffix (second unit)", async () => {
    const first = await catalog.duplicate("test-map");
    expect(first).toMatchObject({ id: "test-map-2", origin: "user" });
    const second = await catalog.duplicate("test-map");
    expect(second).toMatchObject({ id: "test-map-3" });
    const raw = JSON.parse(await readFile(join(paths.userMappingsDir, "test-map-2.json"), "utf8")) as { name: string };
    expect(raw.name).toContain("(2)");
    expect(await catalog.duplicate("ghost")).toEqual({ error: 'mapping "ghost" not found' });
  });

  it("duplicating a duplicate counts up from the original — no (2) (2)", async () => {
    await catalog.duplicate("test-map");
    const third = await catalog.duplicate("test-map-2");
    expect(third).toMatchObject({ id: "test-map-3" });
    const raw = JSON.parse(await readFile(join(paths.userMappingsDir, "test-map-3.json"), "utf8")) as { name: string };
    expect(raw.name).toMatch(/\(3\)$/);
    expect(raw.name).not.toContain("(2)");
  });

  it("creates an empty user mapping for a board (PAM-11 AC-2/AC-7)", async () => {
    const created = await catalog.createMapping("test-board", "My Show Setup");
    expect(created).toMatchObject({
      id: "my-show-setup",
      name: "My Show Setup",
      deviceDefinitionId: "test-board",
      boardName: "Test Board",
      origin: "user",
    });

    const raw = JSON.parse(await readFile(join(paths.userMappingsDir, "my-show-setup.json"), "utf8")) as {
      assignments: unknown[];
      midiPort: { input: string };
    };
    expect(raw.assignments).toEqual([]); // empty — all controls unassigned
    expect(raw.midiPort.input).toBe("Test Board"); // placeholder; Setup rebinds

    // The loader accepts the file — it appears as a valid entry, not invalid.
    expect(catalog.invalidFiles()).toEqual([]);
    expect(catalog.entries().some((entry) => entry.id === "my-show-setup")).toBe(true);
  });

  it("createMapping picks a free id on collision and rejects unknown boards and empty names", async () => {
    await catalog.createMapping("test-board", "My Setup");
    const second = await catalog.createMapping("test-board", "My Setup");
    expect(second).toMatchObject({ id: "my-setup-2" });
    expect(await catalog.createMapping("ghost-board", "X")).toEqual({
      error: 'unknown board "ghost-board" — pick one from the list',
    });
    expect(await catalog.createMapping("test-board", "   ")).toEqual({ error: "the new mapping needs a name" });
  });

  it("createMapping caps the name length before it becomes a filename (BUG-2) and uses a neutral fallback id (BUG-6)", async () => {
    expect(await catalog.createMapping("test-board", "x".repeat(121))).toEqual({
      error: "the name is too long — 120 characters max",
    });
    expect(await catalog.createMapping("test-board", "🎹")).toMatchObject({ id: "mapping" });
  });

  it("createMapping neutralizes hostile names — file lands in the user folder (security)", async () => {
    const created = await catalog.createMapping("test-board", "../../../etc/passwd");
    expect(created).toMatchObject({ id: "etc-passwd", origin: "user" });
    expect(await readdir(paths.userMappingsDir)).toEqual(["etc-passwd.json"]);
  });

  it("entries carry the board id for grouping (PAM-11)", () => {
    const entry = catalog.entries().find((candidate) => candidate.id === "test-map")!;
    expect(entry.deviceDefinitionId).toBe("test-board");
  });

  it("survives a missing bundled folder (empty catalog, no crash)", async () => {
    const empty = new Catalog({
      ...paths,
      bundledDevicesDir: join(tmpdir(), "nope-a"),
      bundledMappingsDir: join(tmpdir(), "nope-b"),
    });
    await empty.refresh();
    expect(empty.entries()).toEqual([]);
  });
});
