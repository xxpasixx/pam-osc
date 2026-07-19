import { describe, expect, it } from "vitest";
import type { ActiveMappingDraft } from "../../core/settings/schema.js";
import type { CatalogEntry } from "../../shared/ipc.js";
import { activateCatalogEntry, shouldAutoOpenWizard, shouldAutoStartEngine } from "./wizard-logic.js";

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

describe("shouldAutoStartEngine — auto-start guard on the verify step (AC-8)", () => {
  it("starts when on the verify step, engine stopped, and a mapping is active", () => {
    expect(shouldAutoStartEngine({ onVerifyStep: true, engineState: "stopped", activeMappingCount: 1 })).toBe(true);
  });

  it("does NOT start when not on the verify step", () => {
    expect(shouldAutoStartEngine({ onVerifyStep: false, engineState: "stopped", activeMappingCount: 1 })).toBe(false);
  });

  it("does NOT start when no mapping is active", () => {
    expect(shouldAutoStartEngine({ onVerifyStep: true, engineState: "stopped", activeMappingCount: 0 })).toBe(false);
  });

  it("does NOT start when the engine is already running", () => {
    expect(shouldAutoStartEngine({ onVerifyStep: true, engineState: "running", activeMappingCount: 1 })).toBe(false);
  });

  it("does NOT start while the engine is already starting", () => {
    expect(shouldAutoStartEngine({ onVerifyStep: true, engineState: "starting", activeMappingCount: 1 })).toBe(false);
  });
});
