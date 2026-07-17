import { describe, expect, it } from "vitest";
import type { EngineConfig } from "../core/engine/index.js";
import { EngineHost, type EngineLike } from "./engine-host.js";
import type { EngineState } from "../shared/ipc.js";

const config = (address: string): EngineConfig => ({
  consoleAddress: address,
  sendPort: 8000,
  receivePort: 8001,
  sources: [],
  activeMappingIds: ["test-map"],
});

function makeHost(engine: EngineLike) {
  const states: EngineState[] = [];
  const host = new EngineHost(engine, {
    onState: (state) => states.push(state),
    onConnection: () => {},
    onDevices: () => {},
    onIssue: () => {},
    onLog: () => {},
  });
  return { host, states };
}

describe("EngineHost.autoStart (AC-4)", () => {
  it("starts with the persisted config and reports running", async () => {
    const started: EngineConfig[] = [];
    const engine: EngineLike = {
      start: async (cfg) => {
        started.push(cfg);
      },
      stop: async () => {},
      on: () => undefined,
    };
    const { host, states } = makeHost(engine);

    const error = await host.autoStart(config("10.0.0.9"));
    expect(error).toBeUndefined();
    expect(started).toHaveLength(1);
    expect(states).toEqual(["starting", "running"]);
    expect(host.snapshot().engineState).toBe("running");
  });

  it("a failing start is a returned error, not a crash — state stays stopped", async () => {
    const engine: EngineLike = {
      start: async () => {
        throw new Error("UDP port already in use");
      },
      stop: async () => {},
      on: () => undefined,
    };
    const { host, states } = makeHost(engine);

    const error = await host.autoStart(config("10.0.0.9"));
    expect(error).toBe("UDP port already in use");
    expect(states).toEqual(["starting", "stopped"]);
    expect(host.snapshot().engineState).toBe("stopped");
  });
});
