import type { OscMessage } from "../../transports/osc.js";
import { oscString } from "../../transports/osc.js";
import type { ConnectionStatus, EngineTiming } from "./types.js";

/**
 * v1's connection check: the console echoes the connectionPong itself (works
 * without the plugin), the pam-osc Lua plugin answers the pamPing variable.
 * Evaluated after a timeout; non-connected results retry (v1 constants).
 */

const OSC_ENTRY_FALLBACK = 2;

/** Executed on the console via the Lua keyword — picks the OSC entry named
 * "pam-osc" (any line), falls back to entry 2, echoes the pong. Verbatim v1. */
const CONNECTION_PONG_LUA =
  "local n = " +
  OSC_ENTRY_FALLBACK +
  " " +
  "local ok, found = pcall(function() " +
  "for i, e in ipairs(Root().ShowData.ShowSettings.OSCData:Children()) do " +
  "if string.lower(e.name or [[]]) == [[pam-osc]] then return i end " +
  "end end) " +
  "if ok and found then n = found end " +
  'Cmd([[SendOSC ]] .. n .. [[ "/status/connectionPong,i,1"]])';

export class ConnectionChecker {
  private connectionPongReceived = false;
  private pluginPongReceived = false;
  private attempt = 0;
  private evaluateTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly sendOsc: (message: OscMessage) => void,
    private readonly timing: EngineTiming,
    private readonly emit: (status: ConnectionStatus) => void,
    private readonly log: (line: string) => void,
  ) {}

  start(): void {
    this.sendPing();
  }

  stop(): void {
    this.stopped = true;
    if (this.evaluateTimer) clearTimeout(this.evaluateTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.evaluateTimer = undefined;
    this.retryTimer = undefined;
  }

  onConnectionPong(): void {
    this.connectionPongReceived = true;
  }

  onPluginPong(): void {
    this.pluginPongReceived = true;
  }

  private sendPing(): void {
    if (this.stopped) return;
    this.connectionPongReceived = false;
    this.pluginPongReceived = false;
    this.attempt += 1;
    this.emit({ state: "checking", attempt: this.attempt, gaveUp: false });
    this.log(`checking connection to GrandMA3 (attempt ${this.attempt}) ...`);

    // v1's exact ping pair.
    this.sendOsc({ address: "/cmd", args: [oscString("Lua '" + CONNECTION_PONG_LUA + "'")] });
    this.sendOsc({ address: "/cmd", args: [oscString(`Lua 'SetVar(GlobalVars(), "pamPing", true)'`)] });

    this.evaluateTimer = setTimeout(() => this.evaluate(), this.timing.pingTimeoutMs);
  }

  private evaluate(): void {
    if (this.stopped) return;

    if (this.connectionPongReceived && this.pluginPongReceived) {
      this.emit({ state: "connected", attempt: this.attempt, gaveUp: false });
      this.log("OK — GrandMA3 is reachable and the pam-osc plugin is running");
      return; // v1 stops checking once everything is fine
    }

    const state = this.connectionPongReceived ? ("plugin-missing" as const) : ("unreachable" as const);
    const gaveUp = this.attempt >= this.timing.pingMaxRetries;
    this.emit({ state, attempt: this.attempt, gaveUp });
    this.log(
      state === "plugin-missing"
        ? "GrandMA3 is reachable, but the pam-osc plugin did not answer — start the 'pam-osc Start Stop' plugin on the console"
        : "no response from GrandMA3 — check console IP/port, the MA3 OSC settings, and your firewall",
    );

    if (!gaveUp) {
      this.retryTimer = setTimeout(() => this.sendPing(), this.timing.pingRetryMs);
    } else {
      this.log("giving up the automatic connection check — restart the engine to check again");
    }
  }
}
