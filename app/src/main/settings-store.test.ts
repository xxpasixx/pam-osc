import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "../core/settings/schema.js";
import { SettingsStore } from "./settings-store.js";

describe("SettingsStore (AC-1, AC-4, EC-2)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pam-settings-"));
  });

  it("missing file → defaults, first run, no notice", async () => {
    const store = new SettingsStore(dir);
    const loaded = await store.load();
    expect(loaded.firstRun).toBe(true);
    expect(loaded.notice).toBeUndefined();
    expect(loaded.settings).toEqual(defaultSettings());
    expect(loaded.settings.console).toEqual({ address: "127.0.0.1", sendPort: 9003, receivePort: 9004 }); // v1 defaults
  });

  it("corrupt file → defaults + notice, file left untouched (EC-2)", async () => {
    const file = join(dir, "settings.json");
    await writeFile(file, "{ not json !!", "utf8");
    const store = new SettingsStore(dir);
    const loaded = await store.load();
    expect(loaded.firstRun).toBe(true);
    expect(loaded.notice?.severity).toBe("warning");
    expect(loaded.notice?.message).toContain("not valid JSON");
    expect(await readFile(file, "utf8")).toBe("{ not json !!"); // untouched until save
  });

  it("newer format version → defaults + clear update message", async () => {
    await writeFile(join(dir, "settings.json"), JSON.stringify({ formatVersion: 99 }), "utf8");
    const loaded = await new SettingsStore(dir).load();
    expect(loaded.notice?.message).toContain("newer pam-osc");
  });

  it("schema-invalid content → defaults + notice naming the problem", async () => {
    await writeFile(
      join(dir, "settings.json"),
      JSON.stringify({ formatVersion: 1, console: { address: "", sendPort: "x", receivePort: 9004 }, activeMappingIds: [] }),
      "utf8",
    );
    const loaded = await new SettingsStore(dir).load();
    expect(loaded.firstRun).toBe(true);
    expect(loaded.notice?.message).toContain("console.");
  });

  it("save → load roundtrip, atomic write, bounds saved outside the transaction", async () => {
    const store = new SettingsStore(dir);
    await store.load();
    const settings = {
      ...defaultSettings(),
      console: { address: "10.0.0.5", sendPort: 8000, receivePort: 8001 },
      activeMappingIds: ["x-touch-default-1"],
    };
    await store.save(settings);
    await store.saveWindowBounds({ x: 10, y: 20, width: 900, height: 700 });

    const reloaded = await new SettingsStore(dir).load();
    expect(reloaded.firstRun).toBe(false);
    expect(reloaded.settings.console.address).toBe("10.0.0.5");
    expect(reloaded.settings.activeMappingIds).toEqual(["x-touch-default-1"]);
    expect(reloaded.settings.ui?.windowBounds).toEqual({ x: 10, y: 20, width: 900, height: 700 });
  });
});
