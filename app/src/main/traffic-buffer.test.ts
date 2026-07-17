import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficBuffer } from "./traffic-buffer.js";
import type { TrafficEntry } from "../shared/ipc.js";

const entry = (n: number): TrafficEntry => ({ at: n, category: "midi-in", text: `msg ${n}` });

describe("TrafficBuffer (AC-5, EC-2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("batches pushes into one flush per window", () => {
    const batches: TrafficEntry[][] = [];
    const buffer = new TrafficBuffer((batch) => batches.push(batch), 500, 100);

    buffer.push(entry(1));
    buffer.push(entry(2));
    buffer.push(entry(3));
    expect(batches).toHaveLength(0); // nothing before the window closes

    vi.advanceTimersByTime(100);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.map((e) => e.at)).toEqual([1, 2, 3]);

    buffer.push(entry(4));
    vi.advanceTimersByTime(100);
    expect(batches).toHaveLength(2);
    expect(batches[1]?.map((e) => e.at)).toEqual([4]);
  });

  it("caps the retained tail at the capacity, dropping oldest first", () => {
    const buffer = new TrafficBuffer(() => {}, 3, 100);
    for (let n = 1; n <= 5; n += 1) buffer.push(entry(n));
    expect(buffer.recent().map((e) => e.at)).toEqual([3, 4, 5]);
  });

  it("stop() cancels a pending flush", () => {
    const batches: TrafficEntry[][] = [];
    const buffer = new TrafficBuffer((batch) => batches.push(batch), 500, 100);
    buffer.push(entry(1));
    buffer.stop();
    vi.advanceTimersByTime(500);
    expect(batches).toHaveLength(0);
    expect(buffer.recent()).toHaveLength(1); // the tail survives for snapshots
  });
});
