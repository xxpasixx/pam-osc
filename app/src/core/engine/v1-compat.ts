/**
 * Behavior ported verbatim from the v1 Open Stage Control module — every
 * constant and formula here is locked by the parity tests. Deviations are
 * bugs unless documented in design.md → Implementation Notes.
 */

/** v1 used 16380 as pitchbend full scale (not 16383) — kept for parity. */
export const PITCH_MAX = 16380;
/** Executor numbers above this address MA3 rotary knobs (Encoder messages). */
export const MA3_KNOB_THRESHOLD = 300;

/** v1 utils.getRelativeValue — detents from a relative encoder's raw CC value. */
export function relativeDetents(
  value: number,
  increment: { from: number; to: number },
  decrement: { from: number; to: number }
): number | undefined {
  if (value >= increment.from && value <= increment.to) {
    return value - increment.from + 1;
  }
  if (value >= decrement.from && value <= decrement.to) {
    return (value - decrement.from + 1) * -1;
  }
  // v1 returned undefined here and the caller's NaN handling reset the
  // accumulator to 0; the v2 engine ignores the event instead (documented).
  return undefined;
}

/**
 * PAM-20: signed (two's-complement) relative encoder decode, the Akai scheme
 * (APC40 Mk2 Communications Protocol v1.2). Not v1 parity — a new mode.
 *   value 0        → undefined (no change; caller ignores, like relativeDetents)
 *   1..63          → +1 … +63
 *   64..127        → −64 … −1   (0x7F = −1, one slow detent)
 */
export function signedDetents(value: number): number | undefined {
  if (value <= 0 || value > 127) return undefined;
  return value <= 63 ? value : value - 128;
}

/** v1 utils.mapValue — linear map with clamping to the target range. */
export function mapValue(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
  const percent = (value - fromLow) / (fromHigh - fromLow);
  const result = percent * (toHigh - toLow) + toLow;
  return Math.min(Math.max(result, toLow), toHigh);
}

export interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** v1 colorUtils.parseColorString — "r;g;b;a" from the Lua plugin. */
export function parseColorString(colorString: string): Rgba {
  const parts = colorString.split(";");
  return {
    red: Number.parseInt(parts[0] ?? "", 10),
    green: Number.parseInt(parts[1] ?? "", 10),
    blue: Number.parseInt(parts[2] ?? "", 10),
    alpha: Number.parseInt(parts[3] ?? "", 10),
  };
}

const DISPLAY_COLORS = [
  { id: 0x01, red: 255, green: 0, blue: 0 }, // red
  { id: 0x02, red: 0, green: 255, blue: 0 }, // green
  { id: 0x03, red: 255, green: 255, blue: 0 }, // yellow
  { id: 0x04, red: 0, green: 0, blue: 255 }, // blue
  { id: 0x05, red: 255, green: 0, blue: 255 }, // magenta
  { id: 0x06, red: 0, green: 255, blue: 255 }, // cyan
  { id: 0x07, red: 255, green: 255, blue: 255 }, // white
];

/** v1 colorUtils.findNearestDisplayColor — X-Touch scribble strip palette byte. */
export function nearestDisplayColor(color: Rgba): number {
  if ((color.red === 0 && color.green === 0 && color.blue === 0) || color.alpha === 0) {
    return 0x00;
  }
  let nearest = DISPLAY_COLORS[0]!;
  let minDistance = Number.POSITIVE_INFINITY;
  for (const candidate of DISPLAY_COLORS) {
    const dr = color.red - candidate.red;
    const dg = color.green - candidate.green;
    const db = color.blue - candidate.blue;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = candidate;
    }
  }
  return nearest.id;
}

export interface ParsedTimecode {
  hrs: string;
  mins: string;
  secs: string;
  mili: string;
}

/** v1's index-based parse of the plugin's timestring (e.g. "01h02m03:04"). */
export function parseTimecodeString(time: string): ParsedTimecode {
  const hrsIndex = time.indexOf("h");
  const minIndex = time.indexOf("m");
  const secIndex = time.indexOf(":");
  return {
    hrs: hrsIndex === -1 ? "0" : time.substring(0, hrsIndex),
    mins: minIndex === -1 ? "0" : time.substring(hrsIndex + 1, minIndex),
    secs: time.substring(minIndex + 1, secIndex),
    mili: time.substring(secIndex + 1),
  };
}

/**
 * Text for an X-Touch scribble line: exactly 7 chars, padded with spaces,
 * forced to 7-bit ASCII (sysex data bytes must stay below 0x80 — v1 sent
 * raw charCodes and glitched on umlauts; documented deviation).
 */
export function scribbleLine(text: string): number[] {
  const padded = (text + "       ").substring(0, 7);
  return [...padded].map((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e ? code : 0x20;
  });
}

/** v1's exact executor lookup key: address → trailing digits ("…/Fader201" → 201). */
export function trailingExecutor(address: string): number | undefined {
  const match = /(\d+)$/.exec(address);
  if (!match) return undefined;
  return Number.parseInt(match[1]!, 10);
}
