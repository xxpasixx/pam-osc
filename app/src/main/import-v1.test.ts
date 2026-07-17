import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { Catalog } from "./catalog.js";
import { analyzeV1File, importV1File } from "./import-v1.js";

/**
 * PAM-5 AC-2/AC-5/AC-6 at the main-process boundary: real bundled resources
 * as the catalog, a temp folder as the user's mappings dir, real v1 files.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const legacyDir = join(repoRoot, "mappings");

describe("importV1File", () => {
  let catalog: Catalog;
  let userMappingsDir: string;

  beforeEach(async () => {
    const userDir = await mkdtemp(join(tmpdir(), "pam-import-user-"));
    userMappingsDir = join(userDir, "mappings");
    catalog = new Catalog({
      bundledDevicesDir: join(repoRoot, "resources", "devices"),
      bundledMappingsDir: join(repoRoot, "resources", "mappings"),
      userDevicesDir: join(userDir, "devices"),
      userMappingsDir,
    });
    await catalog.refresh();
  });

  it("analyze reports the sections of a real v1 file (AC-1)", async () => {
    const result = await analyzeV1File(join(legacyDir, "xTouch1.json"));
    expect(result).toEqual({
      status: "ok",
      filePath: join(legacyDir, "xTouch1.json"),
      fileName: "xTouch1.json",
      counts: { control: 0, pitch: 9, note: 98, rltvControl: 9, display: 8 },
    });
  });

  it("imports a real v1 file: new user file, source untouched, catalog entry appears (AC-2)", async () => {
    const sourcePath = join(legacyDir, "xTouch1.json");
    const sourceBefore = await readFile(sourcePath, "utf8");

    const result = await importV1File(
      { filePath: sourcePath, deviceDefinitionId: "x-touch", name: "My X-Touch" },
      catalog
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.entry.id).toBe("my-x-touch");
    expect(result.entry.name).toBe("My X-Touch");
    expect(result.entry.origin).toBe("user");
    expect(result.entry.boardName).toBe("Behringer X-Touch");
    expect(result.summary.converted).toBe(124);
    expect(result.summary.warnings).toEqual([]);

    // Source untouched; the new file is a valid v2 mapping in the user folder.
    expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
    expect(await readdir(userMappingsDir)).toEqual(["my-x-touch.json"]);
    expect(catalog.entries().some((entry) => entry.id === "my-x-touch")).toBe(true);

    const written = JSON.parse(await readFile(join(userMappingsDir, "my-x-touch.json"), "utf8")) as {
      notes?: string;
      midiPort?: unknown;
    };
    expect(written.notes).toContain('Imported from v1 file "xTouch1.json"');
    expect(written.midiPort).toEqual({ input: "Behringer X-Touch", output: "Behringer X-Touch" });
  });

  it("bumps the id when the name collides with an existing mapping", async () => {
    const sourcePath = join(legacyDir, "xTouchCompact1.json");
    const first = await importV1File(
      { filePath: sourcePath, deviceDefinitionId: "x-touch-compact", name: "Compact" },
      catalog
    );
    const second = await importV1File(
      { filePath: sourcePath, deviceDefinitionId: "x-touch-compact", name: "Compact" },
      catalog
    );
    expect(first.ok && first.entry.id).toBe("compact");
    expect(second.ok && second.entry.id).toBe("compact-2");
    expect((await readdir(userMappingsDir)).sort()).toEqual(["compact-2.json", "compact.json"]);
  });

  it("skips ids whose file name is already occupied by a stray file", async () => {
    await catalog.refresh(); // ensures the user folder exists
    await writeFile(join(userMappingsDir, "compact.json"), "{ broken", "utf8");
    const result = await importV1File(
      { filePath: join(legacyDir, "xTouchCompact1.json"), deviceDefinitionId: "x-touch-compact", name: "Compact" },
      catalog
    );
    expect(result.ok && result.entry.id).toBe("compact-2");
  });

  it("rejects unknown boards and empty names, writing nothing (AC-6)", async () => {
    const sourcePath = join(legacyDir, "xTouch1.json");
    const badBoard = await importV1File({ filePath: sourcePath, deviceDefinitionId: "ghost", name: "X" }, catalog);
    expect(badBoard).toEqual({ ok: false, error: expect.stringContaining('unknown board "ghost"') });
    const noName = await importV1File({ filePath: sourcePath, deviceDefinitionId: "x-touch", name: "   " }, catalog);
    expect(noName).toEqual({ ok: false, error: expect.stringContaining("needs a name") });
    expect(await readdir(userMappingsDir)).toEqual([]);
  });

  it("rejects non-JSON, v2 files, and non-v1 shapes with clear errors (AC-6)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pam-import-bad-"));

    const notJson = join(dir, "broken.json");
    await writeFile(notJson, "{ nope", "utf8");
    expect(await analyzeV1File(notJson)).toEqual({
      status: "error",
      error: expect.stringContaining("broken.json: not valid JSON"),
    });

    const v2File = join(dir, "v2.json");
    await writeFile(v2File, JSON.stringify({ formatVersion: 1, id: "x", name: "X" }), "utf8");
    expect(await analyzeV1File(v2File)).toEqual({
      status: "error",
      error: expect.stringContaining("already a pam-osc v2 file"),
    });

    const notV1 = join(dir, "random.json");
    await writeFile(notV1, JSON.stringify({ hello: "world" }), "utf8");
    expect(await analyzeV1File(notV1)).toEqual({
      status: "error",
      error: expect.stringContaining("no v1 mapping sections"),
    });

    const missing = await analyzeV1File(join(dir, "does-not-exist.json"));
    expect(missing.status).toBe("error");

    // The same errors stop importV1File before anything is written.
    const result = await importV1File({ filePath: notJson, deviceDefinitionId: "x-touch", name: "X" }, catalog);
    expect(result.ok).toBe(false);
    expect(await readdir(userMappingsDir)).toEqual([]);
  });

  it("wrong board imports with zero assignments and per-entry warnings (design: obvious mistake)", async () => {
    const result = await importV1File(
      { filePath: join(legacyDir, "mpx16-1.json"), deviceDefinitionId: "launchpad", name: "Oops" },
      catalog
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.converted).toBeLessThan(result.summary.warnings.length + result.summary.converted);
    expect(result.summary.warnings.length).toBeGreaterThan(0);
    expect(catalog.entries().some((entry) => entry.id === "oops")).toBe(true);
  });
});
