import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deviceDefinitionSchema, loadFormat, mappingSchema } from "../format/index.js";
import type { DeviceDefinition, Mapping } from "../format/index.js";
import { convertV1, makeUniqueId } from "./converter.js";
import type { ImportSummary } from "./converter.js";
import { readV1Mapping } from "./v1-reader.js";
import type { V1File } from "./v1-reader.js";

/**
 * PAM-5 AC-3/AC-4: the converter is proven against every real v1 mapping in
 * the repo (fixtures) plus a golden comparison with PAM-1's hand conversion.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const legacyDir = join(repoRoot, "mappings");
const devicesDir = join(repoRoot, "resources", "devices");

/**
 * Every legacy v1 file and the board it was written for. `expectedWarnings`
 * are the two spots where the v1 files themselves are broken — PAM-1's hand
 * conversion fixed them manually (documented in the bundled files' notes);
 * the importer honestly warns instead of guessing.
 */
const LEGACY_FIXTURES: Array<{
  file: string;
  deviceId: string;
  expectedWarnings?: Array<{ kind: string; contains: string }>;
}> = [
  { file: "xTouch1.json", deviceId: "x-touch" },
  { file: "xTouch2.json", deviceId: "x-touch" },
  { file: "xTouchCompact1.json", deviceId: "x-touch-compact" },
  { file: "xTouchCompactRltv1.json", deviceId: "x-touch-compact" },
  {
    file: "akiApcMini1.json",
    deviceId: "apc-mini",
    // v1 addressed note 72, which does not exist on the hardware (the 9th
    // master button is the LED-less shift button, note 98).
    expectedWarnings: [{ kind: "unmatched-control", contains: "note 72" }],
  },
  { file: "akiApcMini2.json", deviceId: "apc-mini" },
  {
    file: "akaiApcMini2-Controller.json",
    deviceId: "apc-mini-mk2",
    // v1's shift button carried an empty quicKey ("") — degenerate config.
    expectedWarnings: [{ kind: "invalid-value", contains: "note 122" }],
  },
  { file: "LaunchPad-Playback.json", deviceId: "launchpad" },
  { file: "LaunchPad-TriFlats.json", deviceId: "launchpad" },
  { file: "mpx16-1.json", deviceId: "mpx16" },
];

async function loadDevice(deviceId: string): Promise<DeviceDefinition> {
  const raw = JSON.parse(await readFile(join(devicesDir, `${deviceId}.json`), "utf8")) as unknown;
  return deviceDefinitionSchema.parse(raw);
}

async function convertLegacy(file: string, deviceId: string): Promise<{ mapping: Mapping; summary: ImportSummary }> {
  const raw = JSON.parse(await readFile(join(legacyDir, file), "utf8")) as unknown;
  const read = readV1Mapping(raw);
  if (!read.ok) throw new Error(`fixture ${file} did not read: ${read.error}`);
  const device = await loadDevice(deviceId);
  return convertV1({
    v1: read.v1,
    device,
    id: "imported-test",
    name: "Imported Test",
    sourceFileName: file,
    date: "2026-07-17",
  });
}

const TEST_DEVICE = deviceDefinitionSchema.parse({
  formatVersion: 1,
  id: "test-board",
  name: "Test Board",
  layout: { width: 10, height: 10 },
  controls: [
    {
      id: "fader-1",
      type: "fader",
      midi: { kind: "cc", number: 7 },
      position: { x: 0, y: 0, width: 1, height: 4 },
      capabilities: { motorized: true },
    },
    {
      id: "fader-plain",
      type: "fader",
      midi: { kind: "cc", number: 8 },
      position: { x: 1, y: 0, width: 1, height: 4 },
    },
    {
      id: "fader-pitch",
      type: "fader",
      midi: { kind: "pitchbend", channel: 2 },
      position: { x: 2, y: 0, width: 1, height: 4 },
      capabilities: { motorized: true },
    },
    {
      id: "btn-led",
      type: "button",
      midi: { kind: "note", number: 10 },
      position: { x: 0, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-dark",
      type: "button",
      midi: { kind: "note", number: 11 },
      position: { x: 1, y: 5, width: 1, height: 1 },
      capabilities: { led: "none" },
    },
    {
      id: "enc-ring",
      type: "encoder",
      midi: { kind: "cc", number: 20 },
      position: { x: 0, y: 7, width: 1, height: 1 },
      capabilities: {
        encoding: { increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 } },
        ledRing: { controller: 52, from: 32, to: 43 },
      },
    },
    {
      id: "enc-bare",
      type: "encoder",
      midi: { kind: "cc", number: 21 },
      position: { x: 1, y: 7, width: 1, height: 1 },
      capabilities: { encoding: { increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 } } },
    },
    {
      id: "strip-1",
      type: "display",
      index: 0,
      position: { x: 0, y: 9, width: 2, height: 1 },
      capabilities: { segments: 7 },
    },
  ],
});

function convertRaw(raw: unknown, device: DeviceDefinition = TEST_DEVICE) {
  const read = readV1Mapping(raw);
  if (!read.ok) throw new Error(`unexpected read failure: ${read.error}`);
  return convertV1({ v1: read.v1, device, id: "t", name: "T", sourceFileName: "t.json", date: "2026-07-17" });
}

describe("readV1Mapping (AC-6)", () => {
  it("rejects non-objects and arrays", () => {
    for (const raw of [null, 42, "x", [1]]) {
      const result = readV1Mapping(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("not a JSON object");
    }
  });

  it("rejects v2 files by their formatVersion", () => {
    const result = readV1Mapping({ formatVersion: 1, note: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("already a pam-osc v2 file");
  });

  it("rejects objects without any v1 section", () => {
    const result = readV1Mapping({ mode: "mc", something: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no v1 mapping sections");
  });

  it("rejects a section that is not an object", () => {
    const result = readV1Mapping({ note: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"note" is not an object');
  });

  it("counts entries per section and collects unknown top-level keys", () => {
    const result = readV1Mapping({ note: { 1: { exec: 201 }, 2: { exec: 202 } }, display: { 0: 201 }, typo: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counts).toEqual({ control: 0, pitch: 0, note: 2, rltvControl: 0, display: 1 });
      expect(result.v1.unknownKeys).toEqual(["typo"]);
    }
  });
});

describe("convertV1 against every real v1 file (AC-3)", () => {
  for (const { file, deviceId, expectedWarnings = [] } of LEGACY_FIXTURES) {
    it(`${file} → ${deviceId}: converts fully, loadable by the real loader (AC-2)`, async () => {
      const { mapping, summary } = await convertLegacy(file, deviceId);

      // Full coverage: every entry converted, no warnings beyond the
      // documented defects in the v1 files themselves.
      expect(summary.warnings).toEqual(
        expectedWarnings.map((expected) =>
          expect.objectContaining({ kind: expected.kind, text: expect.stringContaining(expected.contains) })
        )
      );
      const raw = JSON.parse(await readFile(join(legacyDir, file), "utf8")) as Record<string, Record<string, unknown>>;
      const total = ["control", "pitch", "note", "rltvControl", "display"]
        .map((section) => Object.keys(raw[section] ?? {}).length)
        .reduce((a, b) => a + b, 0);
      expect(summary.converted).toBe(total - expectedWarnings.length);

      // The written file must load through the real loader without errors.
      const dir = await mkdtemp(join(tmpdir(), "pam-import-"));
      await writeFile(join(dir, `${mapping.id}.json`), JSON.stringify(mapping, null, 2), "utf8");
      const loaded = await loadFormat([{ origin: "user", devicesDir, mappingsDir: dir }]);
      expect(loaded.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(loaded.mappings.map((loadedMapping) => loadedMapping.id)).toEqual([mapping.id]);
    });
  }

  it("golden: xTouch1.json equals PAM-1's hand conversion (x-touch-default-1)", async () => {
    const { mapping } = await convertLegacy("xTouch1.json", "x-touch");
    const bundledRaw = JSON.parse(
      await readFile(join(repoRoot, "resources", "mappings", "x-touch-default-1.json"), "utf8")
    ) as unknown;
    const bundled = mappingSchema.parse(bundledRaw);
    const converted = mappingSchema.parse(mapping);

    const byControl = (parsed: Mapping) =>
      new Map(parsed.assignments.map((assignment) => [assignment.controlId, assignment]));
    const bundledMap = byControl(bundled);
    const convertedMap = byControl(converted);

    expect([...convertedMap.keys()].sort()).toEqual([...bundledMap.keys()].sort());
    for (const [controlId, assignment] of convertedMap) {
      expect(assignment, `assignment for ${controlId}`).toEqual(bundledMap.get(controlId));
    }
    expect(converted.enableTimecodeSend).toBe(true);
  });
});

describe("convertV1 mechanics", () => {
  it("converts numeric-string executors (control section, v1 reality)", () => {
    const { mapping, summary } = convertRaw({ control: { 7: "201" } });
    expect(summary.warnings).toEqual([]);
    expect(mapping.assignments).toEqual([
      { controlId: "fader-1", action: { type: "executor", number: 201 }, feedback: { type: "fader-position" } },
    ]);
  });

  it("derives feedback from capabilities: plain fader → none, ring encoder → encoder-ring", () => {
    const { mapping } = convertRaw({ control: { 8: 202 }, rltvControl: { 20: { exec: 203 }, 21: { exec: 204 } } });
    const byId = new Map(mapping.assignments.map((assignment) => [assignment.controlId, assignment]));
    expect(byId.get("fader-plain")?.feedback).toEqual({ type: "none" });
    expect(byId.get("enc-ring")?.feedback).toEqual({ type: "encoder-ring" });
    expect(byId.get("enc-bare")?.feedback).toEqual({ type: "none" });
  });

  it("maps pitch entries via the pitchbend channel", () => {
    const { mapping, summary } = convertRaw({ pitch: { 2: 209 } });
    expect(summary.warnings).toEqual([]);
    expect(mapping.assignments[0]).toEqual({
      controlId: "fader-pitch",
      action: { type: "executor", number: 209 },
      feedback: { type: "fader-position" },
    });
  });

  it("translates the known mapper pattern to on-off values, never executing it (AC-4)", () => {
    const mapper = "function(value) { if (value == 'On') { return 5;} if (value == 'Off'){ return 0;} return 0; }";
    const { mapping, summary } = convertRaw({ buttonFeedbackMapper: mapper, note: { 10: { exec: 201 } } });
    expect(summary.warnings).toEqual([]);
    expect(mapping.assignments[0]?.feedback).toEqual({ type: "on-off", onValue: 5, offValue: 0 });
  });

  it("per-entry mapper wins over the file-level one", () => {
    const fileMapper =
      "function(value) { if (value == 'On') { return 127;} if (value == 'Off'){ return 0;} return 0; }";
    const entryMapper = 'function(value) { if (value == "On") { return 3;} if (value == "Off"){ return 1;} return 0; }';
    const { mapping } = convertRaw({
      buttonFeedbackMapper: fileMapper,
      note: { 10: { exec: 201, buttonFeedbackMapper: entryMapper } },
    });
    expect(mapping.assignments[0]?.feedback).toEqual({ type: "on-off", onValue: 3, offValue: 1 });
  });

  it("falls back to on-off 127/0 with a warning for an unrecognized mapper (AC-4)", () => {
    const { mapping, summary } = convertRaw({
      buttonFeedbackMapper: "function(value) { return value * 2; }",
      note: { 10: { exec: 201 } },
    });
    expect(mapping.assignments[0]?.feedback).toEqual({ type: "on-off", onValue: 127, offValue: 0 });
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: "unrecognized-feedback", text: expect.stringContaining("NOT executed") }),
    ]);
  });

  it("rejects an over-long mapper without running the regex — ReDoS guard, fast (BUG-1)", () => {
    // A megabyte-scale adversarial string that would trigger quadratic
    // backtracking must fall back near-instantly, never feeding the regex.
    const evil = "function(value){if(value=='On'){return 1" + " ".repeat(1_000_000) + "X";
    const start = performance.now();
    const { mapping, summary } = convertRaw({ buttonFeedbackMapper: evil, note: { 10: { exec: 201 } } });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // pre-fix: seconds to minutes
    expect(mapping.assignments[0]?.feedback).toEqual({ type: "on-off", onValue: 127, offValue: 0 });
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: "unrecognized-feedback", text: expect.stringContaining("too long") }),
    ]);
  });

  it("still matches a valid mapper padded with legitimate whitespace", () => {
    const padded = "function ( value ) {  if ( value == 'On' ) { return 5 ; }  if ( value == 'Off' ) { return 0 ; } return 0 ; }";
    const { mapping, summary } = convertRaw({ buttonFeedbackMapper: padded, note: { 10: { exec: 201 } } });
    expect(summary.warnings).toEqual([]);
    expect(mapping.assignments[0]?.feedback).toEqual({ type: "on-off", onValue: 5, offValue: 0 });
  });

  it("buttons without a mapper default to on-off 127/0; LED-less buttons get none", () => {
    const { mapping } = convertRaw({ note: { 10: { exec: 201 }, 11: { exec: 202 } } });
    const byId = new Map(mapping.assignments.map((assignment) => [assignment.controlId, assignment]));
    expect(byId.get("btn-led")?.feedback).toEqual({ type: "on-off", onValue: 127, offValue: 0 });
    expect(byId.get("btn-dark")?.feedback).toEqual({ type: "none" });
  });

  it("converts permanentFeedback to always-on; drops it with a warning on LED-less controls", () => {
    const { mapping, summary } = convertRaw({
      note: { 10: { exec: 201, permanentFeedback: 21 }, 11: { exec: 202, permanentFeedback: 21 } },
    });
    const byId = new Map(mapping.assignments.map((assignment) => [assignment.controlId, assignment]));
    expect(byId.get("btn-led")?.feedback).toEqual({ type: "always-on", value: 21 });
    expect(byId.get("btn-dark")?.feedback).toEqual({ type: "none" });
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: "invalid-value", text: expect.stringContaining("no LED") }),
    ]);
  });

  it("converts every action kind (AC-3)", () => {
    const { mapping, summary } = convertRaw(
      {
        note: {
          10: { cmd: "Go+", minValue: 100 },
          11: { quicKey: "Please" },
          60: { local: "encoderFine" },
          61: { local: "attribute", attribute: "dimmer" },
          62: { attribute: "pan" },
          63: { timecodeSelect: true },
          64: { timecodeSelect: 3 },
          65: { timecodePlayPause: true },
        },
        rltvControl: { 20: { exec: 401, amount: 0.5 } },
      },
      deviceDefinitionSchema.parse({
        ...JSON.parse(JSON.stringify(TEST_DEVICE)),
        controls: [
          ...TEST_DEVICE.controls,
          ...[60, 61, 62, 63, 64, 65].map((note) => ({
            id: `btn-${note}`,
            type: "button",
            midi: { kind: "note", number: note },
            position: { x: 5, y: 5, width: 1, height: 1 },
            capabilities: { led: "none" },
          })),
        ],
      })
    );
    expect(summary.warnings).toEqual([]);
    const actions = new Map(mapping.assignments.map((assignment) => [assignment.controlId, assignment]));
    expect(actions.get("btn-led")?.action).toEqual({ type: "command", command: "Go+" });
    expect(actions.get("btn-led")?.options).toEqual({ minValue: 100 });
    expect(actions.get("btn-dark")?.action).toEqual({ type: "quickKey", key: "Please" });
    expect(actions.get("btn-60")?.action).toEqual({ type: "modifier", modifier: "encoderFine" });
    expect(actions.get("btn-61")?.action).toEqual({
      type: "modifier",
      modifier: "attributeSelect",
      attribute: "dimmer",
    });
    expect(actions.get("btn-62")?.action).toEqual({ type: "attribute", attribute: "pan" });
    expect(actions.get("btn-63")?.action).toEqual({ type: "timecodeSelect" });
    expect(actions.get("btn-64")?.action).toEqual({ type: "timecodeSelect", slot: 3 });
    expect(actions.get("btn-65")?.action).toEqual({ type: "timecodePlayPause" });
    expect(actions.get("enc-ring")?.action).toEqual({ type: "executor", number: 401 });
    expect(actions.get("enc-ring")?.options).toEqual({ amount: 0.5 });
  });

  it("warns and skips: unmatched controls, bad values, conflicting actions (AC-5)", () => {
    const { mapping, summary } = convertRaw({
      control: { 99: 201, 7: 0 },
      note: {
        10: { exec: 201, cmd: "Go+" },
        11: {},
        200: { exec: 202 },
      },
      display: { 5: 201 },
    });
    expect(mapping.assignments).toEqual([]);
    const kinds = summary.warnings.map((warning) => warning.kind).sort();
    expect(kinds).toEqual([
      "invalid-value", // control 7: exec 0 out of range
      "invalid-value", // note 10: conflicting actions
      "invalid-value", // note 11: no action
      "invalid-value", // note 200: not a note number
      "unmatched-control", // control 99
      "unmatched-control", // display 5
    ]);
    // Zero silent drops: every v1 entry is either converted or warned about.
    expect(summary.converted + summary.warnings.length).toBe(6);
  });

  it("first section wins when two entries target the same control (duplicate-target)", () => {
    const { mapping, summary } = convertRaw({ control: { 20: 201 }, rltvControl: { 20: { exec: 301 } } });
    expect(mapping.assignments).toHaveLength(1);
    expect(mapping.assignments[0]?.action).toEqual({ type: "executor", number: 201 });
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: "duplicate-target", text: expect.stringContaining("control 20") }),
    ]);
  });

  it("reports unknown keys instead of dropping them silently", () => {
    const { summary } = convertRaw({ typo: 1, note: { 10: { exec: 201, wat: true } } });
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: "unknown-key", text: expect.stringContaining('"typo"') }),
      expect.objectContaining({ kind: "unknown-key", text: expect.stringContaining('"wat"') }),
    ]);
  });

  it("writes source, date, and warnings into notes; ports follow the feedback capability", () => {
    const { mapping } = convertRaw({ typo: 1, note: { 10: { exec: 201 } } });
    expect(mapping.notes).toContain('Imported from v1 file "t.json" on 2026-07-17.');
    expect(mapping.notes).toContain("Import warnings:");
    expect(mapping.notes).toContain('unknown key "typo"');
    expect(mapping.midiPort).toEqual({ input: "Test Board", output: "Test Board" });
  });

  it("omits the output port for boards without any feedback capability", () => {
    const inputOnly = deviceDefinitionSchema.parse({
      formatVersion: 1,
      id: "pads",
      name: "Pads",
      layout: { width: 4, height: 4 },
      controls: [
        {
          id: "pad-1",
          type: "button",
          midi: { kind: "note", number: 1 },
          position: { x: 0, y: 0, width: 1, height: 1 },
          capabilities: { led: "none" },
        },
      ],
    });
    const { mapping } = convertRaw({ note: { 1: { exec: 201 } } }, inputOnly);
    expect(mapping.midiPort).toEqual({ input: "Pads" });
  });

  it("treats a non-boolean enableTimecodeSend as false with a warning", () => {
    const { mapping, summary } = convertRaw({ enableTimecodeSend: "yes", note: { 10: { exec: 201 } } });
    expect(mapping.enableTimecodeSend).toBe(false);
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: "invalid-value", text: expect.stringContaining("enableTimecodeSend") }),
    ]);
  });

  it("a wrong board still imports: zero assignments, one warning per entry", () => {
    const { mapping, summary } = convertRaw({ note: { 100: { exec: 201 }, 101: { exec: 202 } } });
    expect(mapping.assignments).toEqual([]);
    expect(summary.warnings).toHaveLength(2);
    expect(summary.warnings.every((warning) => warning.kind === "unmatched-control")).toBe(true);
    expect(mappingSchema.safeParse(mapping).success).toBe(true);
  });
});

describe("makeUniqueId", () => {
  it("kebab-cases the name and avoids taken ids with numeric suffixes", () => {
    expect(makeUniqueId("My XTouch (Front)", new Set())).toBe("my-xtouch-front");
    expect(makeUniqueId("My XTouch", new Set(["my-xtouch"]))).toBe("my-xtouch-2");
    expect(makeUniqueId("My XTouch", new Set(["my-xtouch", "my-xtouch-2"]))).toBe("my-xtouch-3");
  });

  it("falls back to a stable id for names without usable characters", () => {
    expect(makeUniqueId("!!!", new Set())).toBe("imported-v1-mapping");
  });
});

// Type-only usage so the fixture import of V1File stays honest.
const _typecheck: V1File | undefined = undefined;
void _typecheck;
