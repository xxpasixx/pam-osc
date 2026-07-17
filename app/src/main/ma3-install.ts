import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ma3Install, Ma3InstallResult } from "../shared/ipc.js";

/**
 * PAM-9: detect local GrandMA3/onPC installations and install the bundled
 * MA3 plugin into their import folder. Pure fs logic — the Electron pieces
 * (dialogs, reveal, IPC) live in main/index.ts; tests drive this with tmp
 * dirs. MA3 imports plugins from <base>/gma3_library/datapools/plugins.
 * The result/entry shapes live in shared/ipc.ts (Ma3Install, Ma3InstallResult).
 */

/** Standard MA3 onPC locations per OS (design note in design.md). Linux has no onPC. */
export function ma3BaseCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  homeDir: string
): string[] {
  if (platform === "win32") {
    return [join(env["ProgramData"] ?? "C:\\ProgramData", "MALightingTechnology")];
  }
  if (platform === "darwin") {
    return [join(homeDir, "MALightingTechnology")];
  }
  return [];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** First Version="…" in a plugin XML — enough to tell v1 from v2 apart. */
export async function readPluginVersion(xmlPath: string): Promise<string | undefined> {
  try {
    const content = await readFile(xmlPath, "utf8");
    return content.match(/<UserPlugin [^>]*Version="([^"]+)"/)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * AC-1: every candidate base whose gma3_library exists counts as an
 * installation — the datapools/plugins part may be missing on a fresh
 * install and is created by installPlugin.
 */
export async function detectMa3Installs(candidates: string[]): Promise<Ma3Install[]> {
  const installs: Ma3Install[] = [];
  for (const base of candidates) {
    if (!(await exists(join(base, "gma3_library")))) continue;
    const pluginsDir = join(base, "gma3_library", "datapools", "plugins");
    const pamOscXml = join(pluginsDir, "pam-osc.xml");
    const hasPamOsc = await exists(pamOscXml);
    const install: Ma3Install = { base, pluginsDir, hasPamOsc };
    if (hasPamOsc) {
      const version = await readPluginVersion(pamOscXml);
      if (version) install.installedVersion = version;
    }
    installs.push(install);
  }
  return installs;
}

/**
 * AC-2/AC-3: copy the bundled pam-osc.xml into the plugin folder. An existing
 * file is only replaced with overwrite=true (the UI asks first); every
 * failure comes back as a friendly error carrying the exact target path for
 * manual copying.
 */
export async function installPlugin(bundledXml: string, pluginsDir: string, overwrite: boolean): Promise<Ma3InstallResult> {
  const target = join(pluginsDir, "pam-osc.xml");
  try {
    if (!(await exists(bundledXml))) {
      return { status: "error", error: `bundled plugin file not found at ${bundledXml}`, target };
    }
    if (!overwrite && (await exists(target))) {
      const result: Ma3InstallResult = { status: "exists", target };
      const version = await readPluginVersion(target);
      if (version) result.installedVersion = version;
      return result;
    }
    await mkdir(pluginsDir, { recursive: true });
    await copyFile(bundledXml, target);
    return { status: "installed", target };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error), target };
  }
}
