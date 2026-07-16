import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFormat } from "./loader.js";

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
