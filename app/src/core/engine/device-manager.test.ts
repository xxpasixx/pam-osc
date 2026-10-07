import { describe, expect, it } from "vitest";
import { DeviceManager, type DeviceManagerCallbacks, type UnitRuntime } from "./device-manager.js";
import type { Unit } from "./routing-table.js";
import { FakeMidiTransport } from "../../testing/fake-transports.js";
import { TEST_TIMING } from "../../testing/fixtures.js";
import { waitFor } from "../../testing/virtual-midi.js";

/**
 * PAM-24: the device definition's connect-time init SysEx must be the FIRST
 * output to the board, on every (re)bind. The DeviceManager only needs the
 * mapping's port + the device's initSysEx here, so units are stubbed — the full
 * routing is exercised by the engine suite.
 */

const FRAME = [0xf0, 0x47, 0x7f, 0x29, 0x60, 0x0, 0x4, 0x41, 0x1, 0x1, 0x1, 0xf7];

function stubUnit(
  id: string,
  port: string,
  initSysEx?: number[],
  initCC?: Array<{ controller: number; value: number; channel?: number }>
): Unit {
  return {
    mapping: { id, midiPort: { input: port, output: port } },
    device: { initSysEx, initCC },
  } as unknown as Unit;
}

function noopCallbacks(overrides: Partial<DeviceManagerCallbacks> = {}): DeviceManagerCallbacks {
  return { onEvent() {}, onBind() {}, onStatusChange() {}, log() {}, ...overrides };
}

describe("DeviceManager connect-time init SysEx (PAM-24)", () => {
  it("sends initSysEx as the first output on bind, before any feedback (AC-1, AC-2)", () => {
    const midi = new FakeMidiTransport();
    midi.ports = { inputs: ["APC"], outputs: ["APC"] };
    // onBind stands in for the engine's feedback restore — its output must come AFTER the init.
    const dm = new DeviceManager(
      midi,
      TEST_TIMING,
      noopCallbacks({
        onBind: (u: UnitRuntime) => u.connection?.send({ kind: "note", channel: 1, note: 1, velocity: 127 }),
      })
    );
    dm.start([stubUnit("m1", "APC", FRAME)]);

    const sent = midi.connection("APC").sent;
    expect(sent[0]).toEqual({ kind: "sysex", bytes: FRAME });
    expect(sent[1]).toEqual({ kind: "note", channel: 1, note: 1, velocity: 127 });
    dm.stop();
  });

  it("sends nothing on bind when the device declares no initSysEx (AC-5)", () => {
    const midi = new FakeMidiTransport();
    midi.ports = { inputs: ["Plain"], outputs: ["Plain"] };
    const dm = new DeviceManager(midi, TEST_TIMING, noopCallbacks());
    dm.start([stubUnit("m1", "Plain")]);

    expect(midi.connection("Plain").sent).toEqual([]);
    dm.stop();
  });

  it("re-sends initSysEx after a disconnect/reconnect (AC-3)", async () => {
    const midi = new FakeMidiTransport();
    midi.ports = { inputs: ["APC"], outputs: ["APC"] };
    const dm = new DeviceManager(midi, TEST_TIMING, noopCallbacks());
    dm.start([stubUnit("m1", "APC", FRAME)]);
    expect(midi.allSent("APC").filter((m) => m.kind === "sysex")).toHaveLength(1);

    // Unplug: the hot-plug poll closes the connection.
    midi.ports = { inputs: [], outputs: [] };
    await waitFor(() => midi.connections.every((c) => c.closed));

    // Re-plug: the poll rebinds and must re-arm the board (it powered up back in Mode 0).
    midi.ports = { inputs: ["APC"], outputs: ["APC"] };
    await waitFor(() => midi.allSent("APC").filter((m) => m.kind === "sysex").length === 2);
    dm.stop();
  });

  it("sends initCC (ring-type) right after initSysEx, before feedback (AC-8)", () => {
    const midi = new FakeMidiTransport();
    midi.ports = { inputs: ["APC"], outputs: ["APC"] };
    const dm = new DeviceManager(midi, TEST_TIMING, noopCallbacks());
    dm.start([
      stubUnit("m1", "APC", FRAME, [
        { controller: 24, value: 2 },
        { controller: 56, value: 2 },
      ]),
    ]);

    const sent = midi.connection("APC").sent;
    expect(sent[0]).toEqual({ kind: "sysex", bytes: FRAME });
    expect(sent[1]).toEqual({ kind: "cc", channel: 1, controller: 24, value: 2 });
    expect(sent[2]).toEqual({ kind: "cc", channel: 1, controller: 56, value: 2 });
    dm.stop();
  });

  it("sends its own init per unit for two units of the same board type (EC-2)", () => {
    const midi = new FakeMidiTransport();
    midi.ports = { inputs: ["APC A", "APC B"], outputs: ["APC A", "APC B"] };
    const dm = new DeviceManager(midi, TEST_TIMING, noopCallbacks());
    dm.start([stubUnit("m1", "APC A", FRAME), stubUnit("m2", "APC B", FRAME)]);

    expect(midi.connection("APC A").sent[0]).toEqual({ kind: "sysex", bytes: FRAME });
    expect(midi.connection("APC B").sent[0]).toEqual({ kind: "sysex", bytes: FRAME });
    dm.stop();
  });
});
