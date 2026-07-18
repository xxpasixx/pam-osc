import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectMa3Installs, installFile, ma3BaseCandidates, readPluginVersion } from "./ma3-install.js";

/** PAM-9 AC-1/2/3: detection, install, overwrite protection, error paths. */

const cleanups: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pam-ma3-"));
  cleanups.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true });
});

const XML_V1 = '<?xml version="1.0"?><GMA3><UserPlugin Name="pam-osc Start Stop" Guid="x" Version="1.2.0.0"/></GMA3>';
const XML_V2 = '<?xml version="1.0"?><GMA3><UserPlugin Name="pam-osc Start Stop" Guid="x" Version="2.0.0.0"/></GMA3>';

describe("ma3BaseCandidates", () => {
  it("uses ProgramData on Windows, the home folder on macOS, nothing on Linux", () => {
    expect(ma3BaseCandidates("win32", { ProgramData: "D:\\PD" }, "C:\\Users\\x")[0]).toContain("MALightingTechnology");
    expect(ma3BaseCandidates("darwin", {}, "/Users/x")).toEqual(["/Users/x/MALightingTechnology"]);
    expect(ma3BaseCandidates("linux", {}, "/home/x")).toEqual([]);
  });
});

describe("detectMa3Installs (AC-1)", () => {
  it("finds bases with a gma3_library, reports plugin + OSC config presence", async () => {
    const withPlugin = await tempDir();
    const withoutLibrary = await tempDir();
    const fresh = await tempDir();
    await mkdir(join(withPlugin, "gma3_library", "datapools", "plugins"), { recursive: true });
    await writeFile(join(withPlugin, "gma3_library", "datapools", "plugins", "pam-osc.xml"), XML_V1);
    await mkdir(join(withPlugin, "gma3_library", "inout", "osc"), { recursive: true });
    await writeFile(join(withPlugin, "gma3_library", "inout", "osc", "pam-osc.xml"), "<GMA3/>");
    await mkdir(join(fresh, "gma3_library"), { recursive: true }); // no subfolders yet

    const installs = await detectMa3Installs([withPlugin, withoutLibrary, fresh, "/does/not/exist"]);
    expect(installs).toHaveLength(2);
    expect(installs[0]).toMatchObject({
      base: withPlugin,
      hasPamOsc: true,
      installedVersion: "1.2.0.0",
      hasOscConfig: true,
    });
    expect(installs[0]?.oscDir).toContain("inout");
    expect(installs[1]).toMatchObject({ base: fresh, hasPamOsc: false, hasOscConfig: false });
  });
});

describe("installFile (AC-2, AC-3)", () => {
  it("copies the bundled xml and creates missing folders", async () => {
    const source = await tempDir();
    const base = await tempDir();
    const bundled = join(source, "pam-osc.xml");
    await writeFile(bundled, XML_V2);
    const pluginsDir = join(base, "gma3_library", "datapools", "plugins");

    const result = await installFile(bundled, pluginsDir, false);
    expect(result.status).toBe("installed");
    expect(await readFile(join(pluginsDir, "pam-osc.xml"), "utf8")).toBe(XML_V2);
  });

  it("refuses to replace an existing file without overwrite, then replaces with it", async () => {
    const source = await tempDir();
    const base = await tempDir();
    const bundled = join(source, "pam-osc.xml");
    await writeFile(bundled, XML_V2);
    const pluginsDir = join(base, "plugins");
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(join(pluginsDir, "pam-osc.xml"), XML_V1);

    const refused = await installFile(bundled, pluginsDir, false);
    expect(refused).toMatchObject({ status: "exists", installedVersion: "1.2.0.0" });
    expect(await readFile(join(pluginsDir, "pam-osc.xml"), "utf8")).toBe(XML_V1); // untouched

    const replaced = await installFile(bundled, pluginsDir, true);
    expect(replaced.status).toBe("installed");
    expect(await readFile(join(pluginsDir, "pam-osc.xml"), "utf8")).toBe(XML_V2);
  });

  it("reports a friendly error with the target path when the copy fails (AC-3)", async () => {
    const source = await tempDir();
    const base = await tempDir();
    const bundled = join(source, "pam-osc.xml");
    await writeFile(bundled, XML_V2);
    const readonly = join(base, "locked");
    await mkdir(readonly);
    await chmod(readonly, 0o500); // no write permission

    const result = await installFile(bundled, join(readonly, "plugins"), false);
    await chmod(readonly, 0o700);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.target).toContain("pam-osc.xml");
      expect(result.source).toBe(bundled); // AC-3: source path for manual copy
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("reports a missing bundled file instead of throwing", async () => {
    const base = await tempDir();
    const result = await installFile(join(base, "nope.xml"), join(base, "plugins"), false);
    expect(result.status).toBe("error");
  });
});

describe("readPluginVersion", () => {
  it("reads the first UserPlugin version and tolerates unreadable files", async () => {
    const dir = await tempDir();
    const file = join(dir, "p.xml");
    await writeFile(file, XML_V2);
    expect(await readPluginVersion(file)).toBe("2.0.0.0");
    expect(await readPluginVersion(join(dir, "missing.xml"))).toBeUndefined();
  });
});
