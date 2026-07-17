import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createSocket } from "node:dgram";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Engine } from "./core/engine/index.js";
import { easymidiTransport } from "./transports/easymidi-transport.js";
import { udpOscTransport } from "./transports/osc-udp.js";
import { FakeMA3 } from "./testing/fake-ma3.js";
import { testConfig, writeFixtures, TEST_PORT, TEST_TIMING } from "./testing/fixtures.js";
import { VirtualMidiDevice, waitFor } from "./testing/virtual-midi.js";

/**
 * End-to-end: real virtual MIDI ports ↔ engine ↔ real UDP/OSC ↔ fake MA3.
 * Part A drives the fixture board through every message kind; part B loads
 * the real bundled X-Touch content (port re-bound via user shadowing, the
 * same move PAM-3 will make) and asserts v1-parity bytes on the wire.
 */

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createSocket("udp4");
    probe.on("error", reject);
    probe.bind(0, () => {
      const port = probe.address().port;
      probe.close(() => resolvePort(port));
    });
  });
}

async function untilPortsVisible(name: string): Promise<void> {
  await waitFor(
    () => easymidiTransport.listPorts().inputs.includes(name) && easymidiTransport.listPorts().outputs.includes(name)
  );
}

describe("E2E: fixture board ↔ engine ↔ fake MA3", () => {
  let board: VirtualMidiDevice;
  let ma3: FakeMA3;
  let engine: Engine;
  const connections: string[] = [];
  const logs: string[] = [];

  beforeAll(async () => {
    board = new VirtualMidiDevice(TEST_PORT);
    await untilPortsVisible(TEST_PORT);

    const receivePort = await freePort();
    ma3 = new FakeMA3("127.0.0.1", receivePort);
    const sendPort = await ma3.start();

    const sources = await writeFixtures();
    engine = new Engine(easymidiTransport, udpOscTransport);
    engine.on("connection", (status) => connections.push(status.state));
    engine.on("log", (line) => logs.push(line));
    await engine.start(testConfig(sources, { sendPort, receivePort, timing: { ...TEST_TIMING, pingMaxRetries: 5 } }));
    // startup finished when the plugin reload went out
    await waitFor(() => ma3.commands().some((command) => command.includes("forceReload")));
  }, 15000);

  afterAll(async () => {
    await engine?.stop();
    await ma3?.stop();
    board?.close();
  });

  it("reports 'connected' — the fake console answers both pings (AC-9)", async () => {
    await waitFor(() => connections.includes("connected"));
  });

  it("moves a fader on the board and the console sees the executor value (AC-1)", async () => {
    ma3.clearReceived();
    board.sendCc(7, 127, 0); // wire channel 0 = format channel 1
    await waitFor(() => ma3.received.some((message) => message.address === "/Page1/Fader201"));
    const message = ma3.received.find((m) => m.address === "/Page1/Fader201");
    expect(message?.args[0]?.type).toBe("float");
    expect(message?.args[0]?.value).toBe(100);

    board.sendPitch(16380, 8); // wire channel 8 = format channel 9
    await waitFor(() => ma3.received.some((m) => m.address === "/Page1/Fader202"));
  });

  it("presses a button and MA3 gets the Key — release included (AC-3)", async () => {
    ma3.clearReceived();
    board.sendNoteOn(10, 127, 0);
    board.sendNoteOff(10, 0, 0);
    await waitFor(() => ma3.received.filter((m) => m.address === "/Page1/Key301").length >= 2);
    const values = ma3.received.filter((m) => m.address === "/Page1/Key301").map((m) => m.args[0]?.value);
    expect(values).toEqual([100, 0]);
  });

  it("console feedback drives motor fader, LED, ring, scribble and 7-segment (AC-5/6/7, AC-4)", async () => {
    board.clearReceived();
    ma3.sendFader(1, 201, 50);
    ma3.sendFader(1, 203, 50);
    ma3.sendButton(1, 301, true);
    ma3.sendColor(1, 201, "0;0;255;255");
    ma3.sendName(1, 201, "Blinder;Cue 7");
    ma3.sendTimecode(1, "01h02m03:04");

    await waitFor(() => board.received.length >= 6);
    expect(board.received).toContainEqual({ kind: "cc", channel: 0, controller: 7, value: 64 });
    expect(board.received).toContainEqual({ kind: "cc", channel: 0, controller: 48, value: 38 });
    expect(board.received).toContainEqual({ kind: "noteon", channel: 0, note: 10, velocity: 127 });
    expect(board.received).toContainEqual({
      kind: "sysex",
      bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x72, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7],
    });
    const textFrames = board.received.filter((m) => m.kind === "sysex" && m.bytes[5] === 0x12);
    expect(textFrames.length).toBe(2);

    // select slot 1 on the board → 7-segment renders the received time
    board.clearReceived();
    board.sendNoteOn(26, 127, 0);
    await waitFor(() => board.received.filter((m) => m.kind === "cc").length >= 22);
    expect(board.received).toContainEqual({ kind: "cc", channel: 0, controller: 74, value: "1".charCodeAt(0) });
  });

  it("desk lock blocks input end-to-end (AC-8)", async () => {
    ma3.sendDeskLocked(true);
    await waitFor(() => logs.some((line) => line.includes("desk locked")));

    ma3.clearReceived();
    board.sendCc(7, 30, 0);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 150));
    expect(ma3.received.filter((m) => m.address.startsWith("/Page"))).toEqual([]);

    ma3.sendDeskLocked(false);
    await waitFor(() => logs.some((line) => line.includes("desk unlocked")));
    board.sendCc(7, 40, 0);
    await waitFor(() => ma3.received.some((m) => m.address === "/Page1/Fader201"));
  });
});

describe("E2E: bundled X-Touch content, port re-bound via user shadow (v1 parity)", () => {
  const PORT = "PAM E2E XTouch";
  let board: VirtualMidiDevice;
  let ma3: FakeMA3;
  let engine: Engine;
  const issues: string[] = [];

  beforeAll(async () => {
    board = new VirtualMidiDevice(PORT);
    await untilPortsVisible(PORT);

    const repoRoot = resolve(import.meta.dirname, "../..");
    const bundledDevices = join(repoRoot, "resources/devices");
    const bundledMappings = join(repoRoot, "resources/mappings");

    // user shadow: identical bundled mapping, only the MIDI port re-bound
    const userDir = await mkdtemp(join(tmpdir(), "pam-e2e-user-"));
    await mkdir(join(userDir, "devices"));
    await mkdir(join(userDir, "mappings"));
    const mapping = JSON.parse(await readFile(join(bundledMappings, "x-touch-default-1.json"), "utf8")) as {
      midiPort: { input: string; output: string };
    };
    mapping.midiPort = { input: PORT, output: PORT };
    await writeFile(join(userDir, "mappings", "x-touch-default-1.json"), JSON.stringify(mapping, null, 2));

    const receivePort = await freePort();
    ma3 = new FakeMA3("127.0.0.1", receivePort);
    const sendPort = await ma3.start();

    engine = new Engine(easymidiTransport, udpOscTransport);
    engine.on("issue", (issue) => issues.push(`${issue.severity}: ${issue.message}`));
    await engine.start({
      consoleAddress: "127.0.0.1",
      sendPort,
      receivePort,
      sources: [
        { origin: "bundled", devicesDir: bundledDevices, mappingsDir: bundledMappings },
        { origin: "user", devicesDir: join(userDir, "devices"), mappingsDir: join(userDir, "mappings") },
      ],
      activeMappingIds: ["x-touch-default-1"],
      timing: TEST_TIMING,
    });
    await waitFor(() => ma3.commands().some((command) => command.includes("forceReload")), 15000);
  }, 20000);

  afterAll(async () => {
    await engine?.stop();
    await ma3?.stop();
    board?.close();
  });

  it("loads the real bundled content — the shadow is reported, nothing errors", () => {
    expect(issues.some((issue) => issue.includes("overrides the bundled version"))).toBe(true);
    expect(issues.filter((issue) => issue.startsWith("error"))).toEqual([]);
  });

  it("fader 1 (pitchbend ch 1) → /Page1/Fader201, full 14-bit (v1 parity)", async () => {
    ma3.clearReceived();
    board.sendPitch(16380, 0); // wire channel 0 = the X-Touch's fader 1
    await waitFor(() => ma3.received.some((m) => m.address === "/Page1/Fader201"));
    expect(ma3.received.find((m) => m.address === "/Page1/Fader201")?.args[0]?.value).toBe(100);

    board.sendPitch(8190, 0);
    await waitFor(() =>
      ma3.received.some((m) => m.address === "/Page1/Fader201" && Math.abs((m.args[0]?.value as number) - 50) < 0.01)
    );
  });

  it("console fader feedback moves the motor fader back (v1 bytes)", async () => {
    board.clearReceived();
    ma3.sendFader(1, 201, 50);
    await waitFor(() => board.received.some((m) => m.kind === "pitch"));
    expect(board.received).toContainEqual({ kind: "pitch", channel: 0, value: 8190 });
  });

  it("Button 401 lights the rec-1 LED (note 0, MC velocity semantics)", async () => {
    board.clearReceived();
    ma3.sendButton(1, 401, true);
    await waitFor(() => board.received.some((m) => m.kind === "noteon" && m.note === 0));
    expect(board.received).toContainEqual({ kind: "noteon", channel: 0, note: 0, velocity: 127 });

    ma3.sendButton(1, 401, false);
    // MC "off" arrives as note-on velocity 0 — never a real note-off
    await waitFor(() => board.received.some((m) => m.kind === "noteon" && m.note === 0 && m.velocity === 0));
    expect(board.received.filter((m) => m.kind === "noteoff")).toEqual([]);
  });

  it("scribble strip 1 shows sequence and cue (v1 sysex frames)", async () => {
    board.clearReceived();
    ma3.sendName(1, 201, "Chaser;Cue 42");
    await waitFor(() => board.received.filter((m) => m.kind === "sysex").length >= 2);
    const frames = board.received.filter((m) => m.kind === "sysex");
    const seq = [..."Chaser "].map((c) => c.charCodeAt(0));
    const cue = [..."Cue 42 "].map((c) => c.charCodeAt(0));
    expect(frames).toContainEqual({ kind: "sysex", bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x12, 0, ...seq, 0xf7] });
    expect(frames).toContainEqual({ kind: "sysex", bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x12, 56, ...cue, 0xf7] });
  });

  it("masterEnabled lights the HIGHLIGHT command button (restored master-LED parity)", async () => {
    board.clearReceived();
    ma3.sendMasterEnabled("highlight", true);
    await waitFor(() => board.received.some((m) => m.kind === "noteon" && m.velocity === 127));
  });
});
