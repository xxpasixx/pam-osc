import { describe, expect, it } from "vitest";
import type { ActiveMappingDraft } from "../../core/settings/schema.js";
import type { CatalogEntry } from "../../shared/ipc.js";
import type { ConnectionStatus } from "../../core/engine/types.js";
import {
  activateCatalogEntry,
  checkReadout,
  consoleRoute,
  controllersReady,
  inputPortConnected,
  shouldAutoOpenWizard,
  shouldAutoStartEngine,
  shouldPollConnection,
  targetReached,
} from "./wizard-logic.js";

/**
 * PAM-14 (BUG-2): the wizard's decision logic. There is no renderer/component
 * test harness in this repo (no jsdom / testing-library), so the pure logic the
 * components call is unit-tested directly here — the components use these exact
 * functions, so this guards the real code paths (AC-1, AC-3, AC-8).
 */

describe("shouldAutoOpenWizard — first-snapshot-only auto-open (AC-1)", () => {
  it("opens on first run when the flag is absent", () => {
    expect(shouldAutoOpenWizard(undefined)).toBe(true);
  });

  it("opens when the flag is present but not completed", () => {
    expect(shouldAutoOpenWizard({ completed: false })).toBe(true);
  });

  it("stays closed once completed — a post-save snapshot adopt carries completed:true and does NOT reopen", () => {
    // App decides this ONLY from the initial snapshot; but even if the completed
    // marker were re-evaluated after a save, the decision is false — so the
    // wizard cannot reopen itself.
    expect(shouldAutoOpenWizard({ completed: true })).toBe(false);
  });
});

describe("activateCatalogEntry — completed v1 import yields an active mapping (AC-3 / BUG-1)", () => {
  const importedEntry: Pick<CatalogEntry, "id" | "midiPort"> = {
    id: "map-imported-v1",
    midiPort: { input: "X-Touch IN", output: "X-Touch OUT" },
  };

  it("adds the imported mapping to an empty active list so activeMappingCount becomes 1", () => {
    const next = activateCatalogEntry([], importedEntry);
    expect(next).toEqual([{ id: "map-imported-v1", input: "X-Touch IN", output: "X-Touch OUT" }]);
    expect(next.length).toBe(1); // Next in the controller step now enables
  });

  it("appends alongside an existing active mapping without dropping it", () => {
    const existing: ActiveMappingDraft[] = [{ id: "map-a", input: "Port A", output: "Port A" }];
    const next = activateCatalogEntry(existing, importedEntry);
    expect(next.map((m) => m.id)).toEqual(["map-a", "map-imported-v1"]);
  });

  it("is idempotent — re-activating an already-active id does not duplicate it (harmless tabbed import)", () => {
    const existing: ActiveMappingDraft[] = [{ id: "map-imported-v1", input: "X-Touch IN", output: "X-Touch OUT" }];
    const next = activateCatalogEntry(existing, importedEntry);
    expect(next).toBe(existing); // unchanged reference — no re-add
  });

  it("carries an absent output through (input-only devices)", () => {
    const next = activateCatalogEntry([], { id: "map-in-only", midiPort: { input: "Nano IN" } });
    expect(next).toEqual([{ id: "map-in-only", input: "Nano IN", output: undefined }]);
  });
});

describe("shouldAutoStartEngine — auto-start guard on a live-check step (AC-8, PAM-35 AC-8)", () => {
  it("starts when on the verify step, engine stopped, and a mapping is active", () => {
    expect(shouldAutoStartEngine({ onCheckStep: true, engineState: "stopped", activeMappingCount: 1 })).toBe(true);
  });

  it("does NOT start when not on the verify step", () => {
    expect(shouldAutoStartEngine({ onCheckStep: false, engineState: "stopped", activeMappingCount: 1 })).toBe(false);
  });

  it("does NOT start when no mapping is active", () => {
    expect(shouldAutoStartEngine({ onCheckStep: true, engineState: "stopped", activeMappingCount: 0 })).toBe(false);
  });

  it("does NOT start when the engine is already running", () => {
    expect(shouldAutoStartEngine({ onCheckStep: true, engineState: "running", activeMappingCount: 1 })).toBe(false);
  });

  it("does NOT start while the engine is already starting", () => {
    expect(shouldAutoStartEngine({ onCheckStep: true, engineState: "starting", activeMappingCount: 1 })).toBe(false);
  });
});

// ---- PAM-35 ----

const status = (state: ConnectionStatus["state"]): ConnectionStatus => ({ state, attempt: 1, gaveUp: false });

describe("consoleRoute — where GrandMA3 runs (PAM-35 AC-3)", () => {
  it("loopback is this computer, anything else the network", () => {
    expect(consoleRoute("127.0.0.1")).toBe("this-computer");
    expect(consoleRoute("localhost")).toBe("this-computer");
    expect(consoleRoute("192.168.1.50")).toBe("network");
    expect(consoleRoute("")).toBe("network");
  });
});

describe("targetReached — staged checks (PAM-35 AC-6/AC-7)", () => {
  it("'reachable' is reached as soon as the console answers, plugin or not", () => {
    expect(targetReached("reachable", status("plugin-missing"))).toBe(true);
    expect(targetReached("reachable", status("connected"))).toBe(true);
    expect(targetReached("reachable", status("plugin-outdated"))).toBe(true);
    expect(targetReached("reachable", status("unreachable"))).toBe(false);
    expect(targetReached("reachable", status("checking"))).toBe(false);
    expect(targetReached("reachable", undefined)).toBe(false);
  });

  it("'connected' needs the plugin with the right protocol", () => {
    expect(targetReached("connected", status("connected"))).toBe(true);
    expect(targetReached("connected", status("plugin-missing"))).toBe(false);
    expect(targetReached("connected", status("plugin-outdated"))).toBe(false);
  });
});

describe("shouldPollConnection — live re-check (PAM-35 AC-8)", () => {
  const base = { live: true, engineState: "running" as const, target: "reachable" as const };
  it("polls while live, running and not yet reached", () => {
    expect(shouldPollConnection({ ...base, connection: status("unreachable") })).toBe(true);
  });
  it("stops once the target is reached, when not live, or when the bridge is not running", () => {
    expect(shouldPollConnection({ ...base, connection: status("plugin-missing") })).toBe(false);
    expect(shouldPollConnection({ ...base, live: false, connection: status("unreachable") })).toBe(false);
    expect(shouldPollConnection({ ...base, engineState: "stopped", connection: undefined })).toBe(false);
  });
});

describe("controller step (PAM-35 AC-2)", () => {
  const mapping = { id: "x", input: "X-Touch", output: "X-Touch" };
  it("knows whether the picked input port is present", () => {
    expect(inputPortConnected(mapping, ["X-Touch"])).toBe(true);
    expect(inputPortConnected(mapping, ["X-Touch 1"])).toBe(false);
    expect(inputPortConnected({ ...mapping, input: "" }, [""])).toBe(false);
  });
  it("Next needs at least one controller, each with an input port picked", () => {
    expect(controllersReady([mapping])).toBe(true);
    expect(controllersReady([])).toBe(false);
    expect(controllersReady([mapping, { ...mapping, id: "y", input: "" }])).toBe(false);
  });
});

describe("checkReadout (PAM-35 AC-6/AC-7, EC-1)", () => {
  it("'console answers, plugin not yet' is success for the OSC step but a warning for the plugin step", () => {
    const osc = checkReadout({
      target: "reachable",
      engineState: "running",
      connection: status("plugin-missing"),
      activeMappingCount: 1,
    });
    expect(osc).toMatchObject({ led: "ok", reached: true });
    const plugin = checkReadout({
      target: "connected",
      engineState: "running",
      connection: status("plugin-missing"),
      activeMappingCount: 1,
    });
    expect(plugin).toMatchObject({ led: "warn", reached: false });
  });

  it("explains that nothing can be checked without a controller (EC-1)", () => {
    const readout = checkReadout({
      target: "reachable",
      engineState: "stopped",
      connection: undefined,
      activeMappingCount: 0,
    });
    expect(readout.reached).toBe(false);
    expect(readout.text).toMatch(/No controller selected/);
  });

  it("shows checking while the bridge starts", () => {
    expect(
      checkReadout({ target: "connected", engineState: "starting", connection: undefined, activeMappingCount: 1 }).led
    ).toBe("checking");
  });
});
