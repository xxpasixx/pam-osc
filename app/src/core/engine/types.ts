import type { FormatSource } from "../format/index.js";
import type { MidiInputEvent } from "../../transports/midi.js";

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
  /** PAM-16 global fixed executor page (1..9999); undefined = follow current page. */
  fixedPage?: number;
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
  /** CMD-mode press queue: wait this long for the plugin ack before advancing (PAM-12 AC-11). */
  cmdAckTimeoutMs: number;
  /** PAM-16 config handshake heartbeat: re-send pamConfig+forceReload this often (AC-3). */
  configHeartbeatMs: number;
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
  cmdAckTimeoutMs: 300,
  configHeartbeatMs: 30000,
};

/**
 * Plugin protocol this app speaks (PAM-12 AC-7). The pong carries the
 * plugin's version; anything else is reported as "plugin-outdated" and CMD
 * mode stays off. The v1 plugin answered 1.
 */
export const EXPECTED_PLUGIN_PROTOCOL = 2;

export type ConnectionState = "checking" | "connected" | "plugin-missing" | "plugin-outdated" | "unreachable";

export interface ConnectionStatus {
  state: ConnectionState;
  /** 1-based check attempt; retries stop after timing.pingMaxRetries. */
  attempt: number;
  gaveUp: boolean;
  /** Version the plugin pong reported — set once a pong arrived (PAM-12 AC-7). */
  pluginProtocol?: number;
}

/** Live console state mirrored for the UI (PAM-12 AC-9/AC-10) — never persisted. */
export interface ConsoleState {
  deskLocked: boolean;
  /** /status/cmdFlags bitmask; nonzero = executor buttons currently target. */
  cmdFlags: number;
  pluginProtocol: number | undefined;
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

/** One wire message crossing the engine boundary (PAM-4 AC-5). */
export type TrafficDirection = "midi-in" | "midi-out" | "osc-in" | "osc-out";

export interface TrafficEvent {
  direction: TrafficDirection;
  /** MIDI: the unit's input port name. OSC traffic has no per-unit source. */
  source?: string;
  text: string;
}

export interface EngineEvents {
  connection: (status: ConnectionStatus) => void;
  devices: (statuses: DeviceStatus[]) => void;
  issue: (issue: EngineIssue) => void;
  log: (line: string) => void;
  traffic: (event: TrafficEvent) => void;
  /** Raw pass-through of every MIDI input event — the PAM-6 learn tap (AC-4). */
  midiInput: (port: string, event: MidiInputEvent) => void;
  /** DeskLock / CMD-mode / plugin-protocol changes (PAM-12 AC-9/AC-10). */
  console: (state: ConsoleState) => void;
}
