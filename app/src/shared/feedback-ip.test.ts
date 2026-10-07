import { describe, expect, it } from "vitest";
import { isThisComputer, pickFeedbackIp, resolveFeedbackIp, type LocalAddress } from "./feedback-ip.js";

/** PAM-35 AC-5 / EC-2: which address the console sends feedback to. */

const wifi: LocalAddress = { address: "192.168.1.20", netmask: "255.255.255.0" };
const lightingLan: LocalAddress = { address: "2.0.0.10", netmask: "255.0.0.0" };

describe("pickFeedbackIp", () => {
  it("uses loopback when the console runs on this computer", () => {
    for (const address of ["127.0.0.1", "localhost", "127.0.1.1", " LOCALHOST "]) {
      expect(pickFeedbackIp(address, [wifi, lightingLan])).toEqual({
        ip: "127.0.0.1",
        candidates: ["127.0.0.1"],
        reason: "this-computer",
      });
    }
  });

  it("picks the one address on the console's subnet", () => {
    expect(pickFeedbackIp("2.0.0.1", [wifi, lightingLan])).toEqual({
      ip: "2.0.0.10",
      candidates: ["192.168.1.20", "2.0.0.10"],
      reason: "subnet",
    });
  });

  it("flags several same-subnet addresses as ambiguous (preselected, never silent)", () => {
    const second = { address: "192.168.1.21", netmask: "255.255.255.0" };
    expect(pickFeedbackIp("192.168.1.50", [wifi, second]).reason).toBe("ambiguous");
  });

  it("flags an IPv4 console outside all of our subnets (check the IP or pick the address)", () => {
    expect(pickFeedbackIp("10.1.1.1", [wifi, lightingLan])).toMatchObject({
      ip: "192.168.1.20",
      reason: "no-subnet-match",
    });
  });

  it("falls back to the only address, else ambiguous, else none (EC-2: hostname)", () => {
    expect(pickFeedbackIp("console.local", [wifi])).toMatchObject({ ip: "192.168.1.20", reason: "single" });
    expect(pickFeedbackIp("console.local", [wifi, lightingLan])).toMatchObject({
      ip: "192.168.1.20",
      reason: "ambiguous",
    });
    expect(pickFeedbackIp("10.1.1.1", [])).toEqual({ ip: undefined, candidates: [], reason: "none" });
  });
});

describe("resolveFeedbackIp", () => {
  const pick = pickFeedbackIp("console.local", [wifi, lightingLan]);
  it("prefers the user's choice while it is a candidate", () => {
    expect(resolveFeedbackIp(pick, "2.0.0.10")).toBe("2.0.0.10");
  });
  it("ignores a stale choice", () => {
    expect(resolveFeedbackIp(pick, "10.9.9.9")).toBe("192.168.1.20");
    expect(resolveFeedbackIp(pick, undefined)).toBe("192.168.1.20");
  });
});

describe("isThisComputer", () => {
  it("does not treat LAN addresses as local", () => {
    expect(isThisComputer("192.168.1.20")).toBe(false);
    expect(isThisComputer("::1")).toBe(true);
  });
});
