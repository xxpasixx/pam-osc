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

  it("embeds exactly one pam-osc plugin (PAM-13 AC-1)", () => {
    expect(components.map((c) => c.pluginName)).toEqual(["pam-osc"]);
    // keeps the former "Start Stop" GUID so MA3 recognises the re-import
    expect(xml).toContain('Guid="C1 19 BD 33 A9 FD 10 03 5E 76 48 94 2C 0E 90 FB"');
  });

  it("carries the generator's PLUGIN_VERSION", () => {
    // Single source of truth: the version lives in build-plugin-xml.mjs and is
    // bumped (last/"mini" component) on every plugin change. The test follows it
    // automatically so a routine bump never has to touch this assertion.
    const generator = readFileSync(resolve(repoRoot, "app/scripts/build-plugin-xml.mjs"), "utf8");
    const expected = generator.match(/PLUGIN_VERSION\s*=\s*"([^"]+)"/)?.[1];
    expect(expected).toBeTruthy();
    for (const component of components) {
      expect(component.version).toBe(expected);
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

  it("carries the settings dialog, the start/stop/settings entry point and the OSC self-check (PAM-13)", () => {
    const lua = components[0]?.content.toString("utf8") ?? "";
    // AC-2: every option of the former "pam-osc Settings" plugin is still there
    for (const signal of [
      "AutoResendClicked",
      "SendColorsClicked",
      "SendNamesClicked",
      "SendTimecodeClicked",
      "FixedPageNrChanged",
    ]) {
      expect(lua).toContain(`signalTable.${signal}`);
    }
    expect(lua).toContain("local function main(displayHandle, argument)");
    // AC-3..AC-5: self-check runs on start, creates via OSCBase:Append, warns otherwise
    expect(lua).toContain("runOscSelfCheck()");
    expect(lua).toContain("ShowData().OSCBase");
    expect(lua).toContain("base:Append()");
  });

  it("ships the v2 protocol and CMD-mode pieces in the embedded Lua", () => {
    const lua = components[0]?.content.toString("utf8") ?? "";
    expect(lua).toContain("PLUGIN_PROTOCOL = 2");
    expect(lua).toContain("/status/cmdFlags,i,");
    expect(lua).toContain("/status/cmdKeyDone,i,");
    expect(lua).toContain("pamCmdKey");
    expect(lua).toContain("/NoOops");
  });

  it("addresses the feedback entry by name, not by resolved index (PAM-12 AC-8)", () => {
    const lua = components[0]?.content.toString("utf8") ?? "";
    expect(lua).toContain('SendOSC "');
    expect(lua).toContain('OSC_ENTRY_NAME = "pam-osc"');
    // the old index-lookup is gone — no more OSCData child walk to find the entry
    expect(lua).not.toContain("resolveOscEntry");
  });
});
