import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFormat } from "./loader.js";
import { isKnownQuickKey } from "./quickkeys.js";

/**
 * Validates the bundled content in resources/ (AC-1, AC-3): every shipped
 * device definition and default mapping must load without a single error.
 * Tolerant of a partially filled resources/ during the build; the full
 * inventory assertions live in the "complete inventory" test below.
 */

const resourcesDir = fileURLToPath(new URL("../../../../resources/", import.meta.url));

async function loadBundled() {
  return loadFormat([
    {
      origin: "bundled",
      devicesDir: `${resourcesDir}devices`,
      mappingsDir: `${resourcesDir}mappings`,
    },
  ]);
}

describe("bundled resources", () => {
  it("load without any error or notice", async () => {
    const result = await loadBundled();
    expect(result.issues).toEqual([]);
  });

  it("ship the complete inventory: the five v1 board types + APC40 mkII + X-Touch Extender, and their default mappings (AC-1, AC-3)", async () => {
    const result = await loadBundled();
    expect(result.devices.map((device) => device.id).sort()).toEqual([
      "apc-40-mk2",
      "apc-mini",
      "apc-mini-mk2",
      "launchpad",
      "mpx16",
      "x-touch",
      "x-touch-compact",
      "x-touch-extender",
    ]);
    expect(result.mappings.map((mapping) => mapping.id).sort()).toEqual([
      "apc-40-mk2-default-1",
      "apc-mini-default-1",
      "apc-mini-default-2",
      "apc-mini-mk2-controller",
      "launchpad-playback",
      "launchpad-triflats",
      "mpx16-default-1",
      "x-touch-compact-default-1",
      "x-touch-compact-relative-1",
      "x-touch-default-1",
      "x-touch-default-2",
      "x-touch-extender-default-1",
      "x-touch-extension-1",
    ]);
  });

  it("uses every action facility of the v1 feature set somewhere (AC-3)", async () => {
    const result = await loadBundled();
    const actionTypes = new Set(
      result.mappings.flatMap((mapping) => mapping.assignments.map((assignment) => assignment.action.type))
    );
    for (const required of [
      "executor",
      "command",
      "quickKey",
      "attribute",
      "modifier",
      "timecodeSelect",
      "timecodePlayPause",
      "display",
    ]) {
      expect(actionTypes, `no bundled mapping uses action "${required}"`).toContain(required);
    }
    const feedbackTypes = new Set(
      result.mappings.flatMap((mapping) => mapping.assignments.map((assignment) => assignment.feedback.type))
    );
    for (const required of ["on-off", "always-on", "fader-position", "encoder-ring"]) {
      expect(feedbackTypes, `no bundled mapping uses feedback "${required}"`).toContain(required);
    }
  });

  it("no control is fully covered by a later-rendered sibling — every control stays clickable (PAM-6 AC-10)", async () => {
    const result = await loadBundled();
    for (const device of result.devices) {
      const controls = device.controls;
      for (let i = 0; i < controls.length; i += 1) {
        const lower = controls[i]!;
        const a = lower.position;
        for (let j = i + 1; j < controls.length; j += 1) {
          const upper = controls[j]!;
          const b = upper.position;
          const covered =
            b.x <= a.x && b.y <= a.y && b.x + b.width >= a.x + a.width && b.y + b.height >= a.y + a.height;
          expect(covered, `${device.id}: "${lower.id}" is fully covered by later sibling "${upper.id}"`).toBe(false);
        }
      }
    }
  });

  it("ships every hardware-verified bundled mapping as status 'tested' (PAM-19 AC-4)", async () => {
    const result = await loadBundled();
    expect(result.mappings.length).toBeGreaterThan(0);
    // Newly contributed boards that have not yet been verified on real
    // hardware ship as 'community' (honest self-declaration) until confirmed.
    const notYetHardwareVerified = new Set([
      "apc-40-mk2-default-1",
      "x-touch-extender-default-1",
      "x-touch-extension-1",
    ]);
    for (const mapping of result.mappings) {
      const expected = notYetHardwareVerified.has(mapping.id) ? "community" : "tested";
      expect(mapping.status, `${mapping.id} should ship as ${expected}`).toBe(expected);
    }
  });

  it("every bundled quickKey uses a canonical code (no dead mixed-case/legacy keys) (PAM-18)", async () => {
    const result = await loadBundled();
    for (const mapping of result.mappings) {
      for (const assignment of mapping.assignments) {
        if (assignment.action.type === "quickKey") {
          expect(
            isKnownQuickKey(assignment.action.key),
            `${mapping.id}: quickKey "${assignment.action.key}" is not a canonical code — the plugin pool has no matching object`,
          ).toBe(true);
        }
      }
    }
  });

  it("every bundled mapping has an output port when it uses feedback", async () => {
    const result = await loadBundled();
    for (const mapping of result.mappings) {
      const usesFeedback = mapping.assignments.some((assignment) => assignment.feedback.type !== "none");
      if (usesFeedback) {
        expect(mapping.midiPort.output, `${mapping.id} uses feedback but has no output port`).toBeTruthy();
      }
    }
  });
});
