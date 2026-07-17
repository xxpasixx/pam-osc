/**
 * The IPC contract between main and renderer (design → Behaviors 2).
 * Types only — importable from main, preload, and renderer alike.
 * The preload exposes exactly this surface as `window.pamOsc`.
 */

import type { ConnectionStatus, DeviceStatus, TrafficDirection } from "../core/engine/types.js";
import type { SettingsDraft } from "../core/settings/schema.js";

export type EngineState = "stopped" | "starting" | "running";

/** Traffic log categories (PAM-4 AC-5): wire directions plus engine lines. */
export type TrafficCategory = TrafficDirection | "system";

export interface TrafficEntry {
  /** Epoch ms, stamped in the main process. */
  at: number;
  category: TrafficCategory;
  /** MIDI: the unit's input port name. */
  source?: string;
  text: string;
}

/** Who holds the local OSC UDP port (PAM-4 AC-2) — v1 port diagnosis. */
export type PortDiagnosis =
  | { port: number; status: "free" }
  | { port: number; status: "self" }
  | { port: number; status: "other"; name: string; pid: number }
  | { port: number; status: "unknown" };

/** One catalog row: a mapping the user can activate (or not, if invalid). */
export interface CatalogEntry {
  id: string;
  name: string;
  /** Display name of the referenced board type (device definition). */
  boardName: string;
  origin: "bundled" | "user";
  /** Port names currently stored in the mapping file. */
  midiPort: { input: string; output?: string };
  valid: true;
}

/** A file in the mappings folder that failed validation (EC-4). */
export interface InvalidCatalogEntry {
  /** File name — the id may not be parseable. */
  file: string;
  error: string;
  valid: false;
}

export interface MidiPortList {
  inputs: string[];
  outputs: string[];
}

export interface Notice {
  severity: "error" | "warning" | "info";
  source?: string;
  message: string;
}

/** Everything the UI needs at mount, in one round trip. */
export interface Snapshot {
  settings: SettingsDraft;
  /** True when settings.json was missing (first run) or unreadable. */
  firstRun: boolean;
  catalog: CatalogEntry[];
  invalidFiles: InvalidCatalogEntry[];
  midiPorts: MidiPortList;
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  devices: DeviceStatus[];
  notices: Notice[];
  /** Recent traffic (bounded) so the log survives a renderer (re)mount. */
  traffic: TrafficEntry[];
  portDiagnosis: PortDiagnosis | undefined;
}

/** Field-level validation error, rendered inline at the causing field (AC-6). */
export interface FieldError {
  /** e.g. "console.address", "console.sendPort", "mapping:<id>.input" */
  field: string;
  message: string;
}

export type ApplyResult =
  | { ok: true; snapshot: Snapshot; notices: Notice[] }
  | { ok: false; fieldErrors: FieldError[]; notices: Notice[] };

/** The API the preload exposes on window.pamOsc. */
export interface PamOscApi {
  getSnapshot(): Promise<Snapshot>;
  listMidiPorts(): Promise<MidiPortList>;
  applySettings(draft: SettingsDraft): Promise<ApplyResult>;
  revealMappingsFolder(): Promise<void>;
  duplicateMapping(id: string): Promise<CatalogEntry | { error: string }>;
  startEngine(): Promise<{ ok: boolean; error?: string }>;
  stopEngine(): Promise<void>;
  checkConnection(): Promise<void>;
  runOutputTest(mappingId: string): Promise<{ ok: boolean; error?: string }>;
  onConnection(listener: (status: ConnectionStatus) => void): () => void;
  onDevices(listener: (statuses: DeviceStatus[]) => void): () => void;
  onEngineState(listener: (state: EngineState) => void): () => void;
  onMidiPorts(listener: (ports: MidiPortList) => void): () => void;
  onNotice(listener: (notice: Notice) => void): () => void;
  /** Batched — one call delivers up to ~100 ms of entries (EC-2). */
  onTraffic(listener: (entries: TrafficEntry[]) => void): () => void;
  onPortDiagnosis(listener: (diagnosis: PortDiagnosis | undefined) => void): () => void;
}

/** Channel names — single source for preload and main. */
export const IPC = {
  getSnapshot: "pam:getSnapshot",
  listMidiPorts: "pam:listMidiPorts",
  applySettings: "pam:applySettings",
  revealMappingsFolder: "pam:revealMappingsFolder",
  duplicateMapping: "pam:duplicateMapping",
  startEngine: "pam:startEngine",
  stopEngine: "pam:stopEngine",
  checkConnection: "pam:checkConnection",
  runOutputTest: "pam:runOutputTest",
  evConnection: "pam:ev:connection",
  evDevices: "pam:ev:devices",
  evEngineState: "pam:ev:engineState",
  evMidiPorts: "pam:ev:midiPorts",
  evNotice: "pam:ev:notice",
  evTraffic: "pam:ev:traffic",
  evPortDiagnosis: "pam:ev:portDiagnosis",
} as const;
