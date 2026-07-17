import { afterEach, describe, expect, it, vi } from "vitest";
import { MidiPortLister } from "./midi-ports.js";

describe("MidiPortLister", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes only real changes while polling", () => {
    vi.useFakeTimers();
    let ports = { inputs: ["A"], outputs: [] as string[] };
    const changes: unknown[] = [];
    const lister = new MidiPortLister({ listPorts: () => ports }, (list) => changes.push(list), 100);
    lister.start();

    vi.advanceTimersByTime(100);
    expect(changes).toEqual([]); // unchanged — no push

    ports = { inputs: ["A", "B"], outputs: [] };
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([{ inputs: ["A", "B"], outputs: [] }]);
    lister.stop();
  });

  it("a throwing native enumeration never crashes the poll — last known list survives", () => {
    vi.useFakeTimers();
    let broken = false;
    const transport = {
      listPorts: () => {
        if (broken) throw new Error("native failure");
        return { inputs: ["A"], outputs: ["B"] };
      },
    };
    const changes: unknown[] = [];
    const lister = new MidiPortLister(transport, (list) => changes.push(list), 100);
    lister.start();
    expect(lister.current()).toEqual({ inputs: ["A"], outputs: ["B"] });

    broken = true;
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(lister.current()).toEqual({ inputs: ["A"], outputs: ["B"] }); // last known
    expect(changes).toEqual([]); // a failure is not a change

    broken = false;
    expect(lister.current()).toEqual({ inputs: ["A"], outputs: ["B"] });
    lister.stop();
  });

  it("starts empty when enumeration fails from the very first call", () => {
    const lister = new MidiPortLister(
      {
        listPorts: () => {
          throw new Error("native failure");
        },
      },
      () => {},
      100,
    );
    expect(lister.current()).toEqual({ inputs: [], outputs: [] });
  });
});
