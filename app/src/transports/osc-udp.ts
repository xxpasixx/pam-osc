import { createSocket } from "node:dgram";
import { fromBuffer, toBuffer } from "osc-min";
import type { OscMessage, OscSocket, OscTransport } from "./osc.js";
import { normalizeOscPacket } from "./osc-normalize.js";

/**
 * The production OSC transport: one UDP socket, bound to the local feedback
 * port, sending to the console — exactly the setup v1 users already have in
 * their MA3 OSC settings.
 */
export const udpOscTransport: OscTransport = {
  open(options, onMessage, onError) {
    return new Promise<OscSocket>((resolve, reject) => {
      const socket = createSocket("udp4");
      let open = false;

      socket.on("error", (error) => {
        if (!open) {
          reject(error);
          return;
        }
        onError?.(error);
      });

      socket.on("message", (data) => {
        let messages: OscMessage[];
        try {
          messages = normalizeOscPacket(fromBuffer(data));
        } catch (error) {
          // EC-3: malformed packets never crash the engine.
          onError?.(new Error(`ignoring malformed OSC packet: ${error instanceof Error ? error.message : String(error)}`));
          return;
        }
        for (const message of messages) onMessage(message);
      });

      socket.bind(options.localPort, () => {
        open = true;
        resolve({
          send(message) {
            try {
              const buffer = toBuffer(message);
              socket.send(buffer, options.remotePort, options.remoteAddress);
            } catch (error) {
              onError?.(new Error(`could not send OSC message to ${message.address}: ${error instanceof Error ? error.message : String(error)}`));
            }
          },
          close() {
            return new Promise<void>((done) => socket.close(done));
          },
        });
      });
    });
  },
};
