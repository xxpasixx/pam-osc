import { describe, expect, it } from "vitest";
import type { Ma3SetupInfo } from "../../shared/ipc.js";
import { ma3Checklist, nextOpenStep } from "./ma3-checklist.js";

const info = (installs: Partial<Ma3SetupInfo["installs"][number]>[] = []): Ma3SetupInfo => ({
  bundledVersion: "2.0.0.3",
  localAddresses: [],
  installs: installs.map((install) => ({
    base: "/b",
    pluginsDir: "/b/p",
    oscDir: "/b/o",
    hasPamOsc: false,
    hasOscConfig: false,
    ...install,
  })),
});

const statuses = (steps: ReturnType<typeof ma3Checklist>) => steps.map((step) => step.status);

describe("PAM-36 MA3 checklist", () => {
  it("nothing set up on this computer → step 1 open, the rest waits", () => {
    const steps = ma3Checklist({ info: info(), onThisComputer: true, engineState: "stopped", connection: undefined });
    expect(statuses(steps)).toEqual(["open", "waiting", "waiting"]);
    expect(nextOpenStep(steps)).toBe("files");
  });

  it("current plugin + OSC config in onPC → step 1 done, OSC next", () => {
    const steps = ma3Checklist({
      info: info([{ hasPamOsc: true, hasOscConfig: true, installedVersion: "2.0.0.3" }]),
      onThisComputer: true,
      engineState: "running",
      connection: { state: "unreachable", attempt: 2, gaveUp: false },
    });
    expect(statuses(steps)).toEqual(["done", "open", "waiting"]);
    expect(steps[0]!.summary).toBe("Plugin 2.0.0.3 and OSC config are in onPC");
    expect(nextOpenStep(steps)).toBe("osc");
  });

  it("an outdated plugin in onPC keeps step 1 open", () => {
    const steps = ma3Checklist({
      info: info([{ hasPamOsc: true, hasOscConfig: true, installedVersion: "2.0.0.1" }]),
      onThisComputer: true,
      engineState: "running",
      connection: undefined,
    });
    expect(steps[0]!.status).toBe("open");
  });

  it("remote console answering → files and OSC done, plugin next", () => {
    const steps = ma3Checklist({
      info: info(),
      onThisComputer: false,
      engineState: "running",
      connection: { state: "plugin-missing", attempt: 1, gaveUp: false },
    });
    expect(statuses(steps)).toEqual(["done", "done", "open"]);
    expect(nextOpenStep(steps)).toBe("plugin");
  });

  it("connected → everything done, nothing expanded", () => {
    const steps = ma3Checklist({
      info: info(),
      onThisComputer: false,
      engineState: "running",
      connection: { state: "connected", attempt: 1, gaveUp: false },
    });
    expect(statuses(steps)).toEqual(["done", "done", "done"]);
    expect(nextOpenStep(steps)).toBeUndefined();
  });

  it("a stopped bridge never counts a stale 'connected' as done", () => {
    const steps = ma3Checklist({
      info: info(),
      onThisComputer: false,
      engineState: "stopped",
      connection: { state: "connected", attempt: 1, gaveUp: false },
    });
    expect(statuses(steps)).toEqual(["open", "waiting", "waiting"]);
  });
});
