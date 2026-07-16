import type { FormatSource } from "../format/index.js";

/** Input to start()/reconfigure(). PAM-3 will persist this as App Settings. */
export interface EngineConfig {
  consoleAddress: string;
  /** UDP port the console listens on (its OSC "port"). */
  sendPort: number;
  /** Local UDP port console feedback arrives on (the MA3 OSC destination port). */
  receivePort: number;
  /** Folders handed to the PAM-1 loader (bundled + user locations). */
  sources: FormatSource[];
  /** Mapping ids to run — two units of the same board = two mappings. */
  activeMappingIds: string[];
  /** Test/dev overrides only — production uses the v1 constants. */
  timing?: Partial<EngineTiming>;
}

export interface EngineTiming {
  pingTimeoutMs: number;
  pingRetryMs: number;
  pingMaxRetries: number;
  animationMs: number;
  animationFrameMs: number;
  hotplugPollMs: number;
  /** timecodePlayPause hold threshold — hold ≥ this sends Off. */
  holdOffMs: number;
}

/** The v1 constants — bit-parity with the Open Stage Control module. */
export const DEFAULT_TIMING: EngineTiming = {
  pingTimeoutMs: 3000,
  pingRetryMs: 30000,
  pingMaxRetries: 20,
  animationMs: 3500,
  animationFrameMs: 50,
  hotplugPollMs: 2000,
  holdOffMs: 500,
};

export type ConnectionState = "checking" | "connected" | "plugin-missing" | "unreachable";

export interface ConnectionStatus {
  state: ConnectionState;
  /** 1-based check attempt; retries stop after timing.pingMaxRetries. */
  attempt: number;
  gaveUp: boolean;
}

export interface DeviceStatus {
  mappingId: string;
  inputPort: string;
  outputPort: string | undefined;
  state: "bound" | "missing";
}

/** Superset of the PAM-1 FormatIssue — the engine adds runtime problems. */
export interface EngineIssue {
  severity: "error" | "warning" | "info";
  /** File path for format issues, mapping id for runtime issues. */
  source?: string;
  message: string;
}

export interface EngineEvents {
  connection: (status: ConnectionStatus) => void;
  devices: (statuses: DeviceStatus[]) => void;
  issue: (issue: EngineIssue) => void;
  log: (line: string) => void;
}
