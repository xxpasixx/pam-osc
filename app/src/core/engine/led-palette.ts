import type { Rgba } from "./v1-compat.js";

/**
 * PAM-10: named LED colour palettes for velocity-colours button LEDs. A palette
 * is a hardware fact of a board type (shared by every unit/mapping), so device
 * files reference it by name (`ledPalette`) instead of embedding the table.
 */

export interface PaletteEntry {
  velocity: number;
  r: number;
  g: number;
  b: number;
}

/**
 * AKAI APC40 mkII — the 128-entry velocity→RGB palette from the "APC40 Mk2
 * Communications Protocol" v1.2. Index = velocity. Sent on channel 0 (Primary
 * Colour, solid). velocity 0 = off.
 */
const APC40_MK2_HEX = [
  "000000", "1E1E1E", "7F7F7F", "FFFFFF", "FF4C4C", "FF0000", "590000", "190000",
  "FFBD6C", "FF5400", "591D00", "271B00", "FFFF4C", "FFFF00", "595900", "191900",
  "88FF4C", "54FF00", "1D5900", "142B00", "4CFF4C", "00FF00", "005900", "001900",
  "4CFF5E", "00FF19", "00590D", "001902", "4CFF88", "00FF55", "00591D", "001F12",
  "4CFFB7", "00FF99", "005935", "001912", "4CC3FF", "00A9FF", "004152", "001019",
  "4C88FF", "0055FF", "001D59", "000819", "4C4CFF", "0000FF", "000059", "000019",
  "874CFF", "5400FF", "190064", "0F0030", "FF4CFF", "FF00FF", "590059", "190019",
  "FF4C87", "FF0054", "59001D", "220013", "FF1500", "993500", "795100", "436400",
  "033900", "005735", "00547F", "0000FF", "00454F", "2500CC", "7F7F7F", "202020",
  "FF0000", "BDFF2D", "AFED06", "64FF09", "108B00", "00FF87", "00A9FF", "002AFF",
  "3F00FF", "7A00FF", "B21A7D", "402100", "FF4A00", "88E106", "72FF15", "00FF00",
  "3BFF26", "59FF71", "38FFCC", "5B8AFF", "3151C6", "877FE9", "D31DFF", "FF005D",
  "FF7F00", "B9B000", "90FF00", "835D07", "392B00", "144C10", "0D5038", "15152A",
  "16205A", "693C1C", "A8000A", "DE513D", "D86A1C", "FFE126", "9EE12F", "67B50F",
  "1E1E30", "DCFF6B", "80FFBD", "9A99FF", "8E66FF", "404040", "757575", "E0FFFF",
  "A00000", "350000", "1AD000", "074200", "B9B000", "3F3100", "B35F00", "4B1502",
];

function parsePalette(hexes: string[]): PaletteEntry[] {
  return hexes.map((hex, velocity) => ({
    velocity,
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }));
}

export const LED_PALETTES: Record<string, PaletteEntry[]> = {
  "apc40-mk2": parsePalette(APC40_MK2_HEX),
};

/**
 * Nearest palette velocity for a live MA3 colour. Black / fully transparent →
 * 0 (off). Unknown or absent palette → 0 (rgb-color degrades to off, never
 * throws). Velocity 0 is excluded from the distance search so a real colour
 * never rounds to "off".
 */
export function nearestPaletteVelocity(paletteName: string | undefined, color: Rgba): number {
  const palette = paletteName ? LED_PALETTES[paletteName] : undefined;
  if (!palette) return 0;
  if (color.alpha === 0 || (color.red === 0 && color.green === 0 && color.blue === 0)) return 0;

  let nearest = 0;
  let minDistance = Number.POSITIVE_INFINITY;
  for (const entry of palette) {
    if (entry.velocity === 0) continue;
    const dr = color.red - entry.r;
    const dg = color.green - entry.g;
    const db = color.blue - entry.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < minDistance) {
      minDistance = distance;
      nearest = entry.velocity;
    }
  }
  return nearest;
}
