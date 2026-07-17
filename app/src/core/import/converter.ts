import type { Control, DeviceDefinition } from "../format/device-definition.js";
import type { Action, Assignment, Feedback, Mapping } from "../format/mapping.js";
import type { V1File, V1Section, V1SectionCounts } from "./v1-reader.js";
import { V1_SECTION_KEYS } from "./v1-reader.js";

/**
 * Converts a v1 mapping to a v2 Mapping against a user-chosen device
 * definition (PAM-5 AC-3/AC-4/AC-5). Every v1 entry either becomes an
 * assignment or produces exactly one warning — zero silent drops. Feedback
 * mapper JS is pattern-matched as text, never executed.
 */

export type ImportWarningKind =
  | "unmatched-control"
  | "duplicate-target"
  | "unrecognized-feedback"
  | "invalid-value"
  | "unknown-key";

export interface ImportWarning {
  kind: ImportWarningKind;
  text: string;
}

export interface ImportSummary {
  converted: number;
  convertedBySection: V1SectionCounts;
  warnings: ImportWarning[];
}

export interface ConvertV1Input {
  v1: V1File;
  device: DeviceDefinition;
  /** Unique, kebab-case — see makeUniqueId. */
  id: string;
  name: string;
  sourceFileName: string;
  /** ISO date (YYYY-MM-DD) — passed in so the converter stays pure. */
  date: string;
}

/** The one function shape v1 ever generated for buttonFeedbackMapper. */
const V1_MAPPER_PATTERN =
  /^\s*function\s*\(\s*value\s*\)\s*\{\s*if\s*\(\s*value\s*==\s*['"]On['"]\s*\)\s*\{\s*return\s+(\d+)\s*;?\s*\}\s*if\s*\(\s*value\s*==\s*['"]Off['"]\s*\)\s*\{\s*return\s+(\d+)\s*;?\s*\}\s*return\s+\d+\s*;?\s*\}\s*$/;

/**
 * The known v1 mapper is ~90 chars; even with generous whitespace it stays
 * well under this. Anything longer cannot be the pattern, so we reject it
 * before `.exec()` — the pattern's adjacent `\s*;?\s*` groups backtrack
 * quadratically, and mapper strings come from untrusted shared files, so a
 * megabyte-long value would otherwise freeze the main process (ReDoS).
 */
const MAX_MAPPER_LENGTH = 300;

/** Per-entry keys that are hardware facts in v2 — dropped without a warning. */
const HARDWARE_ENTRY_KEYS = new Set([
  "posFrom",
  "posTo",
  "negFrom",
  "negTo",
  "returnChannel",
  "returnFrom",
  "returnTo",
  "currValue",
  "midiChannel",
]);

const ACTION_ENTRY_KEYS = new Set([
  "exec",
  "cmd",
  "quicKey",
  "attribute",
  "local",
  "timecodeSelect",
  "timecodePlayPause",
]);

const OTHER_ENTRY_KEYS = new Set(["minValue", "amount", "buttonFeedbackMapper", "permanentFeedback"]);

export function makeUniqueId(name: string, taken: ReadonlySet<string>, fallback = "mapping"): string {
  // BUG-6 (PAM-11 review): a name with no usable characters gets a neutral
  // fallback; the v1 import passes its own so imported files stay traceable.
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function convertV1(input: ConvertV1Input): { mapping: Mapping; summary: ImportSummary } {
  const { v1, device } = input;
  const warnings: ImportWarning[] = [];
  const warn = (kind: ImportWarningKind, text: string) => warnings.push({ kind, text });

  for (const key of v1.unknownKeys) {
    warn("unknown-key", `unknown key "${key}" ignored`);
  }

  let enableTimecodeSend = false;
  if (typeof v1.enableTimecodeSend === "boolean") {
    enableTimecodeSend = v1.enableTimecodeSend;
  } else if (v1.enableTimecodeSend !== undefined) {
    warn("invalid-value", `enableTimecodeSend is not true/false — treated as false`);
  }

  const lookup = buildControlLookup(device);
  const assignments: Assignment[] = [];
  const assignedBy = new Map<string, string>();
  const convertedBySection = Object.fromEntries(V1_SECTION_KEYS.map((key) => [key, 0])) as V1SectionCounts;

  const add = (section: V1Section, source: string, control: Control, assignment: Assignment) => {
    const earlier = assignedBy.get(control.id);
    if (earlier !== undefined) {
      warn("duplicate-target", `${source}: control "${control.id}" is already assigned by ${earlier} — skipped`);
      return;
    }
    assignedBy.set(control.id, source);
    assignments.push(assignment);
    convertedBySection[section] += 1;
  };

  // Section order is the tie-break for duplicate targets (design): control,
  // pitch, note, rltvControl, display — first wins.

  for (const [key, value] of Object.entries(v1.sections.control)) {
    const source = `control ${key}`;
    const cc = toInt(key);
    if (cc === undefined || cc < 0 || cc > 127) {
      warn("invalid-value", `${source}: "${key}" is not a CC number (0–127) — skipped`);
      continue;
    }
    const executor = toExecutorNumber(value);
    if (executor === undefined) {
      warn("invalid-value", `${source}: "${String(value)}" is not an executor number (1–9999) — skipped`);
      continue;
    }
    const control = lookup.byCc.get(cc);
    if (!control) {
      warn("unmatched-control", `${source}: no control with CC ${cc} on "${device.name}" — skipped`);
      continue;
    }
    const action: Action = { type: "executor", number: executor };
    add("control", source, control, {
      controlId: control.id,
      action,
      feedback: deriveFeedback(control, action, {}, v1.fileMapper, source, warn),
    });
  }

  for (const [key, value] of Object.entries(v1.sections.pitch)) {
    const source = `pitch ${key}`;
    const channel = toInt(key);
    if (channel === undefined || channel < 1 || channel > 16) {
      warn("invalid-value", `${source}: "${key}" is not a MIDI channel (1–16) — skipped`);
      continue;
    }
    const executor = toExecutorNumber(value);
    if (executor === undefined) {
      warn("invalid-value", `${source}: "${String(value)}" is not an executor number (1–9999) — skipped`);
      continue;
    }
    const control = lookup.byPitchChannel.get(channel);
    if (!control) {
      warn("unmatched-control", `${source}: no pitchbend control on channel ${channel} on "${device.name}" — skipped`);
      continue;
    }
    const action: Action = { type: "executor", number: executor };
    add("pitch", source, control, {
      controlId: control.id,
      action,
      feedback: deriveFeedback(control, action, {}, v1.fileMapper, source, warn),
    });
  }

  for (const [key, value] of Object.entries(v1.sections.note)) {
    const source = `note ${key}`;
    const note = toInt(key);
    if (note === undefined || note < 0 || note > 127) {
      warn("invalid-value", `${source}: "${key}" is not a note number (0–127) — skipped`);
      continue;
    }
    const entry = asEntryObject(value, source, warn);
    if (!entry) continue;
    const control = lookup.byNote.get(note);
    const pushOwner = control ? undefined : lookup.pushByNote.get(note);
    if (!control && !pushOwner) {
      warn("unmatched-control", `${source}: no control with note ${note} on "${device.name}" — skipped`);
      continue;
    }
    const converted = convertEntry(entry, source, warn);
    if (!converted) continue;
    if (control) {
      add("note", source, control, {
        controlId: control.id,
        action: converted.action,
        ...(converted.options ? { options: converted.options } : {}),
        feedback: deriveFeedback(control, converted.action, entry, v1.fileMapper, source, warn),
      });
      continue;
    }
    // The note belongs to a composite push-encoder (PAM-1 AC-7): convert to
    // part "push". Feedback derives from a button view of the push declaration.
    const owner = pushOwner!;
    if (owner.type !== "encoder" || !owner.capabilities.push) continue; // lookup guarantees; guard
    const pushView: Control = {
      id: `${owner.id}#push`,
      type: "button",
      midi: owner.capabilities.push.midi,
      position: owner.position,
      capabilities: { led: owner.capabilities.push.led },
    };
    add("note", source, pushView, {
      controlId: owner.id,
      part: "push",
      action: converted.action,
      ...(converted.options ? { options: converted.options } : {}),
      feedback: deriveFeedback(pushView, converted.action, entry, v1.fileMapper, source, warn),
    });
  }

  for (const [key, value] of Object.entries(v1.sections.rltvControl)) {
    const source = `rltvControl ${key}`;
    const cc = toInt(key);
    if (cc === undefined || cc < 0 || cc > 127) {
      warn("invalid-value", `${source}: "${key}" is not a CC number (0–127) — skipped`);
      continue;
    }
    const entry = asEntryObject(value, source, warn);
    if (!entry) continue;
    const control = lookup.encoderByCc.get(cc);
    if (!control) {
      warn("unmatched-control", `${source}: no encoder with CC ${cc} on "${device.name}" — skipped`);
      continue;
    }
    const converted = convertEntry(entry, source, warn);
    if (!converted) continue;
    add("rltvControl", source, control, {
      controlId: control.id,
      action: converted.action,
      ...(converted.options ? { options: converted.options } : {}),
      feedback: deriveFeedback(control, converted.action, entry, v1.fileMapper, source, warn),
    });
  }

  for (const [key, value] of Object.entries(v1.sections.display)) {
    const source = `display ${key}`;
    const index = toInt(key);
    if (index === undefined || index < 0) {
      warn("invalid-value", `${source}: "${key}" is not a display index — skipped`);
      continue;
    }
    const executor = toExecutorNumber(value);
    if (executor === undefined) {
      warn("invalid-value", `${source}: "${String(value)}" is not an executor number (1–9999) — skipped`);
      continue;
    }
    const control = lookup.displayByIndex.get(index);
    if (!control) {
      warn("unmatched-control", `${source}: no display with index ${index} on "${device.name}" — skipped`);
      continue;
    }
    add("display", source, control, {
      controlId: control.id,
      action: { type: "display", number: executor },
      feedback: { type: "none" },
    });
  }

  const converted = assignments.length;
  const notes = [
    `Imported from v1 file "${input.sourceFileName}" on ${input.date}.`,
    ...(warnings.length > 0 ? ["", "Import warnings:", ...warnings.map((warning) => `- ${warning.text}`)] : []),
  ].join("\n");

  const mapping: Mapping = {
    formatVersion: 1,
    id: input.id,
    name: input.name,
    notes,
    deviceDefinitionId: device.id,
    midiPort: hasFeedbackCapability(device) ? { input: device.name, output: device.name } : { input: device.name },
    enableTimecodeSend,
    assignments,
  };

  return { mapping, summary: { converted, convertedBySection, warnings } };
}

// ---- entry conversion ----

interface ConvertedEntry {
  action: Action;
  options?: { minValue?: number; amount?: number };
}

function asEntryObject(
  value: unknown,
  source: string,
  warn: (kind: ImportWarningKind, text: string) => void
): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  warn("invalid-value", `${source}: entry is not an object — skipped`);
  return undefined;
}

function convertEntry(
  entry: Record<string, unknown>,
  source: string,
  warn: (kind: ImportWarningKind, text: string) => void
): ConvertedEntry | undefined {
  for (const key of Object.keys(entry)) {
    if (!ACTION_ENTRY_KEYS.has(key) && !OTHER_ENTRY_KEYS.has(key) && !HARDWARE_ENTRY_KEYS.has(key)) {
      warn("unknown-key", `${source}: unknown key "${key}" ignored`);
    }
  }

  // "attribute" alone is an action; together with local:"attribute" it is
  // that modifier's parameter — count them as one action either way.
  const actionKeys = [...ACTION_ENTRY_KEYS].filter((key) => key in entry);
  const distinctActions = actionKeys.filter((key) => !(key === "attribute" && "local" in entry));
  if (distinctActions.length === 0) {
    warn(
      "invalid-value",
      `${source}: no recognizable action (expected one of exec, cmd, quicKey, attribute, local, timecodeSelect, timecodePlayPause) — skipped`
    );
    return undefined;
  }
  if (distinctActions.length > 1) {
    warn("invalid-value", `${source}: conflicting actions (${distinctActions.join(", ")}) — skipped`);
    return undefined;
  }

  const action = convertAction(entry, distinctActions[0]!, source, warn);
  if (!action) return undefined;

  const options: { minValue?: number; amount?: number } = {};
  if ("minValue" in entry) {
    const minValue = toInt(entry["minValue"]);
    if (minValue === undefined || minValue < 0 || minValue > 127) {
      warn("invalid-value", `${source}: minValue "${String(entry["minValue"])}" is not 0–127 — skipped`);
      return undefined;
    }
    options.minValue = minValue;
  }
  if ("amount" in entry) {
    const amount = typeof entry["amount"] === "number" ? entry["amount"] : undefined;
    if (amount === undefined || !(amount > 0) || amount > 1000) {
      warn(
        "invalid-value",
        `${source}: amount "${String(entry["amount"])}" is not a number between 0 and 1000 — skipped`
      );
      return undefined;
    }
    options.amount = amount;
  }

  return { action, ...(Object.keys(options).length > 0 ? { options } : {}) };
}

function convertAction(
  entry: Record<string, unknown>,
  key: string,
  source: string,
  warn: (kind: ImportWarningKind, text: string) => void
): Action | undefined {
  const invalid = (detail: string): undefined => {
    warn("invalid-value", `${source}: ${detail} — skipped`);
    return undefined;
  };

  switch (key) {
    case "exec": {
      const number = toExecutorNumber(entry["exec"]);
      return number === undefined
        ? invalid(`exec "${String(entry["exec"])}" is not an executor number (1–9999)`)
        : { type: "executor", number };
    }
    case "cmd": {
      const command = entry["cmd"];
      return typeof command === "string" && command.length > 0
        ? { type: "command", command }
        : invalid(`cmd is not a non-empty text`);
    }
    case "quicKey": {
      const quicKey = entry["quicKey"];
      return typeof quicKey === "string" && quicKey.length > 0
        ? { type: "quickKey", key: quicKey }
        : invalid(`quicKey is not a non-empty text`);
    }
    case "attribute": {
      const attribute = entry["attribute"];
      return typeof attribute === "string" && attribute.length > 0
        ? { type: "attribute", attribute }
        : invalid(`attribute is not a non-empty text`);
    }
    case "local": {
      const local = entry["local"];
      if (local === "encoderFine" || local === "encoderRough") {
        return { type: "modifier", modifier: local };
      }
      if (local === "attribute") {
        const attribute = entry["attribute"];
        return typeof attribute === "string" && attribute.length > 0
          ? { type: "modifier", modifier: "attributeSelect", attribute }
          : invalid(`local "attribute" needs an attribute name`);
      }
      return invalid(`local "${String(local)}" is not one of encoderFine, encoderRough, attribute`);
    }
    case "timecodeSelect": {
      const slot = entry["timecodeSelect"];
      if (slot === true) return { type: "timecodeSelect" }; // cycles 0–8, v1 behavior
      const slotNumber = toInt(slot);
      return slotNumber !== undefined && slotNumber >= 1 && slotNumber <= 8
        ? { type: "timecodeSelect", slot: slotNumber }
        : invalid(`timecodeSelect "${String(slot)}" is neither true nor a slot 1–8`);
    }
    case "timecodePlayPause": {
      return entry["timecodePlayPause"] === true
        ? { type: "timecodePlayPause" }
        : invalid(`timecodePlayPause is not true`);
    }
    default:
      return invalid(`unsupported action "${key}"`);
  }
}

// ---- feedback derivation (design order; capability-guarded so the result
// ---- always passes the loader's compatibility rules) ----

/**
 * Button actions the engine mirrors state for (executor state, MA3 master
 * state, local modifier state) — matching v1: stateless triggers (quickKey,
 * timecodeSelect, timecodePlayPause, attribute) never received feedback.
 */
const STATEFUL_BUTTON_ACTIONS = new Set<Action["type"]>(["executor", "command", "modifier"]);

function deriveFeedback(
  control: Control,
  action: Action,
  entry: Record<string, unknown>,
  fileMapper: unknown,
  source: string,
  warn: (kind: ImportWarningKind, text: string) => void
): Feedback {
  const isLedButton = control.type === "button" && control.capabilities.led !== "none";

  if ("permanentFeedback" in entry) {
    const value = toInt(entry["permanentFeedback"]);
    if (value === undefined || value < 0 || value > 127) {
      warn(
        "invalid-value",
        `${source}: permanentFeedback "${String(entry["permanentFeedback"])}" is not 0–127 — feedback dropped`
      );
    } else if (!isLedButton) {
      warn("invalid-value", `${source}: permanentFeedback on "${control.id}", which has no LED — feedback dropped`);
    } else {
      return { type: "always-on", value };
    }
  }

  if (control.type === "fader" && control.capabilities.motorized) {
    return { type: "fader-position" };
  }
  if (control.type === "encoder" && control.capabilities.ledRing) {
    return { type: "encoder-ring" };
  }
  if (isLedButton && STATEFUL_BUTTON_ACTIONS.has(action.type)) {
    const mapper = "buttonFeedbackMapper" in entry ? entry["buttonFeedbackMapper"] : fileMapper;
    return mapperToOnOff(mapper, source, warn);
  }
  return { type: "none" };
}

function mapperToOnOff(
  mapper: unknown,
  source: string,
  warn: (kind: ImportWarningKind, text: string) => void
): Feedback {
  const fallback: Feedback = { type: "on-off", onValue: 127, offValue: 0 };
  if (mapper === undefined) return fallback; // v1's default
  if (typeof mapper !== "string") {
    warn("unrecognized-feedback", `${source}: buttonFeedbackMapper is not text — default on/off (127/0) used`);
    return fallback;
  }
  // Reject over-long strings before the regex — the pattern backtracks
  // quadratically and the input is untrusted (ReDoS guard, review BUG-1).
  if (mapper.length > MAX_MAPPER_LENGTH) {
    warn(
      "unrecognized-feedback",
      `${source}: buttonFeedbackMapper is too long to be the known v1 pattern — default on/off (127/0) used (the function was NOT executed)`
    );
    return fallback;
  }
  const match = V1_MAPPER_PATTERN.exec(mapper);
  if (!match) {
    warn(
      "unrecognized-feedback",
      `${source}: buttonFeedbackMapper is not the known v1 pattern — default on/off (127/0) used (the function was NOT executed)`
    );
    return fallback;
  }
  const onValue = Number(match[1]);
  const offValue = Number(match[2]);
  if (onValue > 127 || offValue > 127) {
    warn(
      "unrecognized-feedback",
      `${source}: buttonFeedbackMapper returns values above 127 — default on/off (127/0) used`
    );
    return fallback;
  }
  return { type: "on-off", onValue, offValue };
}

// ---- device lookup ----

interface ControlLookup {
  byCc: Map<number, Control>;
  byNote: Map<number, Control>;
  byPitchChannel: Map<number, Control>;
  encoderByCc: Map<number, Control>;
  displayByIndex: Map<number, Control>;
  /** Composite push-encoders (PAM-1 AC-7): note number → owning encoder. */
  pushByNote: Map<number, Control>;
}

function buildControlLookup(device: DeviceDefinition): ControlLookup {
  const lookup: ControlLookup = {
    byCc: new Map(),
    byNote: new Map(),
    byPitchChannel: new Map(),
    encoderByCc: new Map(),
    displayByIndex: new Map(),
    pushByNote: new Map(),
  };
  for (const control of device.controls) {
    if (control.type === "display") {
      setFirst(lookup.displayByIndex, control.index, control);
      continue;
    }
    const midi = control.midi;
    if (midi.kind === "cc") {
      setFirst(lookup.byCc, midi.number, control);
      if (control.type === "encoder") setFirst(lookup.encoderByCc, midi.number, control);
    } else if (midi.kind === "note") {
      setFirst(lookup.byNote, midi.number, control);
    } else {
      setFirst(lookup.byPitchChannel, midi.channel ?? device.defaultMidiChannel, control);
    }
    if (control.type === "encoder" && control.capabilities.push?.midi.kind === "note") {
      setFirst(lookup.pushByNote, control.capabilities.push.midi.number, control);
    }
  }
  return lookup;
}

/** Devices never legitimately reuse an address; keep the first, deterministic. */
function setFirst(map: Map<number, Control>, key: number, control: Control): void {
  if (!map.has(key)) map.set(key, control);
}

function hasFeedbackCapability(device: DeviceDefinition): boolean {
  return device.controls.some(
    (control) =>
      (control.type === "button" && control.capabilities.led !== "none") ||
      (control.type === "fader" && control.capabilities.motorized) ||
      (control.type === "encoder" && control.capabilities.ledRing !== undefined) ||
      control.type === "display"
  );
}

// ---- value parsing (numeric strings are v1 reality, e.g. "201") ----

function toInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
  return undefined;
}

function toExecutorNumber(value: unknown): number | undefined {
  const number = toInt(value);
  return number !== undefined && number >= 1 && number <= 9999 ? number : undefined;
}
