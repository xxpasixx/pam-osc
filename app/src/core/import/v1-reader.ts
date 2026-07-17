/**
 * Reads a v1 mapping file's parsed JSON and checks it has the v1 shape
 * (PAM-5 AC-6). Pure shape work — no conversion, no file access, and the
 * `buttonFeedbackMapper` strings are carried as opaque text, never executed.
 */

export const V1_SECTION_KEYS = ["control", "pitch", "note", "rltvControl", "display"] as const;
export type V1Section = (typeof V1_SECTION_KEYS)[number];

const KNOWN_TOP_LEVEL_KEYS = new Set<string>([
  ...V1_SECTION_KEYS,
  "mode",
  "buttonFeedbackMapper",
  "enableTimecodeSend",
]);

export interface V1File {
  /** File-level feedback mapper source text (opaque — pattern-matched later). */
  fileMapper: unknown;
  /** Raw value — the converter validates it is a boolean. */
  enableTimecodeSend: unknown;
  sections: Record<V1Section, Record<string, unknown>>;
  /** Top-level keys v1 never had — reported as warnings by the converter. */
  unknownKeys: string[];
}

export type V1SectionCounts = Record<V1Section, number>;

export type V1ReadResult = { ok: true; v1: V1File; counts: V1SectionCounts } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readV1Mapping(raw: unknown): V1ReadResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "the file is not a JSON object — not a v1 mapping" };
  }
  if ("formatVersion" in raw) {
    return {
      ok: false,
      error: "this is already a pam-osc v2 file (it has a formatVersion) — v2 files don't need importing",
    };
  }
  if (!V1_SECTION_KEYS.some((key) => key in raw)) {
    return {
      ok: false,
      error: "no v1 mapping sections found (expected at least one of: control, note, pitch, rltvControl, display)",
    };
  }

  const sections = {} as Record<V1Section, Record<string, unknown>>;
  for (const key of V1_SECTION_KEYS) {
    const value = raw[key];
    if (value === undefined) {
      sections[key] = {};
      continue;
    }
    if (!isPlainObject(value)) {
      return { ok: false, error: `"${key}" is not an object — not a v1 mapping` };
    }
    sections[key] = value;
  }

  return {
    ok: true,
    v1: {
      fileMapper: raw["buttonFeedbackMapper"],
      enableTimecodeSend: raw["enableTimecodeSend"],
      sections,
      unknownKeys: Object.keys(raw).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key)),
    },
    counts: Object.fromEntries(
      V1_SECTION_KEYS.map((key) => [key, Object.keys(sections[key]).length])
    ) as V1SectionCounts,
  };
}
