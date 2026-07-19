import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { QUICKKEYS, QUICKKEY_GROUP_ORDER } from "./quickkeys.js";

/**
 * PAM-18 (AC-2): the canonical QuickKey catalogue (quickkeys.ts) is the single
 * source of truth shared by the editor dropdown and the plugin's QuickKey
 * creation. This parity test makes drift impossible — it extracts the code
 * array from `pam-OSC.lua > createQuickeysIfNotExists` and asserts it is
 * exactly the same set as the canonical list. If it fails, the Lua and the TS
 * list disagree — reconcile them.
 *
 * Mirrors the style of app/src/plugin-xml.test.ts.
 */

const repoRoot = resolve(__dirname, "../../../..");
const luaPath = resolve(repoRoot, "pam-OSC.lua");

/** Pull the `quickeys = { ... }` array out of createQuickeysIfNotExists. */
function extractLuaQuickeyCodes(lua: string): string[] {
  const fnStart = lua.indexOf("function createQuickeysIfNotExists");
  expect(fnStart, "createQuickeysIfNotExists not found in pam-OSC.lua").toBeGreaterThan(-1);
  const arrStart = lua.indexOf("{", fnStart);
  const arrEnd = lua.indexOf("}", arrStart);
  expect(arrStart).toBeGreaterThan(-1);
  expect(arrEnd).toBeGreaterThan(arrStart);
  const arrayBody = lua.slice(arrStart + 1, arrEnd);
  return [...arrayBody.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("canonical QuickKey catalogue (PAM-18)", () => {
  const lua = readFileSync(luaPath, "utf8");
  const luaCodes = extractLuaQuickeyCodes(lua);
  const canonicalCodes = QUICKKEYS.map((qk) => qk.code);

  it("extracts a non-empty code array from the plugin", () => {
    expect(luaCodes.length).toBeGreaterThan(0);
  });

  it("matches pam-OSC.lua createQuickeysIfNotExists exactly (same set)", () => {
    expect([...canonicalCodes].sort()).toEqual([...luaCodes].sort());
  });

  it("has no duplicate codes", () => {
    expect(new Set(canonicalCodes).size).toBe(canonicalCodes.length);
    expect(new Set(luaCodes).size).toBe(luaCodes.length);
  });

  it("assigns every entry to a known group", () => {
    for (const qk of QUICKKEYS) {
      expect(QUICKKEY_GROUP_ORDER).toContain(qk.group);
    }
  });

  it("gives every entry a non-empty label", () => {
    for (const qk of QUICKKEYS) {
      expect(qk.label.length).toBeGreaterThan(0);
    }
  });
});
