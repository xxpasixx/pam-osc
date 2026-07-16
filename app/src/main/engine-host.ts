import type { ConnectionStatus, DeviceStatus, EngineConfig, EngineEvents, EngineIssue } from "../core/engine/index.js";
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
  on<E extends keyof EngineEvents>(event: E, listener: EngineEvents[E]): unknown;
}

export interface EngineHostEvents {
  onState(state: EngineState): void;
  onConnection(status: ConnectionStatus): void;
  onDevices(statuses: DeviceStatus[]): void;
  onIssue(issue: EngineIssue): void;
  onLog(line: string): void;
}

export type ApplyOutcome = { ok: true } | { ok: false; error: string; rolledBack: boolean };

export class EngineHost {
  private state: EngineState = "stopped";
  private lastGood: EngineConfig | undefined;
  private connection: ConnectionStatus | undefined;
  private devices: DeviceStatus[] = [];

  constructor(
    private readonly engine: EngineLike,
    private readonly events: EngineHostEvents,
  ) {
    engine.on("connection", (status) => {
      this.connection = status;
      this.events.onConnection(status);
    });
    engine.on("devices", (statuses) => {
      this.devices = statuses;
      this.events.onDevices(statuses);
    });
    engine.on("issue", (issue) => this.events.onIssue(issue));
    engine.on("log", (line) => this.events.onLog(line));
  }

  snapshot(): { engineState: EngineState; connection: ConnectionStatus | undefined; devices: DeviceStatus[] } {
    return { engineState: this.state, connection: this.connection, devices: this.devices };
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
    this.devices = [];
  }

  private setState(state: EngineState): void {
    if (this.state === state) return;
    this.state = state;
    this.events.onState(state);
  }
}
