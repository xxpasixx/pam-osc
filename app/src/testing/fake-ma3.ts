import { createSocket, type Socket } from "node:dgram";
import { fromBuffer, toBuffer } from "osc-min";
import { normalizeOscPacket } from "../transports/osc-normalize.js";
import type { OscArgument, OscMessage } from "../transports/osc.js";

/**
 * Fake GrandMA3: a UDP socket that records every OSC message the engine
 * sends and can replay console feedback in the exact shapes the pam-osc Lua
 * plugin produces (see pam-OSC.lua: Fader ,f / Button ,s "On"/"Off" /
 * Color ,s "r;g;b;a" / Name ,s "seq;cue" / masterEnabled ,i / Timecode ,s /
 * deskLocked ,T/,F / pongs ,i).
 */
export class FakeMA3 {
  /** Everything the engine sent, in arrival order. */
  readonly received: OscMessage[] = [];

  /** Configure what the "console" answers to the connection check. */
  consoleReachable = true;
  pluginRunning = true;
  /** Protocol version the plugin pong reports (PAM-12 AC-7); set to 1 to fake the v1 plugin. */
  pluginProtocol = 2;
  /** CMD mode: ack pamCmdKey presses automatically via /status/cmdKeyDone (PAM-12 AC-11). */
  autoAckCmdKeys = true;
  /** Every executor number received via a pamCmdKey SetVar, in arrival order. */
  readonly cmdKeyPresses: number[] = [];

  private socket: Socket | undefined;
  private port = 0;

  constructor(
    private readonly engineHost: string,
    private readonly enginePort: number
  ) {}

  /** Binds an ephemeral UDP port; returns it (= the engine's sendPort). */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = createSocket("udp4");
      socket.on("error", reject);
      socket.on("message", (data) => {
        for (const message of normalizeOscPacket(fromBuffer(data))) {
          this.received.push(message);
          this.answerPings(message);
        }
      });
      socket.bind(0, () => {
        this.socket = socket;
        this.port = socket.address().port;
        resolve(this.port);
      });
    });
  }

  /** The console echoes the connection pong itself; the plugin answers the pamPing variable. */
  private answerPings(message: OscMessage): void {
    if (message.address !== "/cmd") return;
    const command = message.args[0]?.type === "string" ? message.args[0].value : "";
    if (!this.consoleReachable) return;
    if (command.includes("connectionPong")) {
      this.send("/status/connectionPong", [{ type: "integer", value: 1 }]);
    }
    if (command.includes('"pamPing"') && this.pluginRunning) {
      this.send("/status/pluginPong", [{ type: "integer", value: this.pluginProtocol }]);
    }
    // Plugin v2 consumes pamCmdKey and acks after executing (PAM-12).
    const cmdKey = command.match(/"pamCmdKey", (\d+)/);
    if (cmdKey?.[1] && this.pluginRunning) {
      const executor = Number.parseInt(cmdKey[1], 10);
      this.cmdKeyPresses.push(executor);
      if (this.autoAckCmdKeys) {
        this.send("/status/cmdKeyDone", [{ type: "integer", value: executor }]);
      }
    }
  }

  send(address: string, args: OscArgument[] = []): void {
    if (!this.socket) throw new Error("FakeMA3 not started");
    this.socket.send(toBuffer({ address, args }), this.enginePort, this.engineHost);
  }

  /** Raw bytes — for malformed-packet tests (EC-3). */
  sendRaw(bytes: Buffer): void {
    if (!this.socket) throw new Error("FakeMA3 not started");
    this.socket.send(bytes, this.enginePort, this.engineHost);
  }

  // ---- feedback in the plugin's exact wire shapes ----

  sendFader(page: number, executor: number, value: number): void {
    this.send(`/Page${page}/Fader${executor}`, [{ type: "float", value }]);
  }
  sendButton(page: number, executor: number, on: boolean): void {
    this.send(`/Page${page}/Button${executor}`, [{ type: "string", value: on ? "On" : "Off" }]);
  }
  sendColor(page: number, executor: number, color: string): void {
    this.send(`/Page${page}/Color${executor}`, [{ type: "string", value: color }]);
  }
  sendName(page: number, executor: number, name: string): void {
    this.send(`/Page${page}/Name${executor}`, [{ type: "string", value: name }]);
  }
  sendMasterEnabled(name: string, enabled: boolean): void {
    this.send(`/masterEnabled/${name}`, [{ type: "integer", value: enabled ? 1 : 0 }]);
  }
  sendPage(page: number): void {
    this.send("/updatePage/current", [{ type: "integer", value: page }]);
  }
  sendDeskLocked(locked: boolean): void {
    this.send("/status/deskLocked", [locked ? { type: "true", value: true } : { type: "false", value: false }]);
  }
  /** Plugin v2 command-line flags (PAM-12 AC-1): 0 clears, nonzero intercepts. */
  sendCmdFlags(flags: number): void {
    this.send("/status/cmdFlags", [{ type: "integer", value: flags }]);
  }
  sendCmdKeyDone(executor: number): void {
    this.send("/status/cmdKeyDone", [{ type: "integer", value: executor }]);
  }
  sendTimecode(slot: number, time: string): void {
    this.send(`/Timecode${slot}`, [{ type: "string", value: time }]);
  }
  sendTimecodeRunning(slot: number, running: boolean): void {
    this.send(`/14.${slot}`, [{ type: "string", value: running ? "Go+" : "Pause" }]);
  }

  /** Commands sent to the MA3 command line (the `/cmd` messages). */
  commands(): string[] {
    return this.received
      .filter((message) => message.address === "/cmd")
      .map((message) => (message.args[0]?.type === "string" ? message.args[0].value : ""));
  }

  clearReceived(): void {
    this.received.length = 0;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve();
      this.socket.close(() => resolve());
      this.socket = undefined;
    });
  }
}
