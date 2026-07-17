import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSocket } from "node:dgram";
import { normalizeOscPacket } from "./osc-normalize.js";
import { udpOscTransport } from "./osc-udp.js";
import { oscFloat, oscString, type OscMessage, type OscSocket } from "./osc.js";
import { FakeMA3 } from "../testing/fake-ma3.js";
import { waitFor } from "../testing/virtual-midi.js";

/** Grabs a free UDP port from the OS. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createSocket("udp4");
    probe.on("error", reject);
    probe.bind(0, () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

describe("normalizeOscPacket guards (BUG-5)", () => {
  it("returns [] for null/undefined/primitive input instead of throwing", () => {
    expect(normalizeOscPacket(null)).toEqual([]);
    expect(normalizeOscPacket(undefined)).toEqual([]);
    expect(normalizeOscPacket(42)).toEqual([]);
    expect(
      normalizeOscPacket({ oscType: "bundle", elements: [null, { oscType: "message", address: "/a", args: [] }] })
    ).toEqual([{ address: "/a", args: [] }]);
  });

  it("caps bundle recursion depth instead of blowing the stack", () => {
    let packet: unknown = { oscType: "message", address: "/deep", args: [] };
    for (let i = 0; i < 50000; i++) {
      packet = { oscType: "bundle", elements: [packet] };
    }
    expect(normalizeOscPacket(packet)).toEqual([]); // beyond the cap → dropped, no throw
  });
});

describe("udpOscTransport ↔ FakeMA3", () => {
  let localPort: number;
  let ma3: FakeMA3;
  let socket: OscSocket;
  const messages: OscMessage[] = [];
  const errors: Error[] = [];

  beforeAll(async () => {
    localPort = await freePort();
    ma3 = new FakeMA3("127.0.0.1", localPort);
    const remotePort = await ma3.start();
    socket = await udpOscTransport.open(
      { localPort, remoteAddress: "127.0.0.1", remotePort },
      (message) => messages.push(message),
      (error) => errors.push(error)
    );
  });

  afterAll(async () => {
    await socket?.close();
    await ma3?.stop();
  });

  it("sends messages the console records", async () => {
    socket.send({ address: "/Page1/Fader201", args: [oscFloat(42.5)] });
    socket.send({ address: "/cmd", args: [oscString('Quickey "pam-osc_CLEAR"')] });

    await waitFor(() => ma3.received.length >= 2);
    expect(ma3.received[0]?.address).toBe("/Page1/Fader201");
    expect(ma3.received[0]?.args[0]?.value).toBeCloseTo(42.5, 3);
    expect(ma3.commands()).toContain('Quickey "pam-osc_CLEAR"');
  });

  it("receives plugin-shaped feedback normalized", async () => {
    messages.length = 0;
    ma3.sendFader(1, 201, 55.5);
    ma3.sendButton(1, 301, true);
    ma3.sendDeskLocked(true);
    ma3.sendMasterEnabled("highlight", true);

    await waitFor(() => messages.length >= 4);
    expect(messages[0]?.address).toBe("/Page1/Fader201");
    expect(messages[0]?.args[0]?.type).toBe("float");
    expect(messages[1]?.args[0]).toEqual({ type: "string", value: "On" });
    expect(messages[2]).toEqual({ address: "/status/deskLocked", args: [{ type: "true", value: true }] });
    expect(messages[3]).toEqual({ address: "/masterEnabled/highlight", args: [{ type: "integer", value: 1 }] });
  });

  it("survives malformed packets and reports them (EC-3)", async () => {
    messages.length = 0;
    const before = errors.length;
    ma3.sendRaw(Buffer.from([0x01, 0x02, 0x03, 0x04]));
    ma3.sendFader(1, 202, 10); // proof the socket still works

    await waitFor(() => messages.length >= 1);
    expect(messages[0]?.address).toBe("/Page1/Fader202");
    expect(errors.length).toBeGreaterThan(before);
    expect(errors.at(-1)?.message).toMatch(/malformed/);
  });

  it("answers the v1 ping pair like console + plugin", async () => {
    messages.length = 0;
    socket.send({ address: "/cmd", args: [oscString("Lua '… SendOSC … connectionPong …'")] });
    socket.send({ address: "/cmd", args: [oscString(`Lua 'SetVar(GlobalVars(), "pamPing", true)'`)] });

    await waitFor(() => messages.length >= 2);
    const addresses = messages.map((message) => message.address);
    expect(addresses).toContain("/status/connectionPong");
    expect(addresses).toContain("/status/pluginPong");
  });
});
