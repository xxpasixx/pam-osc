import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ZodType } from "zod";
import { CURRENT_FORMAT_VERSION } from "./envelope.js";
import { checkCompatibility } from "./compatibility.js";
import { deviceDefinitionSchema, type Control, type DeviceDefinition } from "./device-definition.js";
import { mappingSchema, type Assignment, type Mapping } from "./mapping.js";
import type { FormatIssue } from "./issues.js";

/**
 * One place files are loaded from. Sources are processed in array order;
 * a later source's file with an already-seen id shadows the earlier one
 * (user over bundled), reported as an info notice.
 */
export interface FormatSource {
  origin: "bundled" | "user";
  devicesDir: string;
  mappingsDir: string;
}

export interface LoadResult {
  devices: DeviceDefinition[];
  mappings: Mapping[];
  issues: FormatIssue[];
  /** Where each surviving mapping came from (origin + actual file path). */
  mappingSources: MappingSource[];
  /** Same for device definitions — the PAM-6 editor writes them back. */
  deviceSources: MappingSource[];
}

export interface MappingSource {
  id: string;
  origin: FormatSource["origin"];
  file: string;
}

interface Entry<T> {
  value: T;
  origin: FormatSource["origin"];
  file: string;
}

export async function loadFormat(sources: FormatSource[]): Promise<LoadResult> {
  const issues: FormatIssue[] = [];

  const devices = await loadEntities(sources, "devicesDir", "device definition", deviceDefinitionSchema, issues);
  const mappings = await loadEntities(sources, "mappingsDir", "mapping", mappingSchema, issues);

  const validMappings = new Map<string, Entry<Mapping>>();
  for (const [id, entry] of mappings) {
    if (crossValidateMapping(entry, devices, issues)) {
      validMappings.set(id, entry);
    }
  }

  return {
    devices: [...devices.values()].map((entry) => entry.value),
    mappings: [...validMappings.values()].map((entry) => entry.value),
    issues,
    mappingSources: [...validMappings.values()].map((entry) => ({
      id: entry.value.id,
      origin: entry.origin,
      file: entry.file,
    })),
    deviceSources: [...devices.values()].map((entry) => ({
      id: entry.value.id,
      origin: entry.origin,
      file: entry.file,
    })),
  };
}

async function loadEntities<T extends { id: string }>(
  sources: FormatSource[],
  dirKey: "devicesDir" | "mappingsDir",
  kind: string,
  schema: ZodType<T>,
  issues: FormatIssue[]
): Promise<Map<string, Entry<T>>> {
  const byId = new Map<string, Entry<T>>();

  for (const source of sources) {
    const dir = source[dirKey];
    for (const file of await listJsonFiles(dir)) {
      const raw = await parseJsonFile(file, issues);
      if (raw === undefined) continue;
      if (!checkFormatVersion(raw, file, issues)) continue;

      const result = schema.safeParse(raw);
      if (!result.success) {
        for (const zodIssue of result.error.issues) {
          issues.push({
            severity: "error",
            file,
            path: formatPath(zodIssue.path),
            message: `invalid ${kind}: ${zodIssue.message}`,
          });
        }
        continue;
      }

      const entity = result.data;
      const existing = byId.get(entity.id);
      if (existing && existing.origin === source.origin) {
        issues.push({
          severity: "error",
          file,
          message: `duplicate ${kind} id "${entity.id}" — already defined in ${existing.file}; this file is skipped`,
        });
        continue;
      }
      if (existing) {
        issues.push({
          severity: "info",
          file,
          message: `${kind} "${entity.id}" overrides the ${existing.origin} version (${basename(existing.file)})`,
        });
      }
      byId.set(entity.id, { value: entity, origin: source.origin, file });
    }
  }

  return byId;
}

/** Returns false (and reports) when the mapping can't be used. */
function crossValidateMapping(
  entry: Entry<Mapping>,
  devices: Map<string, Entry<DeviceDefinition>>,
  issues: FormatIssue[]
): boolean {
  const mapping = entry.value;
  const device = devices.get(mapping.deviceDefinitionId);
  if (!device) {
    issues.push({
      severity: "error",
      file: entry.file,
      path: "deviceDefinitionId",
      message: `unknown device definition "${mapping.deviceDefinitionId}" — the mapping is skipped`,
    });
    return false;
  }

  const controlsById = new Map(device.value.controls.map((control) => [control.id, control]));
  let valid = true;
  mapping.assignments.forEach((assignment, index) => {
    const control = controlsById.get(assignment.controlId);
    if (!control) {
      report(index, "controlId", `control "${assignment.controlId}" does not exist on device "${device.value.id}"`);
      return;
    }
    const problem = checkCompatibility(assignment, control);
    if (problem) report(index, undefined, problem);
  });
  return valid;

  function report(index: number, field: string | undefined, message: string) {
    valid = false;
    issues.push({
      severity: "error",
      file: entry.file,
      path: `assignments[${index}]${field ? `.${field}` : ""}`,
      message: `${message} — the mapping is skipped`,
    });
  }
}

/** Files made by a newer pam-osc are rejected instead of guessed at (AC-4). */
function checkFormatVersion(raw: unknown, file: string, issues: FormatIssue[]): boolean {
  const version = (raw as { formatVersion?: unknown })?.formatVersion;
  if (typeof version === "number" && version > CURRENT_FORMAT_VERSION) {
    issues.push({
      severity: "error",
      file,
      path: "formatVersion",
      message: `format version ${version} was made with a newer pam-osc (this build understands up to ${CURRENT_FORMAT_VERSION}) — please update pam-osc`,
    });
    return false;
  }
  return true;
}

/** Real pam-osc files are a few KB; refuse to buffer anything huge (PAM-7 will import community files). */
const MAX_FILE_BYTES = 1024 * 1024;

async function parseJsonFile(file: string, issues: FormatIssue[]): Promise<unknown | undefined> {
  let text: string;
  try {
    const info = await stat(file);
    if (info.size > MAX_FILE_BYTES) {
      issues.push({
        severity: "error",
        file,
        message: `file is too large (${info.size} bytes, limit ${MAX_FILE_BYTES}) — not a pam-osc file`,
      });
      return undefined;
    }
    text = await readFile(file, "utf8");
  } catch (error) {
    issues.push({ severity: "error", file, message: `file could not be read: ${describe(error)}` });
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    issues.push({ severity: "error", file, message: `not valid JSON: ${describe(error)}` });
    return undefined;
  }
}

/** A missing directory is normal (user folders appear on first start). */
async function listJsonFiles(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

function formatPath(path: ReadonlyArray<PropertyKey>): string | undefined {
  if (path.length === 0) return undefined;
  return path.reduce<string>(
    (acc, segment) =>
      typeof segment === "number" ? `${acc}[${segment}]` : acc ? `${acc}.${String(segment)}` : String(segment),
    ""
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
