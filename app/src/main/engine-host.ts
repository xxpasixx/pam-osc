import type {
  ConnectionStatus,
  ConsoleState,
  DeviceStatus,
  EngineConfig,
  EngineEvents,
  EngineIssue,
  TrafficEvent,
} from "../core/engine/index.js";
import type { MidiInputEvent } from "../transports/midi.js";
import type { EngineState } from "../shared/ipc.js";

/**
 * Owns the PAM-2 engine inside the main process (design → Engine host):
 * auto-start, the apply transaction's engine step with rollback to the
 * last-known-good config (EC-3), event forwarding, and the latest status
 * for snapshots. Takes an Engine-shaped object so tests can inject a double.
 */

export interface EngineLike {
  start(config: EngineConfig): Promise<void>;
  stop(): Promise<void>;
  checkConnection(): void;
  outputTest(mappingId: string): { ok: true } | { ok: false; error: string };
  on<E extends keyof EngineEvents>(event: E, listener: EngineEvents[E]): unknown;
}

export interface EngineHostEvents {
  onState(state: EngineState): void;
  onConnection(status: ConnectionStatus): void;
  /** DeskLock / CMD-mode / plugin protocol changed (PAM-12 AC-9/AC-10). */
  onConsoleState(state: ConsoleState): void;
  onDevices(statuses: DeviceStatus[]): void;
  onIssue(issue: EngineIssue): void;
  onLog(line: string): void;
  onTraffic(event: TrafficEvent): void;
  /** Raw MIDI input pass-through — feeds the PAM-6 learn session (AC-4). */
  onMidiInput(port: string, event: MidiInputEvent): void;
}

export type ApplyOutcome = { ok: true } | { ok: false; error: string; rolledBack: boolean };

export class EngineHost {
  private state: EngineState = "stopped";
  private lastGood: EngineConfig | undefined;
  private connection: ConnectionStatus | undefined;
  private consoleState: ConsoleState | undefined;
  private devices: DeviceStatus[] = [];

  constructor(
    private readonly engine: EngineLike,
    private readonly events: EngineHostEvents
  ) {
    engine.on("connection", (status) => {
      this.connection = status;
      this.events.onConnection(status);
    });
    engine.on("console", (state) => {
      this.consoleState = state;
      this.events.onConsoleState(state);
    });
    engine.on("devices", (statuses) => {
      this.devices = statuses;
      this.events.onDevices(statuses);
    });
    engine.on("issue", (issue) => this.events.onIssue(issue));
    engine.on("log", (line) => this.events.onLog(line));
    engine.on("traffic", (event) => this.events.onTraffic(event));
    engine.on("midiInput", (port, event) => this.events.onMidiInput(port, event));
  }

  /** Input ports the running engine currently holds open (learn tap decision). */
  boundInputPorts(): Set<string> {
    if (this.state !== "running") return new Set();
    return new Set(this.devices.filter((device) => device.state === "bound").map((device) => device.inputPort));
  }

  snapshot(): {
    engineState: EngineState;
    connection: ConnectionStatus | undefined;
    console: ConsoleState | undefined;
    devices: DeviceStatus[];
  } {
    return { engineState: this.state, connection: this.connection, console: this.consoleState, devices: this.devices };
  }

  /** Startup (AC-4): start with the persisted config; failure is a notice, not a crash. */
  async autoStart(config: EngineConfig): Promise<string | undefined> {
    try {
      await this.startWith(config);
      return undefined;
    } catch (error) {
      this.setState("stopped");
      return error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * The apply transaction's engine step (design → Save transaction 3+4):
   * reconfigure to the new config; on total failure roll back to the
   * last-known-good config so the previous working state keeps running.
   * `config` undefined = empty active list → engine intentionally stopped.
   */
  async apply(config: EngineConfig | undefined): Promise<ApplyOutcome> {
    if (!config) {
      await this.stopEngine();
      this.lastGood = undefined;
      return { ok: true };
    }

    try {
      await this.stopEngine();
      await this.startWith(config);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState("stopped");
      if (this.lastGood) {
        try {
          await this.startWith(this.lastGood);
          return { ok: false, error: message, rolledBack: true };
        } catch {
          this.setState("stopped");
        }
      }
      return { ok: false, error: message, rolledBack: false };
    }
  }

  /** Manual stop (PAM-4 AC-6) — lastGood stays, so Start can resume. */
  async stop(): Promise<void> {
    await this.stopEngine();
  }

  /** Manual re-check passthrough (PAM-4 AC-3) — no-op while stopped. */
  checkConnection(): void {
    if (this.state !== "running") return;
    this.engine.checkConnection();
  }

  /** On-demand output test passthrough (PAM-4 AC-4). */
  outputTest(mappingId: string): { ok: true } | { ok: false; error: string } {
    if (this.state !== "running") return { ok: false, error: "engine is not running" };
    return this.engine.outputTest(mappingId);
  }

  async shutdown(): Promise<void> {
    await this.stopEngine();
  }

  private async startWith(config: EngineConfig): Promise<void> {
    this.setState("starting");
    this.resetLiveStatus();
    await this.engine.start(config);
    this.lastGood = config;
    this.setState("running");
  }

  private async stopEngine(): Promise<void> {
    await this.engine.stop();
    this.resetLiveStatus();
    this.setState("stopped");
  }

  private resetLiveStatus(): void {
    this.connection = undefined;
    this.consoleState = undefined;
    this.devices = [];
  }

  private setState(state: EngineState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.onState(state);
  }
}
