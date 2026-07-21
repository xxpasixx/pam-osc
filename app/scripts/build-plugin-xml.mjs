// Regenerates gma3_library/datapools/plugins/pam-osc.xml from the repo's .lua
// sources (PAM-12). MA3's plugin file format embeds each Lua component as
// base64 blocks of 1024 raw bytes; FileContent's Size attribute is the block
// count. GUIDs are stable — MA3 uses them to recognize the plugin on re-import.
//
// Usage: node scripts/build-plugin-xml.mjs   (run from app/, or via npm run build:plugin)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outFile = resolve(repoRoot, "gma3_library/datapools/plugins/pam-osc.xml");

/** Plugin file version. Bump the last ("mini"/patch) component on EVERY plugin
 *  change so an install version-mismatch is visible; PLUGIN_PROTOCOL only moves
 *  on real protocol breaks. 2.0.0.1: PR #42 EXEC.Object fix (multi-executor).
 *  2.0.0.2: PAM-16 pamConfig parser (app-driven watch-set + feature flags). */
const PLUGIN_VERSION = "2.0.0.2";
const DATA_VERSION = "2.0.2.0";
const BLOCK_SIZE = 1024;

const plugins = [
  {
    name: "pam-osc Start Stop",
    pluginGuid: "C1 19 BD 33 A9 FD 10 03 5E 76 48 94 2C 0E 90 FB",
    componentGuid: "C1 19 BD 33 96 FC 10 02 7D 74 11 B4 F6 65 C8 40",
    source: resolve(repoRoot, "pam-OSC.lua"),
  },
  {
    name: "pam-osc Settings",
    pluginGuid: "C1 19 BD 33 A9 FD 10 03 5E 76 48 94 2C 0E 90 FC",
    componentGuid: "C1 19 BD 33 7E A6 10 02 EB 81 42 CE E9 06 2A 41",
    source: resolve(repoRoot, "SettingsPage.lua"),
  },
];

function toBlocks(content) {
  const buffer = Buffer.from(content, "utf8");
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += BLOCK_SIZE) {
    blocks.push(buffer.subarray(offset, offset + BLOCK_SIZE).toString("base64"));
  }
  return blocks;
}

function renderPlugin({ name, pluginGuid, componentGuid, source }) {
  const blocks = toBlocks(readFileSync(source, "utf8"));
  const blockLines = blocks.map((b) => `                <Block Base64="${b}"/>`).join("\n");
  return [
    `    <UserPlugin Name="${name}" Guid="${pluginGuid}" Version="${PLUGIN_VERSION}">`,
    `        <ComponentLua Guid="${componentGuid}">`,
    `            <FileContent Size="${blocks.length}">`,
    blockLines,
    `            </FileContent>`,
    `        </ComponentLua>`,
    `    </UserPlugin>`,
  ].join("\n");
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<GMA3 DataVersion="${DATA_VERSION}">\n` +
  plugins.map(renderPlugin).join("\n") +
  `\n</GMA3>\n`;

writeFileSync(outFile, xml);
console.log(`wrote ${outFile} (plugin version ${PLUGIN_VERSION})`);
