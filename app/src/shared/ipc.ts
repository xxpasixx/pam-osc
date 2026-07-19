/**
 * The IPC contract between main and renderer (design → Behaviors 2).
 * Types only — importable from main, preload, and renderer alike.
 * The preload exposes exactly this surface as `window.pamOsc`.
 */

import type { ConnectionStatus, ConsoleState, DeviceStatus, TrafficDirection } from "../core/engine/types.js";
import type { DeviceDefinition, EditorIssue, Mapping, MappingStatus } from "../core/format/index.js";
import type { ImportSummary, V1SectionCounts } from "../core/import/index.js";
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
  /** Id of the referenced board type — groups mappings per board (PAM-11). */
  deviceDefinitionId: string;
  /** Display name of the referenced board type (device definition). */
  boardName: string;
  origin: "bundled" | "user";
  /** Maturity/provenance badge (PAM-19) — draft / community / tested. */
  status: MappingStatus;
  /** Port names currently stored in the mapping file. */
  midiPort: { input: string; output?: string };
  valid: true;
}

/** "New mapping" for a board (PAM-11 AC-2/AC-7) — starts empty. */
export interface CreateMappingRequest {
  deviceDefinitionId: string;
  name: string;
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

/** A loaded device definition, as dropdowns and the boards manager need it (PAM-5/PAM-6). */
export interface BoardInfo {
  id: string;
  name: string;
  origin: "bundled" | "user";
}

// ---- PAM-6 visual mapping editor ----

/** A mapping that references a definition/control — warnings & retarget (AC-7, AC-5). */
export interface UsageRef {
  id: string;
  name: string;
  origin: "bundled" | "user";
  active: boolean;
}

export interface ControlUsageEntry {
  controlId: string;
  mappings: UsageRef[];
}

/** Everything the editor needs to open a mapping (design → IPC contract). */
export interface MappingEditData {
  mapping: Mapping;
  device: DeviceDefinition;
  origin: "bundled" | "user";
}

/** Everything the editor needs to open a board (incl. the delete-warning data). */
export interface DeviceEditData {
  device: DeviceDefinition;
  origin: "bundled" | "user";
  usage: ControlUsageEntry[];
}

export type EditorSaveResult =
  /** `id` is the saved file's final id — differs from the draft on copy-on-edit. */
  { ok: true; id: string; snapshot: Snapshot; notices: Notice[] } | { ok: false; errors: EditorIssue[] };

export interface SaveDeviceRequest {
  draft: unknown;
  /** User mappings to point at the saved definition (copy-on-edit retarget, AC-5). */
  retargetMappingIds: string[];
  /** New board from scratch (AC-6) — a colliding id gets auto-suffixed. */
  createNew?: boolean;
}

/** Captured by MIDI learn — mirrors the device-definition address shape (AC-4). */
export type LearnedAddress =
  | { kind: "cc" | "note"; channel: number; number: number }
  | { kind: "pitchbend"; channel: number };

export type MidiLearnEvent =
  | { status: "captured"; port: string; address: LearnedAddress }
  | { status: "ended"; reason: "canceled" | "port-lost" | "replaced" };

/** Indicate mode (AC-11): one batch of raw input addresses, ≤ every 50 ms. */
export interface MidiActivityEvent {
  port: string;
  addresses: LearnedAddress[];
}

/** Result of the native "pick a v1 mapping file" dialog + shape check (PAM-5 AC-1/AC-6). */
export type PickV1FileResult =
  | { status: "canceled" }
  | { status: "ok"; filePath: string; fileName: string; counts: V1SectionCounts }
  | { status: "error"; error: string };

export interface ImportV1Request {
  /** Must be a path previously returned by pickV1MappingFile in this session. */
  filePath: string;
  deviceDefinitionId: string;
  name: string;
}

export type ImportV1Result = { ok: true; entry: CatalogEntry; summary: ImportSummary } | { ok: false; error: string };

// ---- PAM-7 sharing: single-file export/import + support package ----

/** Import outcome for a picked .mapping/.device file (AC-2/AC-9/AC-13). */
export type ImportShareResult =
  | {
      ok: true;
      kind: "mapping" | "device";
      /** Final id — differs from the file's id when a collision forced a suffix (AC-3). */
      id: string;
      name: string;
      renamed: boolean;
      /** AC-7: set when the mapping carries free-text console commands. */
      caution?: string;
    }
  | { ok: false; error: string };

export type ImportShareOutcome = { canceled: true } | ImportShareResult;

export type ExportFileResult =
  | { status: "saved"; file: string }
  | { status: "canceled" }
  | { status: "error"; error: string };

// ---- PAM-9 MA3 setup assistant ----

/** What the assistant can install into an MA3 library (AC-2). */
export type Ma3Asset = "plugin" | "osc";

/** One detected local GrandMA3/onPC installation (AC-1). */
export interface Ma3Install {
  /** The MALightingTechnology base folder that was found. */
  base: string;
  /** The plugin import folder inside it (created on install when missing). */
  pluginsDir: string;
  /** The OSC-config import folder (gma3_library/inout/osc). */
  oscDir: string;
  hasPamOsc: boolean;
  /** Version of the already-installed plugin pam-osc.xml, when readable. */
  installedVersion?: string;
  /** True when an OSC-config pam-osc.xml is already present. */
  hasOscConfig: boolean;
}

export type Ma3InstallResult =
  | { status: "installed"; target: string }
  /** A pam-osc.xml is already there and overwrite was not confirmed (AC-2). */
  | { status: "exists"; target: string; installedVersion?: string }
  /** AC-3: friendly failure carrying both the bundled source and the target for manual copying. */
  | { status: "error"; error: string; source: string; target: string };

/** Everything the setup guide needs at open (AC-1/AC-4/AC-5). */
export interface Ma3SetupInfo {
  installs: Ma3Install[];
  /** Version of the plugin the app ships. */
  bundledVersion: string | undefined;
  /** True when the app bundles an OSC-config file to install. */
  hasBundledOscConfig: boolean;
  /** Non-internal IPv4 addresses of this machine — the OSC destination IP(s). */
  localIps: string[];
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
  /** All loaded device definitions — the import dialog's board dropdown (PAM-5). */
  boards: BoardInfo[];
  midiPorts: MidiPortList;
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  devices: DeviceStatus[];
  /** DeskLock / CMD-mode / plugin protocol (PAM-12 AC-9/AC-10). */
  console: ConsoleState | undefined;
  notices: Notice[];
  /** Recent traffic (bounded) so the log survives a renderer (re)mount. */
  traffic: TrafficEntry[];
  portDiagnosis: PortDiagnosis | undefined;
  /** PAM-14: first-run wizard marker. Absent/false → the wizard auto-opens. */
  onboarding: { completed: boolean } | undefined;
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
  /** PAM-14 (AC-2): mark the setup wizard finished/skipped so it stops auto-opening. */
  setOnboardingCompleted(): Promise<void>;
  revealMappingsFolder(): Promise<void>;
  duplicateMapping(id: string): Promise<CatalogEntry | { error: string }>;
  createMapping(request: CreateMappingRequest): Promise<CatalogEntry | { error: string }>;
  pickV1MappingFile(): Promise<PickV1FileResult>;
  importV1Mapping(request: ImportV1Request): Promise<ImportV1Result>;
  getMappingForEdit(id: string): Promise<MappingEditData | { error: string }>;
  getDeviceDefinitionForEdit(id: string): Promise<DeviceEditData | { error: string }>;
  getDefinitionUsage(id: string): Promise<UsageRef[]>;
  saveMapping(draft: unknown): Promise<EditorSaveResult>;
  saveDeviceDefinition(request: SaveDeviceRequest): Promise<EditorSaveResult>;
  startMidiLearn(inputPort: string): Promise<{ ok: boolean; error?: string }>;
  cancelMidiLearn(): Promise<void>;
  startMidiIndicate(inputPort: string): Promise<{ ok: boolean; error?: string }>;
  stopMidiIndicate(): Promise<void>;
  exportMapping(id: string): Promise<ExportFileResult>;
  exportDevice(id: string): Promise<ExportFileResult>;
  importMappingFile(): Promise<ImportShareOutcome>;
  importDeviceFile(): Promise<ImportShareOutcome>;
  exportSupportPackage(): Promise<ExportFileResult>;
  getMa3Setup(): Promise<Ma3SetupInfo>;
  installMa3Asset(base: string, asset: Ma3Asset, overwrite: boolean): Promise<Ma3InstallResult>;
  revealBundledAsset(asset: Ma3Asset): Promise<void>;
  startEngine(): Promise<{ ok: boolean; error?: string }>;
  stopEngine(): Promise<void>;
  checkConnection(): Promise<void>;
  runOutputTest(mappingId: string): Promise<{ ok: boolean; error?: string }>;
  onConnection(listener: (status: ConnectionStatus) => void): () => void;
  onConsoleState(listener: (state: ConsoleState) => void): () => void;
  onDevices(listener: (statuses: DeviceStatus[]) => void): () => void;
  onEngineState(listener: (state: EngineState) => void): () => void;
  onMidiPorts(listener: (ports: MidiPortList) => void): () => void;
  onNotice(listener: (notice: Notice) => void): () => void;
  /** Batched — one call delivers up to ~100 ms of entries (EC-2). */
  onTraffic(listener: (entries: TrafficEntry[]) => void): () => void;
  onPortDiagnosis(listener: (diagnosis: PortDiagnosis | undefined) => void): () => void;
  onMidiLearn(listener: (event: MidiLearnEvent) => void): () => void;
  onMidiActivity(listener: (event: MidiActivityEvent) => void): () => void;
  /** Menu-driven imports (PAM-7 AC-14): main changed the catalog on its own. */
  onCatalogChanged(listener: (snapshot: Snapshot) => void): () => void;
}

/** Channel names — single source for preload and main. */
export const IPC = {
  getSnapshot: "pam:getSnapshot",
  listMidiPorts: "pam:listMidiPorts",
  applySettings: "pam:applySettings",
  setOnboardingCompleted: "pam:setOnboardingCompleted",
  revealMappingsFolder: "pam:revealMappingsFolder",
  duplicateMapping: "pam:duplicateMapping",
  createMapping: "pam:createMapping",
  pickV1MappingFile: "pam:pickV1MappingFile",
  importV1Mapping: "pam:importV1Mapping",
  getMappingForEdit: "pam:getMappingForEdit",
  getDeviceDefinitionForEdit: "pam:getDeviceDefinitionForEdit",
  getDefinitionUsage: "pam:getDefinitionUsage",
  saveMapping: "pam:saveMapping",
  saveDeviceDefinition: "pam:saveDeviceDefinition",
  startMidiLearn: "pam:startMidiLearn",
  cancelMidiLearn: "pam:cancelMidiLearn",
  startMidiIndicate: "pam:startMidiIndicate",
  stopMidiIndicate: "pam:stopMidiIndicate",
  exportMapping: "pam:exportMapping",
  exportDevice: "pam:exportDevice",
  importMappingFile: "pam:importMappingFile",
  importDeviceFile: "pam:importDeviceFile",
  exportSupportPackage: "pam:exportSupportPackage",
  getMa3Setup: "pam:getMa3Setup",
  installMa3Asset: "pam:installMa3Asset",
  revealBundledAsset: "pam:revealBundledAsset",
  startEngine: "pam:startEngine",
  stopEngine: "pam:stopEngine",
  checkConnection: "pam:checkConnection",
  runOutputTest: "pam:runOutputTest",
  evConnection: "pam:ev:connection",
  evConsoleState: "pam:ev:consoleState",
  evDevices: "pam:ev:devices",
  evEngineState: "pam:ev:engineState",
  evMidiPorts: "pam:ev:midiPorts",
  evNotice: "pam:ev:notice",
  evTraffic: "pam:ev:traffic",
  evPortDiagnosis: "pam:ev:portDiagnosis",
  evMidiLearn: "pam:ev:midiLearn",
  evMidiActivity: "pam:ev:midiActivity",
  evCatalogChanged: "pam:ev:catalogChanged",
} as const;
