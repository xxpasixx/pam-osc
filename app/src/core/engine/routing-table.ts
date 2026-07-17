import type { Assignment, Control, DeviceDefinition, Mapping } from "../format/index.js";
import type { EngineIssue } from "./types.js";

/**
 * Pre-resolved runtime routing for one active mapping (= one connected
 * unit): every assignment joined with its control, indexed for the two hot
 * paths (incoming MIDI, incoming console feedback).
 */

export interface RoutingEntry {
  control: Control;
  assignment: Assignment;
  /** Resolved MIDI channel (control override or device default), 1-16. */
  channel: number;
}

export interface Unit {
  mapping: Mapping;
  device: DeviceDefinition;
  mcMode: boolean;
  timecodeEnabled: boolean;
  entries: RoutingEntry[];
  /** Incoming MIDI lookups, keyed `${channel}:${number}`. */
  byNote: Map<string, RoutingEntry[]>;
  byCc: Map<string, RoutingEntry[]>;
  /** Pitchbend is addressed by channel alone. */
  byPitch: Map<number, RoutingEntry[]>;
  /** Feedback lookups. */
  byExecutor: Map<number, RoutingEntry[]>;
  byCommand: Map<string, RoutingEntry[]>;
  byDisplayExecutor: Map<number, RoutingEntry[]>;
  attributeSelects: RoutingEntry[];
  displayCount: number;
}

export function midiKey(channel: number, number: number): string {
  return `${channel}:${number}`;
}

export function buildUnit(mapping: Mapping, device: DeviceDefinition, issues: EngineIssue[]): Unit {
  const controlsById = new Map(device.controls.map((control) => [control.id, control]));
  const unit: Unit = {
    mapping,
    device,
    mcMode: device.mode === "mc",
    timecodeEnabled: mapping.enableTimecodeSend,
    entries: [],
    byNote: new Map(),
    byCc: new Map(),
    byPitch: new Map(),
    byExecutor: new Map(),
    byCommand: new Map(),
    byDisplayExecutor: new Map(),
    attributeSelects: [],
    displayCount: device.controls.filter((control) => control.type === "display").length,
  };

  for (const assignment of mapping.assignments) {
    // The loader guarantees the reference resolves; guard anyway (EC-4 spirit).
    let control = controlsById.get(assignment.controlId);
    if (!control) continue;
    // Composite push-encoders (PAM-1 AC-7): the push part becomes a virtual
    // button control, so every downstream path (input routing, LED feedback,
    // caches) reuses the plain button logic unchanged.
    if (assignment.part === "push") {
      if (control.type !== "encoder" || !control.capabilities.push) continue; // loader rejects this; guard
      const push = control.capabilities.push;
      control = {
        id: `${control.id}#push`,
        label: control.label ? `${control.label} (push)` : `${control.id} (push)`,
        type: "button",
        midi: push.midi,
        position: control.position,
        capabilities: { led: push.led },
      };
    }
    const entry: RoutingEntry = {
      control,
      assignment,
      channel:
        control.type === "display" ? device.defaultMidiChannel : (control.midi.channel ?? device.defaultMidiChannel),
    };
    unit.entries.push(entry);
    indexInput(unit, entry, issues);
    indexFeedback(unit, entry);
    warnUnusable(unit, entry, issues);
  }

  return unit;
}

function indexInput(unit: Unit, entry: RoutingEntry, issues: EngineIssue[]): void {
  const { control } = entry;
  if (control.type === "display") return;

  const push = (map: Map<string, RoutingEntry[]>, key: string) => {
    const existing = map.get(key);
    if (existing) {
      // PAM-1 review BUG-7: same-address twins (X-Touch Compact knob-N-abs/
      // knob-N-rel) can both be assigned. v1 processed every match; the
      // engine keeps that, but says so instead of routing silently twice.
      issues.push({
        severity: "warning",
        source: unit.mapping.id,
        message:
          `controls "${existing[0]!.control.id}" and "${control.id}" share the same MIDI address — ` +
          `both assignments will fire on every event (check the mapping if that is not intended)`,
      });
      existing.push(entry);
      return;
    }
    map.set(key, [entry]);
  };

  switch (control.midi.kind) {
    case "note":
      push(unit.byNote, midiKey(entry.channel, control.midi.number));
      return;
    case "cc":
      push(unit.byCc, midiKey(entry.channel, control.midi.number));
      return;
    case "pitchbend": {
      const existing = unit.byPitch.get(entry.channel);
      if (existing) {
        issues.push({
          severity: "warning",
          source: unit.mapping.id,
          message: `two pitchbend controls share channel ${entry.channel} — both assignments will fire`,
        });
        existing.push(entry);
      } else {
        unit.byPitch.set(entry.channel, [entry]);
      }
      return;
    }
  }
}

function indexFeedback(unit: Unit, entry: RoutingEntry): void {
  const { assignment } = entry;
  switch (assignment.action.type) {
    case "executor": {
      const list = unit.byExecutor.get(assignment.action.number) ?? [];
      list.push(entry);
      unit.byExecutor.set(assignment.action.number, list);
      return;
    }
    case "command": {
      // masterEnabled matching is case-insensitive on the full text (v1).
      const key = assignment.action.command.toLowerCase();
      const list = unit.byCommand.get(key) ?? [];
      list.push(entry);
      unit.byCommand.set(key, list);
      return;
    }
    case "display": {
      const list = unit.byDisplayExecutor.get(assignment.action.number) ?? [];
      list.push(entry);
      unit.byDisplayExecutor.set(assignment.action.number, list);
      return;
    }
    case "modifier":
      if (assignment.action.modifier === "attributeSelect") {
        unit.attributeSelects.push(entry);
      }
      return;
    default:
      return;
  }
}

/** Assignments that can never do anything get a startup warning, not silence. */
function warnUnusable(unit: Unit, entry: RoutingEntry, issues: EngineIssue[]): void {
  const { control, assignment } = entry;
  const warn = (message: string) => issues.push({ severity: "warning", source: unit.mapping.id, message });

  const action = assignment.action;
  if ((action.type === "timecodeSelect" || action.type === "timecodePlayPause") && !unit.timecodeEnabled) {
    warn(
      `"${control.id}" has a ${action.type} action but the mapping does not set enableTimecodeSend — it will do nothing`
    );
  }
  if ((action.type === "timecodeSelect" || action.type === "timecodePlayPause") && !unit.mcMode) {
    warn(
      `"${control.id}" has a ${action.type} action but "${unit.device.id}" is not an mc-mode board — the 7-segment display will stay dark`
    );
  }
  if (control.type === "fader" && action.type !== "executor") {
    warn(`fader "${control.id}" only supports the executor action — "${action.type}" will do nothing`);
  }
  if (control.type === "encoder" && action.type !== "executor" && action.type !== "attribute") {
    warn(`encoder "${control.id}" supports executor and attribute actions — "${action.type}" will do nothing`);
  }
}
