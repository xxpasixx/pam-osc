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

  it("ship the complete inventory: the five v1 board types + APC40 mkII + X-Touch Extender + Launchpad Mini MK3 + X32 Compact (CC remote) + X-Touch Compact (MC mode), and their default mappings (AC-1, AC-3)", async () => {
    const result = await loadBundled();
    expect(result.devices.map((device) => device.id).sort()).toEqual([
      "apc-40-mk2",
      "apc-mini",
      "apc-mini-mk2",
      "launchpad",
      "launchpad-mini-mk3",
      "mpx16",
      "x-touch",
      "x-touch-compact",
      "x-touch-compact-mc",
      "x-touch-compact-relative",
      "x-touch-extender",
      "x32-compact-cc",
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
      "x-touch-compact-mc-playback-1",
      "x-touch-compact-relative-1",
      "x-touch-default-1",
      "x-touch-default-2",
      "x-touch-extender-default-1",
      "x-touch-extension-1",
      "x32-compact-cc-default-1",
    ]);
  });

  it("ships the X-Touch Compact MC board with its power-on setup instructions (PAM-28 AC-3)", async () => {
    const result = await loadBundled();
    const mc = result.devices.find((device) => device.id === "x-touch-compact-mc");
    expect(mc?.mode).toBe("mc");
    expect(mc?.setupInstructions).toContain("MC LED");
  });

  it("ships the APC40 mkII Ableton-Live-Mode (Mode 1) Introduction SysEx as initSysEx (PAM-24 AC-4)", async () => {
    const result = await loadBundled();
    const apc = result.devices.find((device) => device.id === "apc-40-mk2");
    expect(apc?.initSysEx).toEqual([0xf0, 0x47, 0x7f, 0x29, 0x60, 0x0, 0x4, 0x41, 0x1, 0x1, 0x1, 0xf7]);
  });

  it("configures the APC40 mkII knob LED rings: Volume-style ring type + fader-position feedback (PAM-24 AC-8)", async () => {
    const result = await loadBundled();
    const apc = result.devices.find((device) => device.id === "apc-40-mk2");
    // 16 ring-type CCs (device knobs 0x18-0x1F, track knobs 0x38-0x3F), all Volume style (2).
    const ringTypeControllers = [24, 25, 26, 27, 28, 29, 30, 31, 56, 57, 58, 59, 60, 61, 62, 63];
    expect(apc?.initCC).toEqual(ringTypeControllers.map((controller) => ({ controller, value: 2 })));

    // The 16 knobs echo their value back (lights the ring); non-knob controls unaffected.
    const mapping = result.mappings.find((m) => m.id === "apc-40-mk2-default-1");
    const knobIds = new Set([...Array(8)].flatMap((_, i) => [`track-knob-${i + 1}`, `device-knob-${i + 1}`]));
    const knobFeedback = mapping?.assignments.filter((a) => knobIds.has(a.controlId)).map((a) => a.feedback.type);
    expect(knobFeedback).toHaveLength(16);
    expect(knobFeedback?.every((type) => type === "fader-position")).toBe(true);
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

  it("ships every bundled mapping as 'untested' until hardware-verified as 'tested' (PAM-19 AC-4)", async () => {
    const result = await loadBundled();
    expect(result.mappings.length).toBeGreaterThan(0);
    // All bundled mappings ship as 'untested' (honest self-declaration);
    // a mapping moves here once it has been confirmed on real hardware.
    const hardwareVerified = new Set<string>([
      "x-touch-compact-default-1",
      "x-touch-compact-mc-playback-1", // confirmed on the real unit 2026-08-01
    ]);
    for (const mapping of result.mappings) {
      const expected = hardwareVerified.has(mapping.id) ? "tested" : "untested";
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
            `${mapping.id}: quickKey "${assignment.action.key}" is not a canonical code — the plugin pool has no matching object`
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
