import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { EngineConfig } from "../core/engine/index.js";
import type { SettingsDraft } from "../core/settings/schema.js";
import { writeFixtures } from "../testing/fixtures.js";
import { applySettings, type ApplyDeps } from "./apply-settings.js";
import { Catalog } from "./catalog.js";
import { EngineHost, type EngineLike } from "./engine-host.js";
import { SettingsStore } from "./settings-store.js";
import { draftFromPersisted } from "./snapshot.js";
import type { EngineState, Snapshot } from "../shared/ipc.js";

/**
 * The Save transaction against a real store + catalog and an engine double
 * (design → Build Plan T7: start-fails / partial / success paths, EC-3).
 */

class FakeEngine implements EngineLike {
  startedWith: EngineConfig[] = [];
  failNextStarts = 0;
  async start(config: EngineConfig): Promise<void> {
    if (this.failNextStarts > 0) {
      this.failNextStarts -= 1;
      throw new Error("UDP port already in use");
    }
    this.startedWith.push(config);
  }
  async stop(): Promise<void> {}
  checkConnection(): void {}
  outputTest(): { ok: true } {
    return { ok: true };
  }
  on(): unknown {
    return this;
  }
}

describe("applySettings — the Save transaction (AC-3, AC-6, EC-3)", () => {
  let deps: ApplyDeps;
  let engine: FakeEngine;
  let store: SettingsStore;
  let catalog: Catalog;
  let states: EngineState[];
  let settingsFile: string;

  const validDraft = (): SettingsDraft => ({
    console: { address: "10.0.0.9", sendPort: 8000, receivePort: 8001 },
    activeMappings: [{ id: "test-map", input: "Unit In", output: "Unit Out" }],
  });

  beforeEach(async () => {
    const bundled = await writeFixtures();
    const userDir = await mkdtemp(join(tmpdir(), "pam-apply-"));
    settingsFile = join(userDir, "settings.json");
    catalog = new Catalog({
      bundledDevicesDir: bundled[0]!.devicesDir,
      bundledMappingsDir: bundled[0]!.mappingsDir,
      userDevicesDir: join(userDir, "devices"),
      userMappingsDir: join(userDir, "mappings"),
    });
    await catalog.refresh();
    store = new SettingsStore(userDir);
    await store.load();
    engine = new FakeEngine();
    states = [];
    const host = new EngineHost(engine, {
      onState: (state) => states.push(state),
      onConnection: () => {},
      onDevices: () => {},
      onIssue: () => {},
      onLog: () => {},
      onTraffic: () => {},
    });
    deps = {
      catalog,
      settingsStore: store,
      engineHost: host,
      buildEngineConfig: (draft) => ({
        consoleAddress: draft.console.address,
        sendPort: draft.console.sendPort,
        receivePort: draft.console.receivePort,
        sources: catalog.sources(),
        activeMappingIds: draft.activeMappings.map((mapping) => mapping.id),
      }),
      buildSnapshot: async (): Promise<Snapshot> => ({
        settings: draftFromPersisted(store.settings, catalog),
        firstRun: false,
        catalog: catalog.entries(),
        invalidFiles: catalog.invalidFiles(),
        midiPorts: { inputs: [], outputs: [] },
        engineState: "running",
        connection: undefined,
        devices: [],
        notices: [],
        traffic: [],
        portDiagnosis: undefined,
      }),
    };
  });

  it("validation failure returns field errors and changes nothing (AC-6)", async () => {
    const result = await applySettings(
      { console: { address: "", sendPort: 0, receivePort: 9004 }, activeMappings: [] },
      deps
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.length).toBeGreaterThan(0);
    expect(engine.startedWith).toEqual([]);
    await expect(readFile(settingsFile, "utf8")).rejects.toThrow(); // nothing persisted
  });

  it("success: mapping files written, engine reconfigured, settings persisted (AC-3)", async () => {
    const result = await applySettings(validDraft(), deps);
    expect(result.ok).toBe(true);

    expect(engine.startedWith.length).toBe(1);
    expect(engine.startedWith[0]?.activeMappingIds).toEqual(["test-map"]);

    const persisted = JSON.parse(await readFile(settingsFile, "utf8")) as {
      activeMappingIds: string[];
      console: { address: string };
    };
    expect(persisted.activeMappingIds).toEqual(["test-map"]);
    expect(persisted.console.address).toBe("10.0.0.9");

    // the applied snapshot mirrors the materialized ports (copy-on-activate)
    if (result.ok) {
      expect(result.snapshot.settings.activeMappings).toEqual([
        { id: "test-map", input: "Unit In", output: "Unit Out" },
      ]);
    }
    expect(states).toEqual(["starting", "running"]);
  });

  it("trims the console address before applying and persisting (copy-paste whitespace)", async () => {
    const draft = validDraft();
    draft.console.address = "  10.0.0.9\t";
    const result = await applySettings(draft, deps);
    expect(result.ok).toBe(true);

    expect(engine.startedWith[0]?.consoleAddress).toBe("10.0.0.9");
    const persisted = JSON.parse(await readFile(settingsFile, "utf8")) as { console: { address: string } };
    expect(persisted.console.address).toBe("10.0.0.9");
  });

  it("total engine failure rolls back to last-known-good and does not persist (EC-3)", async () => {
    await applySettings(validDraft(), deps); // establish a known-good config
    const persistedBefore = await readFile(settingsFile, "utf8");
    engine.startedWith = [];

    engine.failNextStarts = 1;
    const second: SettingsDraft = {
      console: { address: "10.0.0.99", sendPort: 8100, receivePort: 8101 },
      activeMappings: [{ id: "test-map", input: "Unit In", output: "Unit Out" }],
    };
    const result = await applySettings(second, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.notices.some((notice) => notice.message.includes("previous working configuration"))).toBe(true);
    }
    // rollback restarted the last-known-good config
    expect(engine.startedWith.length).toBe(1);
    expect(engine.startedWith[0]?.consoleAddress).toBe("10.0.0.9");
    expect(await readFile(settingsFile, "utf8")).toBe(persistedBefore); // not persisted
  });

  it("engine failure without a known-good config leaves the engine stopped (first run, EC-3)", async () => {
    engine.failNextStarts = 2; // start + no rollback target
    const result = await applySettings(validDraft(), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.notices.some((notice) => notice.message.includes("could not start"))).toBe(true);
    }
    expect(states.at(-1)).toBe("stopped");
  });

  it("empty active list stops the engine on purpose and persists (design)", async () => {
    await applySettings(validDraft(), deps);
    const result = await applySettings({ console: validDraft().console, activeMappings: [] }, deps);
    expect(result.ok).toBe(true);
    const persisted = JSON.parse(await readFile(settingsFile, "utf8")) as { activeMappingIds: string[] };
    expect(persisted.activeMappingIds).toEqual([]);
    expect(states.at(-1)).toBe("stopped");
  });
});
