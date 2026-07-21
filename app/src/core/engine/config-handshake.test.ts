import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mappingSchema, type Mapping } from "../format/mapping.js";
import type { OscMessage } from "../../transports/osc.js";
import {
  buildPamConfig,
  ConfigSender,
  pamConfigMessage,
  serializePamConfig,
  PAM_CONFIG_VERSION,
  MAX_WATCH_SET,
} from "./config-handshake.js";

/** Build a real, defaulted Mapping via the schema (so defaults match production). */
function makeMapping(overrides: Partial<Record<string, unknown>>): Mapping {
  return mappingSchema.parse({
    formatVersion: 1,
    id: "m",
    name: "M",
    deviceDefinitionId: "board",
    midiPort: { input: "port" },
    assignments: [],
    ...overrides,
  });
}

const exec = (number: number) => ({ controlId: `c${number}`, action: { type: "executor", number } });
const disp = (number: number) => ({ controlId: `d${number}`, action: { type: "display", number } });

describe("buildPamConfig (ConfigBuilder)", () => {
  it("defaults a single mapping to colors/names on, resend/timecode off", () => {
    const config = buildPamConfig([makeMapping({})]);
    expect(config).toMatchObject({
      sendColors: true,
      sendNames: true,
      resendButtons: false,
      sendTimecode: false,
      fixedPage: 0,
      executors: [],
    });
  });

  it("unions the watch-set across mappings, dedupes, sorts, and keeps X-key/high numbers (AC-1, EC-1, EC-3)", () => {
    const a = makeMapping({
      id: "a",
      assignments: [exec(201), exec(101), disp(202)],
    });
    const b = makeMapping({
      id: "b",
      // 201 duplicated across units; 900 is an X-key / high executor.
      assignments: [exec(201), exec(900), disp(102)],
    });
    expect(buildPamConfig([a, b]).executors).toEqual([101, 102, 201, 202, 900]);
  });

  it("only executor and display actions contribute to the watch-set", () => {
    const m = makeMapping({
      assignments: [
        exec(301),
        { controlId: "cmd", action: { type: "command", command: "Go+" } },
        { controlId: "qk", action: { type: "quickKey", key: "CLEAR" } },
      ],
    });
    expect(buildPamConfig([m]).executors).toEqual([301]);
  });

  it("OR-merges the feature flags across two active mappings (AC-2, EC-3)", () => {
    const a = makeMapping({
      id: "a",
      sendColors: false,
      sendNames: false,
      resendButtons: false,
      enableTimecodeSend: false,
    });
    const b = makeMapping({
      id: "b",
      sendColors: true,
      sendNames: false,
      resendButtons: true,
      enableTimecodeSend: true,
    });
    expect(buildPamConfig([a, b])).toMatchObject({
      sendColors: true, // true OR false
      sendNames: false, // false OR false
      resendButtons: true, // false OR true
      sendTimecode: true, // false OR true (enableTimecodeSend)
    });
  });

  it("carries the global fixedPage through; treats absent / <1 as 0 (follow current page)", () => {
    expect(buildPamConfig([makeMapping({})], 7).fixedPage).toBe(7);
    expect(buildPamConfig([makeMapping({})], undefined).fixedPage).toBe(0);
    expect(buildPamConfig([makeMapping({})], 0).fixedPage).toBe(0);
  });
});

describe("serializePamConfig", () => {
  it("emits the documented compact, quote-free, ordered payload", () => {
    const payload = serializePamConfig({
      executors: [101, 102, 201, 900],
      sendColors: true,
      sendNames: true,
      resendButtons: false,
      sendTimecode: false,
      fixedPage: 0,
    });
    expect(payload).toBe(`v=${PAM_CONFIG_VERSION};e=101,102,201,900;c=1;n=1;r=0;t=0;p=0`);
    // Safe to embed in the Lua double-quoted string literal — no quotes.
    expect(payload).not.toMatch(/["']/);
  });

  it("emits an empty executor field when nothing is mapped", () => {
    const payload = serializePamConfig(buildPamConfig([makeMapping({})]));
    expect(payload).toContain(";e=;");
  });

  it("pamConfigMessage wraps the payload in a SetVar(GlobalVars, pamConfig, …) /cmd", () => {
    const message = pamConfigMessage("v=1;e=201;c=1;n=1;r=0;t=0;p=0");
    expect(message.address).toBe("/cmd");
    expect(message.args[0]).toEqual({
      type: "string",
      value: `Lua 'SetVar(GlobalVars(), "pamConfig", "v=1;e=201;c=1;n=1;r=0;t=0;p=0")'`,
    });
  });
});

describe("ConfigSender change-detection (AC-7)", () => {
  let sent: OscMessage[];
  let logs: string[];
  let payload: string;
  let sender: ConfigSender;

  beforeEach(() => {
    sent = [];
    logs = [];
    payload = "v=1;e=201;c=1;n=1;r=0;t=0;p=0";
    sender = new ConfigSender({
      sendOsc: (message) => sent.push(message),
      buildPayload: () => payload,
      heartbeatMs: 30000,
      log: (line) => logs.push(line),
    });
  });

  afterEach(() => sender.stopHeartbeat());

  const configPayloads = () =>
    sent
      .map((message) => (message.args[0]?.type === "string" ? message.args[0].value : ""))
      .filter((value) => value.includes("pamConfig"));

  it("sends pamConfig + forceReload on the first sync", () => {
    expect(sender.syncNow("connect")).toBe(true);
    const commands = sent.map((message) => (message.args[0]?.type === "string" ? message.args[0].value : ""));
    expect(commands.some((c) => c.includes("pamConfig"))).toBe(true);
    expect(commands.some((c) => c.includes("forceReload"))).toBe(true);
    expect(logs).toHaveLength(1);
  });

  it("does NOT re-send (or re-log) when the payload is unchanged", () => {
    sender.syncNow("connect");
    const after = sent.length;
    expect(sender.syncNow("change")).toBe(false);
    expect(sent.length).toBe(after); // no new wire messages
    expect(logs).toHaveLength(1); // no new log line
  });

  it("re-sends once the payload actually changes (EC-2)", () => {
    sender.syncNow("connect");
    expect(configPayloads()).toHaveLength(1);
    payload = "v=1;e=201,301;c=1;n=1;r=0;t=0;p=2";
    expect(sender.syncNow("change")).toBe(true);
    expect(configPayloads()).toHaveLength(2);
    expect(logs).toHaveLength(2);
  });

  it("heartbeat re-sends for self-heal but never logs an unchanged re-send (guards PAM-12 BUG-4)", () => {
    vi.useFakeTimers();
    try {
      const beat = new ConfigSender({
        sendOsc: (message) => sent.push(message),
        buildPayload: () => payload,
        heartbeatMs: 1000,
        log: (line) => logs.push(line),
      });
      beat.syncNow("connect"); // 1 config payload, 1 log
      expect(configPayloads()).toHaveLength(1);
      expect(logs).toHaveLength(1);

      beat.startHeartbeat();
      vi.advanceTimersByTime(3000); // three heartbeat ticks, payload unchanged
      expect(configPayloads()).toHaveLength(4); // re-sent each tick (self-heal)
      expect(logs).toHaveLength(1); // but no extra log lines (no flood)
      beat.stopHeartbeat();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("watch-set cap (PAM-16 F2)", () => {
  it(`caps the watch-set at MAX_WATCH_SET (${MAX_WATCH_SET}) keeping the lowest executors`, () => {
    const assignments = Array.from({ length: MAX_WATCH_SET + 50 }, (_, i) => exec(i + 1)); // 1 … cap+50
    const config = buildPamConfig([makeMapping({ assignments })]);
    expect(config.executors).toHaveLength(MAX_WATCH_SET);
    expect(config.executors[0]).toBe(1);
    expect(config.executors.at(-1)).toBe(MAX_WATCH_SET); // sorted, lowest kept
  });

  it("leaves a normal-sized watch-set untouched", () => {
    const assignments = Array.from({ length: 20 }, (_, i) => exec(i + 1));
    const config = buildPamConfig([makeMapping({ assignments })]);
    expect(config.executors).toHaveLength(20);
  });

  it("keeps the serialized payload comfortably bounded at the cap", () => {
    const assignments = Array.from({ length: MAX_WATCH_SET + 50 }, (_, i) => exec(i + 1));
    const payload = serializePamConfig(buildPamConfig([makeMapping({ assignments })]));
    expect(payload.length).toBeLessThan(1500); // stays within a typical UDP datagram
  });
});
