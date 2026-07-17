import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { minimalDevice, minimalMapping } from "../core/format/schemas.test.js";
import { writeFixtures } from "../testing/fixtures.js";
import { Catalog, type CatalogPaths } from "./catalog.js";
import { importShareFile } from "./share-files.js";

/**
 * Single-file import end-to-end over a real Catalog (PAM-7 AC-2/3/4/9/13):
 * the fixture board acts as "bundled" content, temp folders as the user's.
 * The fixture ships board id "test-board" with mapping "test-map".
 */

describe("importShareFile", () => {
  let paths: CatalogPaths;
  let catalog: Catalog;
  let shareDir: string;

  const shareFile = async (name: string, content: unknown): Promise<string> => {
    const file = join(shareDir, name);
    await writeFile(file, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
    return file;
  };

  beforeEach(async () => {
    const bundled = await writeFixtures();
    const userDir = await mkdtemp(join(tmpdir(), "pam-share-user-"));
    shareDir = await mkdtemp(join(tmpdir(), "pam-share-in-"));
    paths = {
      bundledDevicesDir: bundled[0]!.devicesDir,
      bundledMappingsDir: bundled[0]!.mappingsDir,
      userDevicesDir: join(userDir, "devices"),
      userMappingsDir: join(userDir, "mappings"),
    };
    catalog = new Catalog(paths);
    await catalog.refresh();
  });

  /** A mapping that fits the fixture board ("test-board", control btn-exec). */
  const fittingMapping = (overrides: Record<string, unknown> = {}) =>
    minimalMapping({
      assignments: [{ controlId: "btn-exec", action: { type: "executor", number: 301 }, feedback: { type: "on-off" } }],
      ...overrides,
    });

  it("imports a valid mapping for an installed board — lands as a user file, not activated (AC-2)", async () => {
    const file = await shareFile("nice.mapping", fittingMapping({ id: "shared-map", name: "Shared" }));
    const result = await importShareFile("mapping", file, catalog);
    expect(result).toMatchObject({ ok: true, kind: "mapping", id: "shared-map", renamed: false });
    expect(await readdir(paths.userMappingsDir)).toContain("shared-map.json");
    const entry = catalog.entries().find((candidate) => candidate.id === "shared-map");
    expect(entry?.origin).toBe("user");
  });

  it("suffixes on id collision — user content is never overwritten (AC-3)", async () => {
    const first = await importShareFile(
      "mapping",
      await shareFile("a.mapping", fittingMapping({ id: "twin", name: "Twin" })),
      catalog
    );
    expect(first).toMatchObject({ ok: true, renamed: false });
    const second = await importShareFile(
      "mapping",
      await shareFile("b.mapping", fittingMapping({ id: "twin", name: "Twin" })),
      catalog
    );
    expect(second).toMatchObject({ ok: true, id: "twin-2", renamed: true });
    const files = await readdir(paths.userMappingsDir);
    expect(files).toContain("twin.json");
    expect(files).toContain("twin-2.json");
  });

  it("refuses a mapping whose assignments don't fit the board — nothing stranded on disk (AC-2/AC-5)", async () => {
    // minimalMapping references controls the fixture board doesn't have.
    const file = await shareFile("misfit.mapping", minimalMapping({ id: "misfit" }));
    const result = await importShareFile("mapping", file, catalog);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain('doesn\'t fit the board "test-board"');
    expect(await readdir(paths.userMappingsDir)).toEqual([]);
  });

  it("refuses a mapping whose board is missing, naming the id and the fix (AC-4)", async () => {
    const file = await shareFile("orphan.mapping", minimalMapping({ deviceDefinitionId: "ghost-board" }));
    const result = await importShareFile("mapping", file, catalog);
    expect(result).toMatchObject({ ok: false });
    const error = (result as { error: string }).error;
    expect(error).toContain("ghost-board");
    expect(error).toContain("device file first");
    expect(await readdir(paths.userMappingsDir)).toEqual([]);
  });

  it("imports a device; a bundled-id collision gets a suffix — never a shadow (AC-9)", async () => {
    const fresh = await importShareFile(
      "device",
      await shareFile("new.device", minimalDevice({ id: "shared-board", name: "Shared Board" })),
      catalog
    );
    expect(fresh).toMatchObject({ ok: true, kind: "device", id: "shared-board", renamed: false });

    const colliding = await importShareFile(
      "device",
      await shareFile("collide.device", minimalDevice({ id: "test-board", name: "Test Board" })),
      catalog
    );
    expect(colliding).toMatchObject({ ok: true, id: "test-board-2", renamed: true });
    // the bundled definition is untouched and still wins its own id
    expect(catalog.deviceFile("test-board")?.origin).toBe("bundled");
    expect(catalog.deviceFile("test-board-2")?.origin).toBe("user");
  });

  it("routes by content, not extension — wrong kind and foreign files are refused (AC-13)", async () => {
    const deviceInMappingSlot = await importShareFile(
      "mapping",
      await shareFile("renamed.mapping", minimalDevice()),
      catalog
    );
    expect((deviceInMappingSlot as { error: string }).error).toContain("looks like a device definition");

    const garbage = await importShareFile("device", await shareFile("random.device", '{"hello":"world"}'), catalog);
    expect((garbage as { error: string }).error).toContain("isn't a pam-osc");
    expect(await readdir(paths.userDevicesDir)).toEqual([]);
  });

  it("carries the verbatim-command caution into the summary (AC-7)", async () => {
    const file = await shareFile(
      "cmd.mapping",
      minimalMapping({
        id: "cmd-map",
        assignments: [{ controlId: "btn-exec", action: { type: "command", command: "Off Sequence 1 Thru" } }],
      })
    );
    const result = await importShareFile("mapping", file, catalog);
    expect(result).toMatchObject({ ok: true });
    expect((result as { caution?: string }).caution).toContain("exactly as written");
  });

  it("refuses oversized files before buffering them (AC-5)", async () => {
    const file = await shareFile("big.mapping", `{"pad":"${"a".repeat(1024 * 1024)}"}`);
    const result = await importShareFile("mapping", file, catalog);
    expect((result as { error: string }).error).toContain("1 MB");
  });
});
