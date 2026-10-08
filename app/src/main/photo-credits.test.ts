import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPhotoCredits, parsePhotoCredits } from "./photo-credits.js";

describe("PAM-21 in-app photo credits", () => {
  it("reads every row of the bundled CREDITS.md, including URLs with parentheses", () => {
    const markdown = readFileSync(resolve(import.meta.dirname, "../../../resources/devices/images/CREDITS.md"), "utf8");
    const credits = parsePhotoCredits(markdown);
    expect(credits.map((credit) => credit.file)).toEqual(["apc-40-mk2.jpg", "apc-mini.jpg", "mpx16.jpg", "launchpad.jpg"]);
    expect(credits[0]).toEqual({
      file: "apc-40-mk2.jpg",
      title: "AKAI APC set - APCmini, APC40 mkII, APCkey25 - left front",
      url: "https://commons.wikimedia.org/wiki/File:AKAI_APC_set_-_APCmini,_APC40_mkII,_APCkey25_-_left_front_(Peter_VanLane).jpg",
      author: "Peter VanLane",
      licence: "CC BY 2.0",
    });
    expect(credits[3]!.licence).toBe("CC BY-SA 2.0");
    expect(formatPhotoCredits(credits)).toContain("“Novation Launchpad” by Marc Majcher, CC BY-SA 2.0");
  });

  it("every bundled photo has a credit row and belongs to a bundled device", () => {
    const dir = resolve(import.meta.dirname, "../../../resources/devices/images");
    const markdown = readFileSync(`${dir}/CREDITS.md`, "utf8");
    const credited = new Set(parsePhotoCredits(markdown).map((credit) => credit.file));
    const photos = readdirSync(dir).filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
    const deviceIds = new Set(
      readdirSync(resolve(dir, "..")).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""))
    );
    for (const photo of photos) {
      expect(credited.has(photo), `${photo} has no credit`).toBe(true);
      // Review F-1: a photo must be named after a bundled device id, or the app never shows it.
      expect(deviceIds.has(photo.replace(/\.[^.]+$/, "")), `${photo} matches no bundled device`).toBe(true);
    }
  });
});
