import { describe, expect, it, vi } from "vitest";
import { MidiLearn } from "./midi-learn.js";
import type { MidiConnection, MidiInputEvent, MidiTransport } from "../transports/midi.js";
import type { MidiActivityEvent, MidiLearnEvent } from "../shared/ipc.js";

/**
 * Monitor session: learn (AC-4) — temporary port open vs engine tap, capture
 * rules, cancel / replaced / port-lost endings; indicate (AC-11) — continuous
 * batched activity.
 */

function harness(options: { held?: string[]; failOpen?: boolean } = {}) {
  const events: MidiLearnEvent[] = [];
  const activity: MidiActivityEvent[] = [];
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
  const learn = new MidiLearn(
    transport,
    () => new Set(options.held ?? []),
    (event) => events.push(event),
    (event) => activity.push(event)
  );
  return { learn, events, activity, opened };
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

describe("indicate mode (AC-11)", () => {
  it("stays listening and emits batched activity", () => {
    vi.useFakeTimers();
    try {
      const { learn, events, activity, opened } = harness();
      expect(learn.startIndicate("Port A")).toEqual({ ok: true });

      opened[0]!.emit({ kind: "note", channel: 1, note: 10, value: 127 });
      opened[0]!.emit({ kind: "cc", channel: 1, controller: 7, value: 3 });
      expect(activity).toHaveLength(0); // batched, not immediate

      vi.advanceTimersByTime(60);
      expect(activity).toEqual([
        {
          port: "Port A",
          addresses: [
            { kind: "note", channel: 1, number: 10 },
            { kind: "cc", channel: 1, number: 7 },
          ],
        },
      ]);
      expect(learn.active).toBe(true); // continuous — session survives
      expect(events).toHaveLength(0); // no learn capture fired

      opened[0]!.emit({ kind: "pitchbend", channel: 9, value: 0 });
      vi.advanceTimersByTime(60);
      expect(activity).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the engine tap for held ports and stops cleanly", () => {
    vi.useFakeTimers();
    try {
      const { learn, activity, opened } = harness({ held: ["Held"] });
      learn.startIndicate("Held");
      expect(opened).toHaveLength(0);
      learn.onEngineInput("Held", { kind: "note", channel: 2, note: 5, value: 1 });
      vi.advanceTimersByTime(60);
      expect(activity[0]!.addresses).toEqual([{ kind: "note", channel: 2, number: 5 }]);

      learn.cancel();
      learn.onEngineInput("Held", { kind: "note", channel: 2, note: 6, value: 1 });
      vi.advanceTimersByTime(60);
      expect(activity).toHaveLength(1); // nothing after stop
      expect(learn.active).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a learn start replaces a running indicate session", () => {
    const { learn, events } = harness();
    learn.startIndicate("Port A");
    learn.start("Port A");
    expect(events).toEqual([{ status: "ended", reason: "replaced" }]);
    expect(learn.active).toBe(true);
  });
});
