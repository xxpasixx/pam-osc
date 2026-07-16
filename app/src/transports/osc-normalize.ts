import type { OscArgument, OscMessage } from "./osc.js";

/**
 * Flattens a decoded osc-min packet (message or nested bundle) into plain
 * messages and narrows the arguments to the five tag types the MA3 side
 * uses. Unknown argument types are dropped, unknown shapes yield no message
 * — feedback the engine doesn't know is ignored, never fatal (EC-2/EC-3).
 */
/** Bundles nested deeper than this are hostile, not musical. */
const MAX_BUNDLE_DEPTH = 32;

export function normalizeOscPacket(packet: unknown, depth = 0): OscMessage[] {
  if (packet === null || typeof packet !== "object" || depth > MAX_BUNDLE_DEPTH) return [];
  const record = packet as { oscType?: string; address?: unknown; args?: unknown; elements?: unknown };

  if (record.oscType === "bundle" && Array.isArray(record.elements)) {
    return record.elements.flatMap((element) => normalizeOscPacket(element, depth + 1));
  }

  if (record.oscType === "message" && typeof record.address === "string") {
    const rawArgs = Array.isArray(record.args) ? record.args : [];
    const args: OscArgument[] = [];
    for (const raw of rawArgs) {
      const arg = normalizeArgument(raw);
      if (arg) args.push(arg);
    }
    return [{ address: record.address, args }];
  }

  return [];
}

function normalizeArgument(raw: unknown): OscArgument | undefined {
  const record = raw as { type?: unknown; value?: unknown };
  switch (record.type) {
    case "float":
    case "double":
      return typeof record.value === "number" ? { type: "float", value: record.value } : undefined;
    case "integer":
      return typeof record.value === "number" ? { type: "integer", value: record.value } : undefined;
    case "string":
      return typeof record.value === "string" ? { type: "string", value: record.value } : undefined;
    case "true":
      return { type: "true", value: true };
    case "false":
      return { type: "false", value: false };
    default:
      return undefined;
  }
}
