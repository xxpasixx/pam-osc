import { deviceDefinitionSchema, type Control, type DeviceDefinition } from "./device-definition.js";
import { mappingSchema, type Mapping } from "./mapping.js";
import { checkCompatibility } from "./compatibility.js";

/**
 * Validation the PAM-6 editor needs on top of the PAM-1 schemas (design →
 * Save → validate → reload). Pure functions, used twice: live in the
 * renderer for inline errors and enforced in the main process on save —
 * the renderer stays untrusted (PAM-3 pattern).
 *
 * Grid snapping is a UI concern (the canvas snaps to 0.5 units while
 * dragging) and deliberately not validated here — hand-edited files with
 * finer positions must stay editable.
 */

/** One editor error, anchored to the field that caused it (AC-7). */
export interface EditorIssue {
  /** e.g. "controls[3].midi.number", "assignments[2].feedback", "layout.width" */
  path: string;
  message: string;
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; issues: EditorIssue[] };

/** Full board draft check: PAM-1 schema + duplicate addresses + geometry. */
export function validateDeviceDraft(raw: unknown): DraftResult<DeviceDefinition> {
  const parsed = deviceDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: joinPath(issue.path), message: issue.message })) };
  }
  const device = parsed.data;
  const issues = [...duplicateAddressIssues(device), ...geometryIssues(device)];
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: device };
}

/** Full mapping draft check: PAM-1 schema + control references + capabilities. */
export function validateMappingDraft(raw: unknown, device: DeviceDefinition): DraftResult<Mapping> {
  const parsed = mappingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: joinPath(issue.path), message: issue.message })) };
  }
  const mapping = parsed.data;
  const issues: EditorIssue[] = [];
  if (mapping.deviceDefinitionId !== device.id) {
    issues.push({
      path: "deviceDefinitionId",
      message: `mapping targets "${mapping.deviceDefinitionId}" but is edited against device "${device.id}"`,
    });
  }
  const controlsById = new Map(device.controls.map((control) => [control.id, control]));
  mapping.assignments.forEach((assignment, index) => {
    const control = controlsById.get(assignment.controlId);
    if (!control) {
      issues.push({
        path: `assignments[${index}].controlId`,
        message: `control "${assignment.controlId}" does not exist on device "${device.id}"`,
      });
      return;
    }
    const problem = checkCompatibility(assignment, control);
    if (problem) issues.push({ path: `assignments[${index}]`, message: problem });
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: mapping };
}

/**
 * No two controls may answer to the same wire address (AC-7). Key: kind +
 * effective channel (control channel or the board default) + number;
 * pitchbend is addressed by its channel alone. Displays have no address.
 */
function duplicateAddressIssues(device: DeviceDefinition): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const seen = new Map<string, Control>();
  const claim = (control: Control, key: string, path: string) => {
    const other = seen.get(key);
    if (other) {
      issues.push({
        path,
        message: `same MIDI address as "${other.id}" (${describeAddress(key)}) — addresses must be unique per board`,
      });
      return;
    }
    seen.set(key, control);
  };
  device.controls.forEach((control, index) => {
    if (control.type === "display") return;
    const channel = control.midi.channel ?? device.defaultMidiChannel;
    const key =
      control.midi.kind === "pitchbend"
        ? `pitchbend:${channel}`
        : `${control.midi.kind}:${channel}:${control.midi.number}`;
    claim(control, key, `controls[${index}].midi`);
    // A push-encoder's integrated button competes in the same address space.
    if (control.type === "encoder" && control.capabilities.push) {
      const push = control.capabilities.push.midi;
      const pushChannel = push.channel ?? device.defaultMidiChannel;
      claim(control, `${push.kind}:${pushChannel}:${push.number}`, `controls[${index}].capabilities.push.midi`);
    }
  });
  return issues;
}

function describeAddress(key: string): string {
  const [kind, channel, number] = key.split(":");
  return kind === "pitchbend" ? `pitchbend, channel ${channel}` : `${kind} ${number}, channel ${channel}`;
}

/** Every control must lie fully inside the board layout (AC-7 shrink rule). */
function geometryIssues(device: DeviceDefinition): EditorIssue[] {
  const issues: EditorIssue[] = [];
  device.controls.forEach((control, index) => {
    const { x, y, width, height } = control.position;
    if (x < 0 || y < 0 || x + width > device.layout.width || y + height > device.layout.height) {
      issues.push({
        path: `controls[${index}].position`,
        message: `control "${control.id}" lies outside the ${device.layout.width}×${device.layout.height} board — move it or enlarge the board`,
      });
    }
  });
  return issues;
}

/** A mapping that assigns controls of one device — the usage/orphan input. */
export interface MappingRef {
  id: string;
  name: string;
  origin: "bundled" | "user";
  deviceDefinitionId: string;
  assignments: ReadonlyArray<{ controlId: string }>;
}

/** Per control of a definition: the mappings assigning it (delete warning, AC-7). */
export function controlUsage(definitionId: string, mappings: ReadonlyArray<MappingRef>): Map<string, MappingRef[]> {
  const usage = new Map<string, MappingRef[]>();
  for (const mapping of mappings) {
    if (mapping.deviceDefinitionId !== definitionId) continue;
    for (const assignment of mapping.assignments) {
      const list = usage.get(assignment.controlId);
      if (list) {
        if (!list.includes(mapping)) list.push(mapping);
      } else {
        usage.set(assignment.controlId, [mapping]);
      }
    }
  }
  return usage;
}

/**
 * Assignments that reference controls no longer present in the edited
 * definition. The PAM-1 loader skips a whole mapping file on a broken
 * reference, so confirmed deletions clean these up in user files (design →
 * Deleting an assigned control).
 */
export function orphanedAssignments(
  definition: Pick<DeviceDefinition, "id" | "controls">,
  mappings: ReadonlyArray<MappingRef>
): Array<{ mapping: MappingRef; controlIds: string[] }> {
  const controlIds = new Set(definition.controls.map((control) => control.id));
  const orphans: Array<{ mapping: MappingRef; controlIds: string[] }> = [];
  for (const mapping of mappings) {
    if (mapping.deviceDefinitionId !== definition.id) continue;
    const missing = [...new Set(mapping.assignments.map((a) => a.controlId))].filter((id) => !controlIds.has(id));
    if (missing.length > 0) orphans.push({ mapping, controlIds: missing });
  }
  return orphans;
}

/** First free id/name following the PAM-3 duplicate convention (design → Copy-on-edit). */
export function suffixedCopy(id: string, name: string, existingIds: ReadonlySet<string>): { id: string; name: string } {
  const stripped = id.replace(/-\d+$/, "");
  const isSuffixed = stripped !== id && existingIds.has(stripped);
  const baseId = isSuffixed ? stripped : id;
  const baseName = isSuffixed ? name.replace(/ \(\d+\)$/, "") : name;
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return { id: `${baseId}-${suffix}`, name: `${baseName} (${suffix})` };
}

function joinPath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return "";
  return path.reduce<string>(
    (acc, segment) =>
      typeof segment === "number" ? `${acc}[${segment}]` : acc ? `${acc}.${String(segment)}` : String(segment),
    ""
  );
}
