import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PAM-12: the bundled MA3 plugin XML is generated from the repo's .lua sources
 * (scripts/build-plugin-xml.mjs). This parity test makes drift impossible —
 * it decodes the embedded base64 blocks and compares them byte-for-byte with
 * the sources. If it fails: `npm run build:plugin`.
 */

const repoRoot = resolve(__dirname, "../..");
const xmlPath = resolve(repoRoot, "gma3_library/datapools/plugins/pam-osc.xml");

interface EmbeddedComponent {
  pluginName: string;
  version: string;
  content: Buffer;
  blockCount: number;
  declaredSize: number;
}

function parseComponents(xml: string): EmbeddedComponent[] {
  const components: EmbeddedComponent[] = [];
  const pluginPattern = /<UserPlugin Name="([^"]+)"[^>]*Version="([^"]+)">([\s\S]*?)<\/UserPlugin>/g;
  for (const plugin of xml.matchAll(pluginPattern)) {
    const body = plugin[3] ?? "";
    const sizeMatch = body.match(/<FileContent Size="(\d+)">/);
    const blocks = [...body.matchAll(/<Block Base64="([^"]*)"\/>/g)].map((m) => m[1] ?? "");
    components.push({
      pluginName: plugin[1] ?? "",
      version: plugin[2] ?? "",
      content: Buffer.concat(blocks.map((b) => Buffer.from(b, "base64"))),
      blockCount: blocks.length,
      declaredSize: Number.parseInt(sizeMatch?.[1] ?? "0", 10),
    });
  }
  return components;
}

describe("bundled MA3 plugin XML (PAM-12)", () => {
  const xml = readFileSync(xmlPath, "utf8");
  const components = parseComponents(xml);

  it("embeds exactly the two pam-osc plugins", () => {
    expect(components.map((c) => c.pluginName)).toEqual(["pam-osc Start Stop", "pam-osc Settings"]);
  });

  it("carries plugin version 2.0.0.0 on both plugins", () => {
    for (const component of components) {
      expect(component.version).toBe("2.0.0.0");
    }
  });

  it("declares Size as the block count", () => {
    for (const component of components) {
      expect(component.declaredSize).toBe(component.blockCount);
      expect(component.blockCount).toBeGreaterThan(0);
    }
  });

  it("matches pam-OSC.lua byte-for-byte", () => {
    const source = readFileSync(resolve(repoRoot, "pam-OSC.lua"));
    expect(components[0]?.content.equals(source)).toBe(true);
  });

  it("matches SettingsPage.lua byte-for-byte", () => {
    const source = readFileSync(resolve(repoRoot, "SettingsPage.lua"));
    expect(components[1]?.content.equals(source)).toBe(true);
  });

  it("ships the v2 protocol and CMD-mode pieces in the embedded Lua", () => {
    const lua = components[0]?.content.toString("utf8") ?? "";
    expect(lua).toContain("PLUGIN_PROTOCOL = 2");
    expect(lua).toContain('"/status/cmdFlags,i,');
    expect(lua).toContain('"/status/cmdKeyDone,i,');
    expect(lua).toContain('pamCmdKey');
    expect(lua).toContain("/NoOops");
  });
});
