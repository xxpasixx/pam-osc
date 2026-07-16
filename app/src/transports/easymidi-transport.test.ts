import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { easymidiTransport } from "./easymidi-transport.js";
import type { MidiInputEvent } from "./midi.js";
import { VirtualMidiDevice, waitFor } from "../testing/virtual-midi.js";

/**
 * Round-trip through real virtual MIDI ports — this pins the wire-level
 * translation (1-based ↔ 0-based channels, note-off normalization, note-on
 * velocity 0 for "off", sysex passthrough).
 */

const PORT_NAME = `pam-test-transport-${process.pid}`;

describe("easymidiTransport", () => {
  let board: VirtualMidiDevice;
  const events: MidiInputEvent[] = [];
  let connection: ReturnType<typeof easymidiTransport.open>;

  beforeAll(async () => {
    board = new VirtualMidiDevice(PORT_NAME);
    await waitFor(
      () =>
        easymidiTransport.listPorts().inputs.includes(PORT_NAME) &&
        easymidiTransport.listPorts().outputs.includes(PORT_NAME),
    );
    connection = easymidiTransport.open(PORT_NAME, PORT_NAME, (event) => events.push(event));
  });

  afterAll(() => {
    connection?.close();
    board?.close();
  });

  it("lists virtual ports", () => {
    expect(easymidiTransport.listPorts().inputs).toContain(PORT_NAME);
    expect(easymidiTransport.listPorts().outputs).toContain(PORT_NAME);
  });

  it("normalizes input events to 1-based channels and note-off to value 0", async () => {
    events.length = 0;
    board.sendNoteOn(89, 127, 0); // wire channel 0 = format channel 1
    board.sendNoteOff(89, 64, 0);
    board.sendCc(70, 100, 1); // wire channel 1 = format channel 2
    board.sendPitch(16380, 8);

    await waitFor(() => events.length >= 4);
    expect(events).toEqual([
      { kind: "note", channel: 1, note: 89, value: 127 },
      { kind: "note", channel: 1, note: 89, value: 0 }, // note-off → value 0 (v1 semantics)
      { kind: "cc", channel: 2, controller: 70, value: 100 },
      { kind: "pitchbend", channel: 9, value: 16380 },
    ]);
  });

  it("sends wire-exact output — note-on velocity 0 for off, 0-based channels", async () => {
    board.clearReceived();
    connection.send({ kind: "note", channel: 1, note: 89, velocity: 127 });
    connection.send({ kind: "note", channel: 1, note: 89, velocity: 0 }); // "off"
    connection.send({ kind: "cc", channel: 1, controller: 48, value: 40 });
    connection.send({ kind: "pitchbend", channel: 9, value: 16380 });
    connection.send({ kind: "sysex", bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x72, 0x01, 0xf7] });

    await waitFor(() => board.received.length >= 5);
    expect(board.received).toEqual([
      { kind: "noteon", channel: 0, note: 89, velocity: 127 },
      { kind: "noteon", channel: 0, note: 89, velocity: 0 }, // never a real note-off
      { kind: "cc", channel: 0, controller: 48, value: 40 },
      { kind: "pitch", channel: 8, value: 16380 },
      { kind: "sysex", bytes: [0xf0, 0x00, 0x00, 0x66, 0x14, 0x72, 0x01, 0xf7] },
    ]);
  });

  it("throws for a port that is not connected", () => {
    expect(() => easymidiTransport.open("pam-no-such-port", undefined, () => {})).toThrow(/not connected/);
  });
});
