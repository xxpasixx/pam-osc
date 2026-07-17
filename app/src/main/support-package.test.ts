import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { writeSupportPackage } from "./support-package.js";

/** Read back a zip's entry names + the manifest content (test-only, via yauzl). */
async function readZip(file: string): Promise<{ entries: string[]; manifest: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const entries: string[] = [];
    let manifest: Record<string, unknown> = {};
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.on("entry", (entry: yauzl.Entry) => {
        entries.push(entry.fileName);
        if (entry.fileName === "manifest.json") {
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError) return reject(streamError);
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => {
              manifest = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
              zip.readEntry();
            });
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on("end", () => resolve({ entries, manifest }));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

describe("writeSupportPackage (PAM-7 AC-10)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pam-zip-"));
  });

  it("packs devices, mappings, settings, logs, and a manifest — split by origin", async () => {
    const deviceFile = join(dir, "board.json");
    const mappingFile = join(dir, "map.json");
    const settingsFile = join(dir, "settings.json");
    const logFile = join(dir, "session.log");
    await writeFile(deviceFile, '{"kind":"device"}', "utf8");
    await writeFile(mappingFile, '{"kind":"mapping"}', "utf8");
    await writeFile(settingsFile, '{"console":{}}', "utf8");
    await writeFile(logFile, "[t] engine running\n", "utf8");

    const brokenFile = join(dir, "broken.json");
    await writeFile(brokenFile, "{ not valid", "utf8");

    const target = join(dir, "support.zip");
    await writeSupportPackage(target, {
      devices: [{ origin: "bundled", file: deviceFile }],
      mappings: [{ origin: "user", file: mappingFile }],
      invalidFiles: [brokenFile, join(dir, "gone.json")],
      settingsFile,
      logFiles: [logFile, join(dir, "missing-prev.log")],
      manifest: { app: "pam-osc", version: "2.0.0-test", devices: 1, mappings: 1 },
    });

    const zip = await readZip(target);
    expect(zip.entries).toContain("manifest.json");
    expect(zip.entries).toContain("devices/bundled/board.json");
    expect(zip.entries).toContain("mappings/user/map.json");
    expect(zip.entries).toContain("settings.json");
    expect(zip.entries).toContain("log/session.log");
    // BUG-4: the broken user file ships so a helper can reproduce it
    expect(zip.entries).toContain("invalid/broken.json");
    // a missing invalid path is skipped, not an error
    expect(zip.entries.some((entry) => entry.includes("gone.json"))).toBe(false);
    // the missing previous log is skipped, not an error
    expect(zip.entries.some((entry) => entry.includes("missing-prev"))).toBe(false);
    expect(zip.manifest["version"]).toBe("2.0.0-test");
  });

  it("skips a missing settings file (first run) without failing", async () => {
    const target = join(dir, "support.zip");
    await writeSupportPackage(target, {
      devices: [],
      mappings: [],
      invalidFiles: [],
      settingsFile: join(dir, "never-written.json"),
      logFiles: [],
      manifest: { app: "pam-osc" },
    });
    const zip = await readZip(target);
    expect(zip.entries).toEqual(["manifest.json"]);
  });
});
