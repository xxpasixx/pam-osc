/**
 * The IPC contract between main and renderer (design → Behaviors 2).
 * Types only — importable from main, preload, and renderer alike.
 * The preload exposes exactly this surface as `window.pamOsc`.
 */

import type { ConnectionStatus, DeviceStatus } from "../core/engine/types.js";
import type { SettingsDraft } from "../core/settings/schema.js";

export type EngineState = "stopped" | "starting" | "running";

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
  onConnection(listener: (status: ConnectionStatus) => void): () => void;
  onDevices(listener: (statuses: DeviceStatus[]) => void): () => void;
  onEngineState(listener: (state: EngineState) => void): () => void;
  onMidiPorts(listener: (ports: MidiPortList) => void): () => void;
  onNotice(listener: (notice: Notice) => void): () => void;
}

/** Channel names — single source for preload and main. */
export const IPC = {
  getSnapshot: "pam:getSnapshot",
  listMidiPorts: "pam:listMidiPorts",
  applySettings: "pam:applySettings",
  revealMappingsFolder: "pam:revealMappingsFolder",
  duplicateMapping: "pam:duplicateMapping",
  evConnection: "pam:ev:connection",
  evDevices: "pam:ev:devices",
  evEngineState: "pam:ev:engineState",
  evMidiPorts: "pam:ev:midiPorts",
  evNotice: "pam:ev:notice",
} as const;
