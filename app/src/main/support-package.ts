import { createWriteStream } from "node:fs";
import { access } from "node:fs/promises";
import { basename } from "node:path";
import { ZipFile } from "yazl";

/**
 * The support package (PAM-7 AC-10): one .zip with every loaded device and
 * mapping file (split by origin so shadowed names can't collide), the
 * current settings, the session log(s), and a manifest. Files are streamed
 * from their real paths — the archive is byte-faithful.
 */

export interface SupportPackageInput {
  devices: Array<{ origin: "bundled" | "user"; file: string }>;
  mappings: Array<{ origin: "bundled" | "user"; file: string }>;
  /** settings.json — skipped silently when it doesn't exist (first run). */
  settingsFile: string;
  /** Session logs — missing ones (first run, log disabled) are skipped. */
  logFiles: string[];
  manifest: Record<string, unknown>;
}

export async function writeSupportPackage(target: string, input: SupportPackageInput): Promise<void> {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(input.manifest, null, 2) + "\n", "utf8"), "manifest.json");
  for (const device of input.devices) {
    zip.addFile(device.file, `devices/${device.origin}/${basename(device.file)}`);
  }
  for (const mapping of input.mappings) {
    zip.addFile(mapping.file, `mappings/${mapping.origin}/${basename(mapping.file)}`);
  }
  if (await exists(input.settingsFile)) zip.addFile(input.settingsFile, "settings.json");
  for (const log of input.logFiles) {
    if (await exists(log)) zip.addFile(log, `log/${basename(log)}`);
  }
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(target);
    out.on("close", resolve);
    out.on("error", reject);
    zip.outputStream.on("error", reject);
    zip.outputStream.pipe(out);
    zip.end();
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
