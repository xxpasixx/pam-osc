import { describe, expect, it } from "vitest";
import { MidiLearn } from "./midi-learn.js";
import type { MidiConnection, MidiInputEvent, MidiTransport } from "../transports/midi.js";
import type { MidiLearnEvent } from "../shared/ipc.js";

/**
 * Learn session (AC-4): temporary port open vs engine tap, capture rules,
 * cancel / replaced / port-lost endings.
 */

function harness(options: { held?: string[]; failOpen?: boolean } = {}) {
  const events: MidiLearnEvent[] = [];
  const opened: Array<{ port: string; closed: boolean; emit: (event: MidiInputEvent) => void }> = [];
  const transport: Pick<MidiTransport, "open"> = {
    open: (inputPort, _outputPort, onEvent): MidiConnection => {
      if (options.failOpen) throw new Error("port is busy");
      const record = { port: inputPort, closed: false, emit: onEvent };
      opened.push(record);
      return {
        send: () => {},
        close: () => {
          record.closed = true;
        },
      };
    },
  };
  const learn = new MidiLearn(transport, () => new Set(options.held ?? []), (event) => events.push(event));
  return { learn, events, opened };
}

describe("MidiLearn (AC-4)", () => {
  it("opens the port temporarily and captures the first event", () => {
    const { learn, events, opened } = harness();
    expect(learn.start("Port A")).toEqual({ ok: true });
    expect(opened).toHaveLength(1);

    opened[0]!.emit({ kind: "cc", channel: 3, controller: 16, value: 64 });
    expect(events).toEqual([{ status: "captured", port: "Port A", address: { kind: "cc", channel: 3, number: 16 } }]);
    expect(opened[0]!.closed).toBe(true);
    expect(learn.active).toBe(false);
  });

  it("maps note (incl. velocity 0) and pitchbend to their address shapes", () => {
    const { learn, events, opened } = harness();
    learn.start("Port A");
    opened[0]!.emit({ kind: "note", channel: 1, note: 42, value: 0 });
    expect(events[0]).toMatchObject({ status: "captured", address: { kind: "note", channel: 1, number: 42 } });

    learn.start("Port A");
    opened[1]!.emit({ kind: "pitchbend", channel: 9, value: 8192 });
    expect(events[1]).toMatchObject({ status: "captured", address: { kind: "pitchbend", channel: 9 } });
  });

  it("taps the engine instead of opening a port the engine holds", () => {
    const { learn, events, opened } = harness({ held: ["Held Port"] });
    expect(learn.start("Held Port")).toEqual({ ok: true });
    expect(opened).toHaveLength(0);

    learn.onEngineInput("Other Port", { kind: "cc", channel: 1, controller: 1, value: 1 });
    expect(events).toHaveLength(0); // wrong port — keep listening

    learn.onEngineInput("Held Port", { kind: "note", channel: 2, note: 10, value: 127 });
    expect(events).toEqual([
      { status: "captured", port: "Held Port", address: { kind: "note", channel: 2, number: 10 } },
    ]);
  });

  it("reports an unopenable port as an error", () => {
    const { learn } = harness({ failOpen: true });
    const result = learn.start("Broken");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("port is busy");
  });

  it("cancel and replace end the session with the right reason", () => {
    const { learn, events, opened } = harness();
    learn.start("Port A");
    learn.cancel();
    expect(events).toEqual([{ status: "ended", reason: "canceled" }]);
    expect(opened[0]!.closed).toBe(true);

    learn.start("Port A");
    learn.start("Port B"); // replaces the first session
    expect(events[1]).toEqual({ status: "ended", reason: "replaced" });
    expect(opened[1]!.closed).toBe(true);
    expect(learn.active).toBe(true);
  });

  it("ends with port-lost when the listened port disappears", () => {
    const { learn, events } = harness();
    learn.start("Port A");
    learn.onPortsChanged({ inputs: ["Port B"], outputs: [] });
    expect(events).toEqual([{ status: "ended", reason: "port-lost" }]);
    expect(learn.active).toBe(false);
  });

  it("ignores port changes that keep the session's port", () => {
    const { learn, events } = harness();
    learn.start("Port A");
    learn.onPortsChanged({ inputs: ["Port A", "Port B"], outputs: [] });
    expect(events).toHaveLength(0);
    expect(learn.active).toBe(true);
  });
});
