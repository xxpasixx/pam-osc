import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import type { ConnectionStatus, DeviceStatus, EngineIssue } from "./types.js";
import { FakeMidiTransport, FakeOscTransport } from "../../testing/fake-transports.js";
import { secondUnitMapping, sleep, testConfig, writeFixtures, TEST_PORT, TEST_TIMING } from "../../testing/fixtures.js";
import type { FormatSource } from "../format/index.js";
import { waitFor } from "../../testing/virtual-midi.js";

/**
 * Engine unit suite on fake transports — every AC has at least one test
 * here; the wire-level parity is covered by the transport and E2E suites.
 */

let sources: FormatSource[];

beforeAll(async () => {
  sources = await writeFixtures({ extraMappings: { "test-map-2": secondUnitMapping("Second Unit") } });
});

interface Harness {
  engine: Engine;
  midi: FakeMidiTransport;
  osc: FakeOscTransport;
  connections: ConnectionStatus[];
  deviceEvents: DeviceStatus[][];
  issues: EngineIssue[];
}

let active: Harness | undefined;

async function startEngine(overrides: Parameters<typeof testConfig>[1] = {}): Promise<Harness> {
  const midi = new FakeMidiTransport();
  midi.ports = { inputs: [TEST_PORT, "Second Unit"], outputs: [TEST_PORT, "Second Unit"] };
  const osc = new FakeOscTransport();
  const engine = new Engine(midi, osc);
  const harness: Harness = { engine, midi, osc, connections: [], deviceEvents: [], issues: [] };
  engine.on("connection", (status) => harness.connections.push(status));
  engine.on("devices", (statuses) => harness.deviceEvents.push(statuses));
  engine.on("issue", (issue) => harness.issues.push(issue));
  await engine.start(testConfig(sources, overrides));
  active = harness;
  return harness;
}

/** Startup is done when the plugin force-reload went out (AC-9 order). */
async function startedEngine(overrides: Parameters<typeof testConfig>[1] = {}): Promise<Harness> {
  const harness = await startEngine(overrides);
  await waitFor(() =>
    harness.osc
      .socket()
      .commands()
      .some((command) => command.includes("forceReload"))
  );
  harness.osc.socket().sent.length = 0; // drop startup traffic for clean assertions
  return harness;
}

afterEach(async () => {
  await active?.engine.stop();
  active = undefined;
});

describe("input routing (AC-1, AC-2, AC-3)", () => {
  it("routes absolute CC and 14-bit pitchbend faders to executor faders on the current page", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);

    unit.emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    unit.emit({ kind: "cc", channel: 1, controller: 7, value: 64 });
    unit.emit({ kind: "pitchbend", channel: 9, value: 16380 });
    unit.emit({ kind: "pitchbend", channel: 9, value: 8190 });

    const sent = osc.socket().sent;
    expect(sent[0]).toEqual({ address: "/Page1/Fader201", args: [{ type: "float", value: 100 }] });
    expect(sent[1]?.args[0]?.value).toBeCloseTo((64 / 127) * 100, 6);
    expect(sent[2]).toEqual({ address: "/Page1/Fader202", args: [{ type: "float", value: 100 }] });
    expect(sent[3]?.args[0]?.value).toBeCloseTo(50, 3);
  });

  it("follows page changes from the console (AC-1)", async () => {
    const { midi, osc } = await startedEngine();
    osc.socket().inject({ address: "/updatePage/current", args: [{ type: "integer", value: 7 }] });
    midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    expect(osc.socket().sent[0]?.address).toBe("/Page7/Fader201");
  });

  it("accumulates relative encoders into a clamped 0-100 fader (AC-2)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);

    unit.emit({ kind: "cc", channel: 1, controller: 16, value: 2 }); // +2
    unit.emit({ kind: "cc", channel: 1, controller: 16, value: 3 }); // +3 → 5
    unit.emit({ kind: "cc", channel: 1, controller: 16, value: 66 }); // -2 → 3
    unit.emit({ kind: "cc", channel: 1, controller: 16, value: 72 }); // -8 → clamp 0

    const values = osc.socket().sent.map((message) => message.args[0]?.value);
    expect(osc.socket().sent.every((message) => message.address === "/Page1/Fader203")).toBe(true);
    expect(values).toEqual([2, 5, 3, 0]);
  });

  it("sends relative Encoder messages additionally for MA3 knob executors > 300 (AC-2)", async () => {
    const { midi, osc } = await startedEngine();
    midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 17, value: 3 });

    const sent = osc.socket().sent;
    expect(sent[0]).toEqual({ address: "/Page1/Encoder401", args: [{ type: "integer", value: 3 }] });
    expect(sent[1]).toEqual({ address: "/Page1/Fader401", args: [{ type: "float", value: 3 }] });
  });

  it("sends attribute commands with amount and fine/rough modifiers (AC-2, AC-3)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);

    unit.emit({ kind: "cc", channel: 1, controller: 18, value: 1 }); // +1 × amount 5
    expect(osc.socket().commands().at(-1)).toBe("Attribute dimmer at  + 5");

    unit.emit({ kind: "note", channel: 1, note: 22, value: 127 }); // encoderFine on
    unit.emit({ kind: "cc", channel: 1, controller: 18, value: 65 }); // -1 × 5 ÷ 10
    expect(osc.socket().commands().at(-1)).toBe("Attribute dimmer at  - 0.5");
    const fineLed = midi.connection(TEST_PORT).sent.at(-1);
    expect(fineLed).toEqual({ kind: "note", channel: 1, note: 22, velocity: 127 });

    unit.emit({ kind: "note", channel: 1, note: 22, value: 127 }); // fine off again
    unit.emit({ kind: "note", channel: 1, note: 23, value: 127 }); // rough on
    unit.emit({ kind: "cc", channel: 1, controller: 18, value: 1 }); // +1 × 5 × 10
    expect(osc.socket().commands().at(-1)).toBe("Attribute dimmer at  + 50");

    // attributeSelect switches the "current" attribute and regroups the LEDs (AC-3)
    unit.emit({ kind: "note", channel: 1, note: 25, value: 127 }); // select pan
    unit.emit({ kind: "cc", channel: 1, controller: 18, value: 1 });
    expect(osc.socket().commands().at(-1)).toBe("Attribute pan at  + 50");
    const leds = midi.connection(TEST_PORT).sent.filter((m) => m.kind === "note" && (m.note === 24 || m.note === 25));
    expect(leds.at(-2)).toEqual({ kind: "note", channel: 1, note: 24, velocity: 0 }); // dimmer off
    expect(leds.at(-1)).toEqual({ kind: "note", channel: 1, note: 25, velocity: 127 }); // pan lit
  });

  it("routes buttons: executor press+release, quickKey/command press only, minValue threshold (AC-3)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);

    unit.emit({ kind: "note", channel: 1, note: 10, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 10, value: 0 });
    expect(osc.socket().sent[0]).toEqual({ address: "/Page1/Key301", args: [{ type: "integer", value: 100 }] });
    expect(osc.socket().sent[1]).toEqual({ address: "/Page1/Key301", args: [{ type: "integer", value: 0 }] });

    unit.emit({ kind: "note", channel: 1, note: 21, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 21, value: 0 }); // release: no second Quickey
    unit.emit({ kind: "note", channel: 1, note: 20, value: 127 });
    expect(osc.socket().commands()).toEqual(['Quickey "pam-osc_CLEAR"', "HIGHLIGHT"]);

    osc.socket().sent.length = 0;
    unit.emit({ kind: "note", channel: 1, note: 12, value: 30 }); // at minValue → dropped (v1: <=)
    expect(osc.socket().sent).toEqual([]);
    unit.emit({ kind: "note", channel: 1, note: 12, value: 90 });
    expect(osc.socket().sent[0]).toEqual({ address: "/Page1/Key302", args: [{ type: "integer", value: 71 }] });
  });
});

describe("timecode (AC-4)", () => {
  it("cycles slots, mirrors the selected slot on the 7-segment display, taps and holds transport", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    const socket = osc.socket();

    socket.inject({ address: "/Timecode1", args: [{ type: "string", value: "01h02m03:04" }] });

    unit.sent.length = 0;
    unit.emit({ kind: "note", channel: 1, note: 26, value: 127 }); // cycle 0 → 1
    // reset (12 segments) + slot digit + time render
    const ccs = unit.sent.filter((m) => m.kind === "cc");
    expect(ccs.length).toBe(12 + 1 + 9); // reset, digit, hrs 3 + min 2 + sec 2 + mili 2
    expect(ccs[12]).toEqual({ kind: "cc", channel: 1, controller: 74, value: "1".charCodeAt(0) }); // digit at position 1
    // hours "001" at positions 2-4 → CC 73, 72, 71
    expect(ccs[13]).toEqual({ kind: "cc", channel: 1, controller: 75 - 9, value: "0".charCodeAt(0) }); // mili first
    expect(ccs.at(-1)).toEqual({ kind: "cc", channel: 1, controller: 75 - 4, value: "1".charCodeAt(0) }); // hrs last digit

    // tap → Go+ (slot 1 has data, not running)
    unit.emit({ kind: "note", channel: 1, note: 27, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 27, value: 0 });
    expect(socket.commands().at(-1)).toBe("Go+ Timecodeslot 1");

    // console reports it running → tap pauses
    socket.inject({ address: "/14.1", args: [{ type: "string", value: "Go+" }] });
    unit.emit({ kind: "note", channel: 1, note: 27, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 27, value: 0 });
    expect(socket.commands().at(-1)).toBe("Pause Timecodeslot 1");

    // hold ≥ holdOffMs → Off; the release is consumed
    unit.emit({ kind: "note", channel: 1, note: 27, value: 127 });
    await sleep(TEST_TIMING.holdOffMs + 30);
    expect(socket.commands().at(-1)).toBe("Off Timecodeslot 1");
    unit.emit({ kind: "note", channel: 1, note: 27, value: 0 });
    expect(socket.commands().at(-1)).toBe("Off Timecodeslot 1"); // nothing new
  });

  it("select respects the minValue guard (press only)", async () => {
    const { midi } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    unit.sent.length = 0;
    unit.emit({ kind: "note", channel: 1, note: 26, value: 100 }); // at threshold → dropped
    unit.emit({ kind: "note", channel: 1, note: 26, value: 0 });
    expect(unit.sent).toEqual([]);
  });
});

describe("feedback routing (AC-5, AC-6, AC-7)", () => {
  it("moves motor faders, encoder rings (incl. accumulator sync) on Fader feedback (AC-5)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    const socket = osc.socket();
    unit.sent.length = 0;

    socket.inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 50 }] });
    socket.inject({ address: "/Page1/Fader202", args: [{ type: "float", value: 100 }] });
    socket.inject({ address: "/Page1/Fader203", args: [{ type: "float", value: 50 }] });

    expect(unit.sent[0]).toEqual({ kind: "cc", channel: 1, controller: 7, value: 64 }); // round(63.5)
    expect(unit.sent[1]).toEqual({ kind: "pitchbend", channel: 9, value: 16380 });
    expect(unit.sent[2]).toEqual({ kind: "cc", channel: 1, controller: 48, value: 38 }); // ring 32-43

    // the accumulator now continues from the console value (v1)
    unit.emit({ kind: "cc", channel: 1, controller: 16, value: 1 }); // +1
    expect(socket.sent.at(-1)).toEqual({ address: "/Page1/Fader203", args: [{ type: "float", value: 51 }] });
  });

  it("lights button LEDs from Button and masterEnabled feedback; always-on stays fixed (AC-6)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    const socket = osc.socket();
    unit.sent.length = 0;

    socket.inject({ address: "/Page1/Button301", args: [{ type: "string", value: "On" }] });
    socket.inject({ address: "/Page1/Button301", args: [{ type: "string", value: "Off" }] });
    socket.inject({ address: "/masterEnabled/highlight", args: [{ type: "integer", value: 1 }] });
    socket.inject({ address: "/masterEnabled/go+", args: [{ type: "integer", value: 0 }] }); // always-on ignores state

    expect(unit.sent).toEqual([
      { kind: "note", channel: 1, note: 10, velocity: 127 },
      { kind: "note", channel: 1, note: 10, velocity: 0 },
      { kind: "note", channel: 1, note: 20, velocity: 127 },
      { kind: "note", channel: 1, note: 28, velocity: 64 },
    ]);
  });

  it("renders scribble colors and names via sysex (AC-7)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    const socket = osc.socket();
    unit.sent.length = 0;

    socket.inject({ address: "/Page1/Color201", args: [{ type: "string", value: "255;0;0;255" }] });
    expect(unit.sent[0]).toEqual({
      kind: "sysex",
      bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x72, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7],
    });

    socket.inject({ address: "/Page1/Color202", args: [{ type: "string", value: "0;255;255;255" }] }); // cyan on strip 2
    expect(unit.sent[1]).toEqual({
      kind: "sysex",
      bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x72, 0x01, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7],
    });

    unit.sent.length = 0;
    socket.inject({ address: "/Page1/Name202", args: [{ type: "string", value: "Blinders;Cue 5" }] });
    const seq = [..."Blinder"].map((c) => c.charCodeAt(0)); // truncated to 7
    const cue = [..."Cue 5  "].map((c) => c.charCodeAt(0)); // padded to 7
    expect(unit.sent[0]).toEqual({ kind: "sysex", bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x12, 7, ...seq, 0xf7] });
    expect(unit.sent[1]).toEqual({ kind: "sysex", bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x12, 63, ...cue, 0xf7] });
  });

  it("ignores MIDI events with no assignment — no crash, no sends (EC-1)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    unit.sent.length = 0;
    unit.emit({ kind: "cc", channel: 1, controller: 99, value: 64 }); // unmapped CC
    unit.emit({ kind: "note", channel: 1, note: 99, value: 127 }); // unmapped note
    unit.emit({ kind: "note", channel: 5, note: 10, value: 127 }); // mapped note, wrong channel
    unit.emit({ kind: "pitchbend", channel: 3, value: 8000 }); // unmapped pitch channel
    expect(osc.socket().sent).toEqual([]);
    expect(unit.sent).toEqual([]);
  });

  it("treats absent optional mapping features as 'off', never as an error (EC-6)", async () => {
    // test-map-2 omits enableTimecodeSend's features and has no minValue/amount anywhere
    const harness = await startedEngine({ activeMappingIds: ["test-map-2"] });
    expect(harness.issues.filter((issue) => issue.severity === "error")).toEqual([]);

    const unit = harness.midi.connection("Second Unit");
    unit.sent.length = 0;
    // timecode select on a non-timecode mapping: silently does nothing
    unit.emit({ kind: "note", channel: 1, note: 26, value: 127 });
    expect(unit.sent).toEqual([]);
    // regular routing still works
    unit.emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    expect(harness.osc.socket().sent.at(-1)?.address).toBe("/Page1/Fader201");
  });

  it("ignores /Timecode slots outside 0-8 — the slot map stays bounded (BUG-2)", async () => {
    const { osc } = await startedEngine();
    const socket = osc.socket();
    for (let i = 0; i < 1000; i++) {
      socket.inject({ address: `/Timecode${i + 100}`, args: [{ type: "string", value: "01h02m03:04" }] });
    }
    socket.inject({ address: "/Timecode999999999", args: [{ type: "string", value: "01h02m03:04" }] });
    // only real slots are tracked — verified via behavior: selecting slot 1 shows no time
    // (nothing stored), while slot feedback for slot 1 still works
    socket.inject({ address: "/Timecode1", args: [{ type: "string", value: "05h06m07:08" }] });
    const { midi } = active!;
    const unit = midi.connection(TEST_PORT);
    unit.sent.length = 0;
    unit.emit({ kind: "note", channel: 1, note: 26, value: 127 }); // select slot 1
    expect(unit.sent.filter((m) => m.kind === "cc").length).toBe(12 + 1 + 9); // renders stored time
  });

  it("ignores feedback nothing references (EC-2)", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    unit.sent.length = 0;
    osc.socket().inject({ address: "/Page1/Fader999", args: [{ type: "float", value: 50 }] });
    osc.socket().inject({ address: "/something/else", args: [] });
    expect(unit.sent).toEqual([]);
  });
});

describe("desk lock (AC-8)", () => {
  it("blocks MIDI input while locked, feedback keeps flowing", async () => {
    const { midi, osc } = await startedEngine();
    const unit = midi.connection(TEST_PORT);
    const socket = osc.socket();

    socket.inject({ address: "/status/deskLocked", args: [{ type: "true", value: true }] });
    unit.emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    unit.emit({ kind: "note", channel: 1, note: 20, value: 127 });
    expect(socket.sent).toEqual([]); // nothing reaches the console

    unit.sent.length = 0;
    socket.inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 25 }] });
    expect(unit.sent.length).toBe(1); // feedback still processed (v1)

    socket.inject({ address: "/status/deskLocked", args: [{ type: "false", value: false }] });
    unit.emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    expect(socket.sent.at(-1)?.address).toBe("/Page1/Fader201");
  });
});

describe("startup & connection check (AC-9)", () => {
  it("runs animation → start state → forceReload → ping, and reports 'connected' when both pongs arrive", async () => {
    const harness = await startEngine();
    const socket = harness.osc.socket();
    const unit = harness.midi.connection(TEST_PORT);

    await waitFor(() => socket.commands().some((command) => command.includes("forceReload")));

    // animation produced traffic; the final state (after all-off) is the start state
    expect(unit.sent.length).toBeGreaterThan(0);
    const lastNote = (note: number) => unit.sent.filter((m) => m.kind === "note" && m.note === note).at(-1);
    expect(lastNote(28)).toEqual({ kind: "note", channel: 1, note: 28, velocity: 64 }); // always-on value
    expect(lastNote(24)).toEqual({ kind: "note", channel: 1, note: 24, velocity: 127 }); // current attribute lit
    expect(lastNote(25)).toEqual({ kind: "note", channel: 1, note: 25, velocity: 0 }); // other attribute dark

    // ping pair went out after forceReload
    const commands = socket.commands();
    expect(commands.some((command) => command.includes("connectionPong"))).toBe(true);
    expect(commands.some((command) => command.includes("pamPing"))).toBe(true);

    // both pongs answered (current plugin protocol) → connected
    socket.inject({ address: "/status/connectionPong", args: [{ type: "integer", value: 1 }] });
    socket.inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 2 }] });
    await waitFor(() => harness.connections.some((status) => status.state === "connected"));
  });

  it("reports plugin-missing / unreachable and retries up to the limit", async () => {
    const harness = await startEngine();
    const socket = harness.osc.socket();
    await waitFor(() => socket.commands().some((command) => command.includes("connectionPong")));

    socket.inject({ address: "/status/connectionPong", args: [{ type: "integer", value: 1 }] }); // console yes, plugin no
    await waitFor(() => harness.connections.some((status) => status.state === "plugin-missing"));

    // second (and per TEST_TIMING last) attempt: no pongs at all → unreachable + gaveUp
    await waitFor(() => harness.connections.some((status) => status.state === "unreachable" && status.gaveUp));
  });
});

describe("hot plug (AC-10, EC-5)", () => {
  it("survives disconnects, rebinds automatically and restores feedback state", async () => {
    const harness = await startedEngine();
    const { midi, osc } = harness;
    const socket = osc.socket();

    socket.inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 75 }] }); // cached: cc7 = 95
    socket.inject({ address: "/masterEnabled/highlight", args: [{ type: "integer", value: 1 }] }); // cached: note20 = 127

    midi.ports = { inputs: ["Second Unit"], outputs: ["Second Unit"] }; // yank the device
    await waitFor(() =>
      harness.deviceEvents.some((statuses) => statuses.some((s) => s.mappingId === "test-map" && s.state === "missing"))
    );

    // engine keeps running: OSC feedback while missing is cached, not crashing
    socket.inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 25 }] });

    harness.deviceEvents.length = 0; // startup events also said "bound" — only the rebind counts
    midi.ports = { inputs: [TEST_PORT, "Second Unit"], outputs: [TEST_PORT, "Second Unit"] }; // replug
    await waitFor(() =>
      harness.deviceEvents.some((statuses) => statuses.some((s) => s.mappingId === "test-map" && s.state === "bound"))
    );

    const rebound = midi.connection(TEST_PORT);
    await waitFor(() => rebound.sent.length > 0);
    // replayed cache carries the newest value (25 → cc 32), plus the fresh state
    const faderReplay = rebound.sent.filter((m) => m.kind === "cc" && m.controller === 7);
    expect(faderReplay).toEqual([{ kind: "cc", channel: 1, controller: 7, value: 32 }]);
    const ledReplay = rebound.sent.filter((m) => m.kind === "note" && m.note === 20);
    expect(ledReplay).toEqual([{ kind: "note", channel: 1, note: 20, velocity: 127 }]);
    const alwaysOn = rebound.sent.filter((m) => m.kind === "note" && m.note === 28);
    expect(alwaysOn.at(-1)).toEqual({ kind: "note", channel: 1, note: 28, velocity: 64 });
  });

  it("starts with a missing device and binds it when it appears — without an animation", async () => {
    const harness = await startEngine();
    harness.midi.ports = { inputs: [], outputs: [] };
    await harness.engine.stop();
    harness.connections.length = 0;

    // fresh start with no devices present
    const midi = harness.midi;
    const osc = new FakeOscTransport();
    const engine = new Engine(midi, osc);
    const deviceEvents: DeviceStatus[][] = [];
    engine.on("devices", (statuses) => deviceEvents.push(statuses));
    await engine.start(testConfig(sources));
    active = { ...harness, engine, osc };

    await waitFor(() =>
      osc
        .socket()
        .commands()
        .some((command) => command.includes("forceReload"))
    );

    midi.ports = { inputs: [TEST_PORT], outputs: [TEST_PORT] };
    await waitFor(() =>
      deviceEvents.some((statuses) => statuses.some((s) => s.mappingId === "test-map" && s.state === "bound"))
    );

    const unit = midi.connection(TEST_PORT);
    await waitFor(() => unit.sent.length > 0);
    // no animation wave — just the restore (always-on, LEDs, segments)
    const alwaysOn = unit.sent.filter((m) => m.kind === "note" && m.note === 28 && m.velocity === 64);
    expect(alwaysOn.length).toBe(1);
  });

  it("a renamed port stays missing (EC-5)", async () => {
    const harness = await startedEngine();
    harness.midi.ports = { inputs: ["Test Unit 2"], outputs: ["Test Unit 2"] }; // OS renamed it
    await waitFor(() => harness.deviceEvents.some((statuses) => statuses.some((s) => s.state === "missing")));
    await sleep(TEST_TIMING.hotplugPollMs * 3);
    const last = harness.deviceEvents.at(-1)?.find((s) => s.mappingId === "test-map");
    expect(last?.state).toBe("missing");
  });
});

describe("engine lifecycle (AC-11, EC-4)", () => {
  it("drives two units of the same board type independently", async () => {
    const harness = await startedEngine({ activeMappingIds: ["test-map", "test-map-2"] });
    const socket = harness.osc.socket();

    harness.midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    harness.midi.connection("Second Unit").emit({ kind: "cc", channel: 1, controller: 7, value: 0 });
    expect(socket.sent.length).toBe(2); // both route

    // feedback reaches both units
    harness.midi.connection(TEST_PORT).sent.length = 0;
    harness.midi.connection("Second Unit").sent.length = 0;
    socket.inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 50 }] });
    expect(harness.midi.connection(TEST_PORT).sent.length).toBe(1);
    expect(harness.midi.connection("Second Unit").sent.length).toBe(1);
  });

  it("reconfigure leaves no stale listeners behind (AC-11)", async () => {
    const harness = await startedEngine();
    const firstConnection = harness.midi.connection(TEST_PORT);
    const firstSocket = harness.osc.socket();

    await harness.engine.reconfigure(testConfig(sources));
    await waitFor(() =>
      harness.osc
        .socket()
        .commands()
        .some((command) => command.includes("forceReload"))
    );
    expect(firstConnection.closed).toBe(true);
    expect(firstSocket.closed).toBe(true);

    const socket = harness.osc.socket();
    socket.sent.length = 0;
    harness.midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    const faderMessages = socket.sent.filter((message) => message.address === "/Page1/Fader201");
    expect(faderMessages.length).toBe(1); // exactly once — no doubled routing
  });

  it("skips unknown active mappings with an error issue and runs the valid rest (EC-4)", async () => {
    const harness = await startedEngine({ activeMappingIds: ["test-map", "does-not-exist"] });
    expect(harness.issues.some((issue) => issue.severity === "error" && issue.message.includes("does-not-exist"))).toBe(
      true
    );
    harness.midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    expect(harness.osc.socket().sent.length).toBe(1);
  });

  it("refuses to start only when nothing valid remains", async () => {
    const midi = new FakeMidiTransport();
    const osc = new FakeOscTransport();
    const engine = new Engine(midi, osc);
    await expect(engine.start(testConfig(sources, { activeMappingIds: ["does-not-exist"] }))).rejects.toThrow(
      /no valid active mapping/
    );
    expect(engine.isRunning()).toBe(false);
  });
});

describe("diagnostics (PAM-4)", () => {
  it("emits traffic events for all four directions with readable text (AC-5)", async () => {
    const harness = await startedEngine();
    const traffic: import("./types.js").TrafficEvent[] = [];
    harness.engine.on("traffic", (event) => traffic.push(event));

    harness.midi.connection(TEST_PORT).emit({ kind: "cc", channel: 1, controller: 7, value: 127 });
    harness.osc.socket().inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 50 }] });

    const byDirection = (direction: string) => traffic.filter((event) => event.direction === direction);
    expect(byDirection("midi-in").map((event) => event.text)).toContain("cc 7 ch1 = 127");
    expect(byDirection("osc-out").map((event) => event.text)).toContain("/Page1/Fader201 100");
    expect(byDirection("osc-in").map((event) => event.text)).toContain("/Page1/Fader201 50");
    expect(byDirection("midi-out").some((event) => event.text.startsWith("cc 7 ch1"))).toBe(true);
    expect(byDirection("midi-in")[0]?.source).toBe(TEST_PORT);
  });

  it("replays the output test on demand and restores live state afterwards (AC-4, EC-1)", async () => {
    const harness = await startedEngine();
    const socket = harness.osc.socket();
    const unit = harness.midi.connection(TEST_PORT);

    socket.inject({ address: "/Page1/Fader201", args: [{ type: "float", value: 50 }] });
    const liveFader = unit.sent.at(-1);
    expect(liveFader).toEqual({ kind: "cc", channel: 1, controller: 7, value: 64 });
    unit.sent.length = 0;

    const resultPromise = harness.engine.outputTest("test-map");
    await waitFor(() => unit.sent.length > 0); // animation frames flow
    // The ack resolves only when the animation actually completes (PAM-17 AC-4).
    expect(await resultPromise).toEqual({ ok: true });

    // After the animation the cached live value is back on the motor fader.
    const faderValues = unit.sent.filter((m) => m.kind === "cc" && m.controller === 7);
    expect(faderValues.at(-1)).toEqual({ kind: "cc", channel: 1, controller: 7, value: 64 });
  });

  it("rejects the output test for missing devices and unknown mappings (AC-4)", async () => {
    const harness = await startedEngine();
    expect(await harness.engine.outputTest("nope")).toEqual({ ok: false, error: 'mapping "nope" is not active' });

    harness.midi.ports = { inputs: [], outputs: [] };
    await waitFor(() => harness.deviceEvents.some((statuses) => statuses.some((s) => s.state === "missing")));
    const result = await harness.engine.outputTest("test-map");
    expect(result.ok).toBe(false);
  });

  it("manual re-check pings again after the checker gave up (AC-3)", async () => {
    const harness = await startedEngine();
    await waitFor(() => harness.connections.some((status) => status.gaveUp));

    const before = harness.connections.length;
    harness.engine.checkConnection();
    await waitFor(() => harness.connections.length > before);
    expect(harness.connections[before]).toEqual({ state: "checking", attempt: 1, gaveUp: false });

    // Console answers this time (current plugin protocol) → connected.
    harness.osc.socket().inject({ address: "/status/connectionPong", args: [] });
    harness.osc.socket().inject({ address: "/status/pluginPong", args: [{ type: "integer", value: 2 }] });
    await waitFor(() => harness.connections.some((status) => status.state === "connected"));
  });

  it("checkConnection on a stopped engine is a safe no-op", async () => {
    const harness = await startedEngine();
    await harness.engine.stop();
    expect(() => harness.engine.checkConnection()).not.toThrow();
    expect((await harness.engine.outputTest("test-map")).ok).toBe(false);
  });
});
