import { createSocket } from "node:dgram";
import { describe, expect, it } from "vitest";
import { diagnoseUdpPort } from "./port-diagnosis.js";

/** Real lsof/netstat against real sockets — no mocks (AC-2). */
describe("diagnoseUdpPort", () => {
  it("reports a port bound by this process as self", async () => {
    const socket = createSocket("udp4");
    const port = await new Promise<number>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", () => resolve(socket.address().port));
    });
    try {
      const diagnosis = await diagnoseUdpPort(port);
      expect(diagnosis).toEqual({ port, status: "self" });
    } finally {
      socket.close();
    }
  });

  it("reports an unused port as free", async () => {
    // Bind and immediately release — whatever the OS handed out is free now.
    const socket = createSocket("udp4");
    const port = await new Promise<number>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", () => resolve(socket.address().port));
    });
    await new Promise<void>((resolve) => socket.close(() => resolve()));

    const diagnosis = await diagnoseUdpPort(port);
    expect(diagnosis).toEqual({ port, status: "free" });
  });
});
