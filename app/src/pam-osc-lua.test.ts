import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAM-16: runs the off-console Lua parser test (`pam-OSC.config.test.lua`)
 * through the real `lua` interpreter as part of `npm test`. Skipped when `lua`
 * is not on PATH (e.g. a CI image without it) so the suite never fails for a
 * missing dev tool — the Lua parser is still covered wherever lua exists.
 */

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function luaAvailable(): boolean {
  try {
    execFileSync("lua", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("pam-OSC.lua pamConfig parser (PAM-16)", () => {
  const maybe = luaAvailable() ? it : it.skip;
  maybe("passes the off-console Lua parser test", () => {
    const out = execFileSync("lua", ["pam-OSC.config.test.lua"], { cwd: repoRoot, encoding: "utf8" });
    expect(out).toContain("ALL PASS");
  });
});
