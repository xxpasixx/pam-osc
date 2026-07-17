import { deviceDefinitionSchema, mappingSchema, type DeviceDefinition, type Mapping } from "../format/index.js";

/**
 * Share-file parsing (PAM-7 AC-13): the entity kind is determined from the
 * CONTENT, never the file extension — the extension only filters the picker
 * (AC-12). Wrong or foreign files are refused with a specific message and
 * nothing is written. Pure module — file I/O stays in the main process.
 */

/** Mirrors the loader's per-file cap (AC-5) — anything bigger is refused. */
export const MAX_SHARE_BYTES = 1024 * 1024;

export type ShareKind = "mapping" | "device";

export type ParseShareResult =
  | { ok: true; kind: "mapping"; entity: Mapping }
  | { ok: true; kind: "device"; entity: DeviceDefinition }
  | { ok: false; error: string };

/** Content-based kind detection: the two formats have disjoint required keys. */
export function detectShareKind(value: unknown): ShareKind | "unknown" {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "unknown";
  const record = value as Record<string, unknown>;
  if (Array.isArray(record["assignments"]) && typeof record["deviceDefinitionId"] === "string") return "mapping";
  if (Array.isArray(record["controls"]) && typeof record["layout"] === "object" && record["layout"] !== null) {
    return "device";
  }
  return "unknown";
}

const KIND_LABEL: Record<ShareKind, string> = { mapping: "mapping", device: "device definition" };
const OTHER_ACTION: Record<ShareKind, string> = { mapping: "Import board", device: "Import mapping" };

/**
 * Parse + validate a share file's raw text against the expected kind.
 * Every failure path returns a friendly, specific message (AC-13) and the
 * strict schemas guarantee nothing malformed gets further (AC-5).
 */
export function parseShareFile(expected: ShareKind, raw: string): ParseShareResult {
  if (Buffer.byteLength(raw, "utf8") > MAX_SHARE_BYTES) {
    return { ok: false, error: "the file is larger than 1 MB — not a pam-osc share file" };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "this isn't a pam-osc mapping or device file (not readable as JSON)" };
  }
  const detected = detectShareKind(value);
  if (detected === "unknown") {
    return { ok: false, error: "this isn't a pam-osc mapping or device file" };
  }
  if (detected !== expected) {
    return {
      ok: false,
      error: `this looks like a ${KIND_LABEL[detected]}, not a ${KIND_LABEL[expected]} — use "${OTHER_ACTION[expected]}" instead`,
    };
  }
  if (expected === "mapping") {
    const check = mappingSchema.safeParse(value);
    if (!check.success) {
      const issue = check.error.issues[0];
      const path = issue?.path.join(".") ?? "";
      return {
        ok: false,
        error: `not a valid mapping file${path ? ` (${path})` : ""}: ${issue?.message ?? "unknown"}`,
      };
    }
    return { ok: true, kind: "mapping", entity: check.data };
  }
  const check = deviceDefinitionSchema.safeParse(value);
  if (!check.success) {
    const issue = check.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    return {
      ok: false,
      error: `not a valid device definition file${path ? ` (${path})` : ""}: ${issue?.message ?? "unknown"}`,
    };
  }
  return { ok: true, kind: "device", entity: check.data };
}

/** AC-7: imported buttons can carry commands that run verbatim on the console. */
export function commandCaution(mapping: Mapping): string | undefined {
  const hasCommand = mapping.assignments.some((assignment) => assignment.action.type === "command");
  if (!hasCommand) return undefined;
  return "this mapping contains free-text MA3 commands — they run on the console exactly as written; review them before use";
}
