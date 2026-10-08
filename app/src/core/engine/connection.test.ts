import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionChecker } from "./connection.js";
import type { ConnectionStatus } from "./types.js";

/** PAM-35 AC-8: the setup guide's quiet live re-check. */

const timing = { pingTimeoutMs: 100, pingRetryMs: 1000, pingMaxRetries: 3 };

function harness() {
  const statuses: ConnectionStatus[] = [];
  const logs: string[] = [];
  const checker = new ConnectionChecker(
    () => {},
    timing as never,
    (status) => statuses.push(status),
    (line) => logs.push(line)
  );
  return { checker, statuses, logs };
}

describe("ConnectionChecker quiet re-check", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits no 'checking' state in between — only the result", () => {
    const { checker, statuses } = harness();
    checker.checkNow({ quiet: true });
    expect(statuses).toEqual([]);
    vi.advanceTimersByTime(timing.pingTimeoutMs);
    expect(statuses.map((status) => status.state)).toEqual(["unreachable"]);
  });

  it("logs a repeated identical result only once, a change again", () => {
    const { checker, logs } = harness();
    for (let poll = 0; poll < 3; poll++) {
      checker.checkNow({ quiet: true });
      vi.advanceTimersByTime(timing.pingTimeoutMs);
    }
    expect(logs.filter((line) => line.startsWith("no response"))).toHaveLength(1);
    expect(logs.some((line) => line.startsWith("checking"))).toBe(false);

    // The console starts answering (OSC set up) → the new result is logged.
    checker.checkNow({ quiet: true });
    checker.onConnectionPong();
    vi.advanceTimersByTime(timing.pingTimeoutMs);
    expect(logs.at(-1)).toMatch(/plugin did not answer/);
  });

  it("review BUG-3: the automatic retry after a quiet check stays quiet", () => {
    const { checker, statuses, logs } = harness();
    checker.checkNow({ quiet: true });
    vi.advanceTimersByTime(timing.pingTimeoutMs); // unreachable → retry scheduled
    vi.advanceTimersByTime(timing.pingRetryMs + timing.pingTimeoutMs); // the retry runs and evaluates
    expect(statuses.some((status) => status.state === "checking")).toBe(false);
    expect(logs.some((line) => line.startsWith("checking"))).toBe(false);
  });

  it("a normal check still announces 'checking'", () => {
    const { checker, statuses, logs } = harness();
    checker.checkNow();
    expect(statuses[0]).toEqual({ state: "checking", attempt: 1, gaveUp: false });
    expect(logs[0]).toMatch(/^checking connection/);
  });
});
