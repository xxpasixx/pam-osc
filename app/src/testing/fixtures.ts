import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FormatSource } from "../core/format/index.js";
import type { EngineConfig, EngineTiming } from "../core/engine/types.js";

/**
 * A small mc-mode test board + mapping exercising every action and feedback
 * type — written to a temp folder so the engine runs the real PAM-1 loader.
 */

export const TEST_PORT = "Test Unit";

const testDevice = {
  formatVersion: 1,
  id: "test-board",
  name: "Test Board",
  mode: "mc",
  defaultMidiChannel: 1,
  layout: { width: 10, height: 10 },
  controls: [
    {
      id: "fader-cc",
      type: "fader",
      midi: { kind: "cc", number: 7 },
      position: { x: 0, y: 0, width: 1, height: 4 },
      capabilities: { motorized: true },
    },
    {
      id: "fader-p",
      type: "fader",
      midi: { kind: "pitchbend", channel: 9 },
      position: { x: 1, y: 0, width: 1, height: 4 },
      capabilities: { motorized: true },
    },
    {
      id: "enc",
      type: "encoder",
      midi: { kind: "cc", number: 16 },
      position: { x: 2, y: 0, width: 1, height: 1 },
      capabilities: {
        encoding: { increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 } },
        ledRing: { controller: 48, from: 32, to: 43 },
      },
    },
    {
      id: "enc-knob",
      type: "encoder",
      midi: { kind: "cc", number: 17 },
      position: { x: 3, y: 0, width: 1, height: 1 },
      capabilities: { encoding: { increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 } } },
    },
    {
      id: "enc-attr",
      type: "encoder",
      midi: { kind: "cc", number: 18 },
      position: { x: 4, y: 0, width: 1, height: 1 },
      capabilities: { encoding: { increment: { from: 1, to: 8 }, decrement: { from: 65, to: 72 } } },
    },
    {
      id: "btn-exec",
      type: "button",
      midi: { kind: "note", number: 10 },
      position: { x: 0, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-pad",
      type: "button",
      midi: { kind: "note", number: 12 },
      position: { x: 1, y: 5, width: 1, height: 1 },
      capabilities: { led: "none" },
    },
    {
      id: "btn-cmd",
      type: "button",
      midi: { kind: "note", number: 20 },
      position: { x: 2, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-qk",
      type: "button",
      midi: { kind: "note", number: 21 },
      position: { x: 3, y: 5, width: 1, height: 1 },
      capabilities: { led: "none" },
    },
    {
      id: "btn-fine",
      type: "button",
      midi: { kind: "note", number: 22 },
      position: { x: 4, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-rough",
      type: "button",
      midi: { kind: "note", number: 23 },
      position: { x: 5, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-attr-dim",
      type: "button",
      midi: { kind: "note", number: 24 },
      position: { x: 6, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-attr-pan",
      type: "button",
      midi: { kind: "note", number: 25 },
      position: { x: 7, y: 5, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "btn-tc-sel",
      type: "button",
      midi: { kind: "note", number: 26 },
      position: { x: 0, y: 6, width: 1, height: 1 },
      capabilities: { led: "none" },
    },
    {
      id: "btn-tc-pp",
      type: "button",
      midi: { kind: "note", number: 27 },
      position: { x: 1, y: 6, width: 1, height: 1 },
      capabilities: { led: "none" },
    },
    {
      id: "btn-always",
      type: "button",
      midi: { kind: "note", number: 28 },
      position: { x: 2, y: 6, width: 1, height: 1 },
      capabilities: { led: "on-off" },
    },
    {
      id: "display-1",
      type: "display",
      index: 0,
      position: { x: 0, y: 8, width: 1, height: 1 },
      capabilities: { segments: 7 },
    },
    {
      id: "display-2",
      type: "display",
      index: 1,
      position: { x: 1, y: 8, width: 1, height: 1 },
      capabilities: { segments: 7 },
    },
  ],
};

const testMapping = {
  formatVersion: 1,
  id: "test-map",
  name: "Test Mapping",
  deviceDefinitionId: "test-board",
  midiPort: { input: TEST_PORT, output: TEST_PORT },
  enableTimecodeSend: true,
  assignments: [
    { controlId: "fader-cc", action: { type: "executor", number: 201 }, feedback: { type: "fader-position" } },
    { controlId: "fader-p", action: { type: "executor", number: 202 }, feedback: { type: "fader-position" } },
    { controlId: "enc", action: { type: "executor", number: 203 }, feedback: { type: "encoder-ring" } },
    { controlId: "enc-knob", action: { type: "executor", number: 401 } },
    { controlId: "enc-attr", action: { type: "attribute", attribute: "current" }, options: { amount: 5 } },
    { controlId: "btn-exec", action: { type: "executor", number: 301 }, feedback: { type: "on-off" } },
    { controlId: "btn-pad", action: { type: "executor", number: 302 }, options: { minValue: 30 } },
    { controlId: "btn-cmd", action: { type: "command", command: "HIGHLIGHT" }, feedback: { type: "on-off" } },
    { controlId: "btn-qk", action: { type: "quickKey", key: "CLEAR" } },
    { controlId: "btn-fine", action: { type: "modifier", modifier: "encoderFine" }, feedback: { type: "on-off" } },
    { controlId: "btn-rough", action: { type: "modifier", modifier: "encoderRough" }, feedback: { type: "on-off" } },
    {
      controlId: "btn-attr-dim",
      action: { type: "modifier", modifier: "attributeSelect", attribute: "dimmer" },
      feedback: { type: "on-off" },
    },
    {
      controlId: "btn-attr-pan",
      action: { type: "modifier", modifier: "attributeSelect", attribute: "pan" },
      feedback: { type: "on-off" },
    },
    { controlId: "btn-tc-sel", action: { type: "timecodeSelect" }, options: { minValue: 100 } },
    { controlId: "btn-tc-pp", action: { type: "timecodePlayPause" } },
    {
      controlId: "btn-always",
      action: { type: "command", command: "Go+" },
      feedback: { type: "always-on", value: 64 },
    },
    { controlId: "display-1", action: { type: "display", number: 201 } },
    { controlId: "display-2", action: { type: "display", number: 202 } },
  ],
};

/** Fast timings for tests — same code paths, hundred× shorter waits. */
export const TEST_TIMING: EngineTiming = {
  pingTimeoutMs: 40,
  pingRetryMs: 60,
  pingMaxRetries: 2,
  animationMs: 40,
  animationFrameMs: 10,
  hotplugPollMs: 25,
  holdOffMs: 50,
  cmdAckTimeoutMs: 40,
  configHeartbeatMs: 50,
};

export interface FixtureOptions {
  /** Extra mapping files to write (id → mapping object). */
  extraMappings?: Record<string, unknown>;
  extraDevices?: Record<string, unknown>;
}

export async function writeFixtures(options: FixtureOptions = {}): Promise<FormatSource[]> {
  const dir = await mkdtemp(join(tmpdir(), "pam-engine-test-"));
  const devicesDir = join(dir, "devices");
  const mappingsDir = join(dir, "mappings");
  await mkdir(devicesDir);
  await mkdir(mappingsDir);
  await writeFile(join(devicesDir, "test-board.json"), JSON.stringify(testDevice, null, 2));
  await writeFile(join(mappingsDir, "test-map.json"), JSON.stringify(testMapping, null, 2));
  for (const [name, device] of Object.entries(options.extraDevices ?? {})) {
    await writeFile(join(devicesDir, `${name}.json`), JSON.stringify(device, null, 2));
  }
  for (const [name, mapping] of Object.entries(options.extraMappings ?? {})) {
    await writeFile(join(mappingsDir, `${name}.json`), JSON.stringify(mapping, null, 2));
  }
  return [{ origin: "bundled", devicesDir, mappingsDir }];
}

export function testConfig(sources: FormatSource[], overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    consoleAddress: "127.0.0.1",
    sendPort: 9000,
    receivePort: 9001,
    sources,
    activeMappingIds: ["test-map"],
    timing: TEST_TIMING,
    ...overrides,
  };
}

/** A second mapping for the same board type on another port (AC-11). */
export function secondUnitMapping(port: string): unknown {
  return {
    ...testMapping,
    id: "test-map-2",
    name: "Test Mapping 2",
    midiPort: { input: port, output: port },
    enableTimecodeSend: false,
  };
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
