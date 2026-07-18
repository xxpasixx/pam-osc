import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import type { ConnectionStatus, ConsoleState } from "./types.js";
import { FakeMidiTransport, FakeOscTransport } from "../../testing/fake-transports.js";
import { sleep, testConfig, writeFixtures, TEST_PORT, TEST_TIMING } from "../../testing/fixtures.js";
import type { FormatSource } from "../format/index.js";
import { waitFor } from "../../testing/virtual-midi.js";

/**
 * PAM-12 CMD mode, engine side: interception (AC-2), press/release pairing,
 * serialized press queue (AC-11), hard version handshake (AC-7) and the
 * console event surface (AC-9/AC-10). The console side (macro construction)
 * lives in the Lua plugin — covered by the parity test + onPC verification.
 */

let sources: FormatSource[];

beforeAll(async () => {
  sources = await writeFixtures();
});

interface Harness {
  engine: Engine;
  midi: FakeMidiTransport;
  osc: FakeOscTransport;
  connections: ConnectionStatus[];
  consoleStates: ConsoleState[];
}

let active: Harness | undefined;

async function startedEngine(): Promise<Harness> {
  const midi = new FakeMidiTransport();
  midi.ports = { inputs: [TEST_PORT], outputs: [TEST_PORT] };
  const osc = new FakeOscTransport();
  const engine = new Engine(midi, osc);
  const harness: Harness = { engine, midi, osc, connections: [], consoleStates: [] };
  engine.on("connection", (status) => harness.connections.push(status));
  engine.on("console", (state) => harness.consoleStates.push(state));
  await engine.start(testConfig(sources));
  await waitFor(() =>
    osc
      .socket()
      .commands()
      .some((command) => command.includes("forceReload"))
  );
  osc.socket().sent.length = 0;
  active = harness;
  return harness;
}

afterEach(async () => {
  await active?.engine.stop();
  active = undefined;
});

/** Puts the engine into active CMD mode: current-protocol pong + nonzero flags. */
function activateCmdMode(harness: Harness, flags = 4): void {
  harness.osc.socket().inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 2 }] });
  harness.osc.socket().inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: flags }] });
}

function cmdKeyMessages(harness: Harness): string[] {
  return harness.osc
    .socket()
    .commands()
    .filter((command) => command.includes("pamCmdKey"));
}

function keyMessages(harness: Harness): string[] {
  return harness.osc
    .socket()
    .sent.map((message) => message.address)
    .filter((address) => address.includes("/Key"));
}

describe("CMD-mode interception (AC-2)", () => {
  it("replaces the executor Key press with one pamCmdKey SetVar and swallows the release", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 }); // btn-exec → executor 301
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });

    expect(keyMessages(harness)).toEqual([]);
    expect(cmdKeyMessages(harness)).toEqual([`Lua 'SetVar(GlobalVars(), "pamCmdKey", 301)'`]);
  });

  it("swallows the release even when the flags cleared between press and release", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    harness.osc.socket().inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 0 }] });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });

    expect(keyMessages(harness)).toEqual([]); // no orphaned Key 0
  });

  it("keeps a press/release pair normal when CMD mode starts in between", async () => {
    const harness = await startedEngine();
    harness.osc.socket().inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 2 }] });
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 }); // normal press
    harness.osc.socket().inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 4 }] });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 }); // release still reaches MA3 (flash needs Key 0)

    expect(keyMessages(harness)).toEqual(["/Page1/Key301", "/Page1/Key301"]);
    expect(cmdKeyMessages(harness)).toEqual([]);
  });

  it("does not intercept without flags, and not with a v1 plugin (AC-7 gate)", async () => {
    const harness = await startedEngine();
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 }); // no flags at all
    harness.osc.socket().inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 1 }] });
    harness.osc.socket().inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 4 }] });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 }); // flags set, but protocol 1

    expect(keyMessages(harness)).toEqual(["/Page1/Key301", "/Page1/Key301", "/Page1/Key301"]);
    expect(cmdKeyMessages(harness)).toEqual([]);
  });

  it("never intercepts quickKey/command buttons, faders or encoders (EC-2)", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 21, value: 127 }); // btn-qk → Quickey CLEAR
    unit.emit({ kind: "note", channel: 1, note: 20, value: 127 }); // btn-cmd → command HIGHLIGHT
    unit.emit({ kind: "cc", channel: 1, controller: 7, value: 127 }); // fader
    unit.emit({ kind: "cc", channel: 1, controller: 16, value: 2 }); // encoder

    const commands = harness.osc.socket().commands();
    expect(commands.some((command) => command.includes("Quickey"))).toBe(true);
    expect(commands.some((command) => command.includes("HIGHLIGHT"))).toBe(true);
    expect(harness.osc.socket().sent.some((message) => message.address === "/Page1/Fader201")).toBe(true);
    expect(harness.osc.socket().sent.some((message) => message.address === "/Page1/Fader203")).toBe(true);
    expect(cmdKeyMessages(harness)).toEqual([]);
  });
});

describe("CMD press queue (AC-11)", () => {
  it("serializes presses: the second waits for the cmdKeyDone ack", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });

    expect(cmdKeyMessages(harness)).toHaveLength(1); // second press queued

    harness.osc.socket().inject({ address: "/status/cmdKeyDone", args: [{ type: "integer", value: 301 }] });
    await waitFor(() => cmdKeyMessages(harness).length === 2);
  });

  it("advances after the ack timeout when the ack is lost", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    expect(cmdKeyMessages(harness)).toHaveLength(1);

    await sleep(TEST_TIMING.cmdAckTimeoutMs + 20); // no ack arrives
    expect(cmdKeyMessages(harness)).toHaveLength(2);
  });

  it("ignores an ack for a different executor instead of advancing (BUG-2/F2)", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 }); // exec 301 in flight
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 }); // exec 301 queued
    expect(cmdKeyMessages(harness)).toHaveLength(1);

    // Bogus/late ack for a never-sent executor must NOT advance the queue.
    harness.osc.socket().inject({ address: "/status/cmdKeyDone", args: [{ type: "integer", value: 999 }] });
    await sleep(5);
    expect(cmdKeyMessages(harness)).toHaveLength(1);

    // The correct ack advances it.
    harness.osc.socket().inject({ address: "/status/cmdKeyDone", args: [{ type: "integer", value: 301 }] });
    await waitFor(() => cmdKeyMessages(harness).length === 2);
  });

  it("disables CMD mode after consecutive ack timeouts — dead console self-heals (BUG-3/EC-5)", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    // Two presses, no acks → two consecutive timeouts → CMD mode resets.
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    await sleep(TEST_TIMING.cmdAckTimeoutMs + 10);
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    await sleep(TEST_TIMING.cmdAckTimeoutMs + 10);

    // cmdFlags reset to 0 was surfaced to the UI.
    await waitFor(() => harness.consoleStates.some((state) => state.cmdFlags === 0 && state.pluginProtocol === 2));

    // A further press now triggers normally (Key), not intercepted.
    harness.osc.socket().sent.length = 0;
    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    expect(keyMessages(harness)).toEqual(["/Page1/Key301"]);
    expect(cmdKeyMessages(harness)).toEqual([]);
  });

  it("drops presses beyond the queue limit instead of growing unbounded", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    const unit = harness.midi.connection(TEST_PORT);

    for (let i = 0; i < 12; i++) {
      unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
      unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    }
    // 1 in flight + 8 queued; acks drain exactly those
    for (let i = 0; i < 12; i++) {
      harness.osc.socket().inject({ address: "/status/cmdKeyDone", args: [{ type: "integer", value: 301 }] });
    }
    await sleep(10);
    expect(cmdKeyMessages(harness)).toHaveLength(9);
  });
});

describe("version handshake (AC-7)", () => {
  it("reports plugin-outdated (terminal) for a v1 pong and stays functional", async () => {
    const harness = await startedEngine();
    harness.osc.socket().inject({ address: "/status/connectionPong", args: [{ type: "integer", value: 1 }] });
    harness.osc.socket().inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 1 }] });

    await waitFor(() => harness.connections.some((status) => status.state === "plugin-outdated"));
    const status = harness.connections.find((s) => s.state === "plugin-outdated");
    expect(status?.pluginProtocol).toBe(1);
    expect(status?.gaveUp).toBe(true); // terminal — retrying can't change the version

    // basic bridging keeps working
    harness.midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    expect(harness.osc.socket().sent.some((message) => message.address === "/Page1/Fader201")).toBe(true);
  });

  it("treats a pong without a version argument as the v1 plugin", async () => {
    const harness = await startedEngine();
    harness.osc.socket().inject({ address: "/status/connectionPong", args: [] });
    harness.osc.socket().inject({ address: "/status/pluginPong", args: [] });
    await waitFor(() => harness.connections.some((status) => status.state === "plugin-outdated"));
  });
});

describe("console state surface (AC-9, AC-10)", () => {
  it("emits console events for cmdFlags, deskLock and plugin protocol changes", async () => {
    const harness = await startedEngine();
    const socket = harness.osc.socket();

    socket.inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 2 }] });
    socket.inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 8 }] });
    socket.inject({ address: "/status/deskLocked", args: [{ type: "true", value: true }] });
    socket.inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 0 }] });

    await waitFor(() => harness.consoleStates.length >= 4);
    expect(harness.consoleStates[0]).toEqual({ deskLocked: false, cmdFlags: 0, pluginProtocol: 2 });
    expect(harness.consoleStates[1]).toEqual({ deskLocked: false, cmdFlags: 8, pluginProtocol: 2 });
    expect(harness.consoleStates[2]).toEqual({ deskLocked: true, cmdFlags: 8, pluginProtocol: 2 });
    expect(harness.consoleStates[3]).toEqual({ deskLocked: true, cmdFlags: 0, pluginProtocol: 2 });
  });

  it("ignores repeated identical cmdFlags and malformed values", async () => {
    const harness = await startedEngine();
    const socket = harness.osc.socket();

    socket.inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 4 }] });
    socket.inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: 4 }] });
    socket.inject({ address: "/status/cmdFlags", args: [{ type: "string", value: "boom" }] });
    socket.inject({ address: "/status/cmdFlags", args: [{ type: "integer", value: -3 }] });
    socket.inject({ address: "/status/cmdFlags", args: [] });

    await sleep(10);
    expect(harness.consoleStates).toHaveLength(1);
    expect(harness.consoleStates[0]?.cmdFlags).toBe(4);
  });

  it("desk lock still blocks everything before interception (EC-6)", async () => {
    const harness = await startedEngine();
    activateCmdMode(harness);
    harness.osc.socket().inject({ address: "/status/deskLocked", args: [{ type: "true", value: true }] });

    harness.midi.connection(TEST_PORT).emit({ kind: "note", channel: 1, note: 10, value: 127 });
    expect(cmdKeyMessages(harness)).toEqual([]);
    expect(keyMessages(harness)).toEqual([]);
  });
});
