import type { StoredUpdatePreferences } from "../settings/schema.js";
import type { UpdateFallbackReason, UpdatePreferences } from "../../shared/update.js";

/**
 * PAM-34 update policy — the decisions, pure and Electron-free so they are
 * unit-testable. The Update Service (main/updater.ts) only executes them.
 */

/** "2.0.0-beta.3" → true, "2.0.0" → false (a leading "v" is tolerated). */
export function isPrereleaseVersion(version: string): boolean {
  return /^v?\d+\.\d+\.\d+-/.test(version.trim());
}

/** AC-9 / AC-14: stored choices win; absent ones fall back to the defaults. */
export function effectivePreferences(
  stored: StoredUpdatePreferences | undefined,
  installedVersion: string
): UpdatePreferences {
  return {
    checkAutomatically: stored?.checkAutomatically ?? true,
    receiveBetas: stored?.receiveBetas ?? isPrereleaseVersion(installedVersion),
  };
}

/** Validates a renderer-supplied preferences object (the renderer is untrusted). */
export function parsePreferences(raw: unknown): UpdatePreferences | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { checkAutomatically, receiveBetas } = raw as Record<string, unknown>;
  if (typeof checkAutomatically !== "boolean" || typeof receiveBetas !== "boolean") return undefined;
  return { checkAutomatically, receiveBetas };
}

interface ParsedVersion {
  core: [number, number, number];
  pre: string[];
}

function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version.trim());
  if (!match) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : [],
  };
}

/** Semver precedence: >0 when a is newer than b. Unparseable → 0 (treated as "not newer"). */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i]! - right.core[i]!;
  }
  // A release without pre-release tag ranks above any pre-release of it.
  if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = /^\d+$/.test(l) ? Number(l) : undefined;
    const rn = /^\d+$/.test(r) ? Number(r) : undefined;
    if (ln !== undefined && rn !== undefined) {
      if (ln !== rn) return ln - rn;
    } else if (ln !== undefined) {
      return -1;
    } else if (rn !== undefined) {
      return 1;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

/** EC-3: a pending update is only worth installing when it is newer than what runs. */
export function isWorthInstalling(candidate: string, installedVersion: string): boolean {
  return compareVersions(candidate, installedVersion) > 0;
}

/** AC-6: an active bridge (engine starting/running) needs a confirmation before restarting. */
export function needsInstallConfirmation(engineState: "stopped" | "starting" | "running"): boolean {
  return engineState !== "stopped";
}

export interface InstallLocation {
  platform: string;
  /** macOS: path of the running .app bundle. */
  appPath: string;
  /** Linux: process.env.APPIMAGE — absent when not run as an AppImage. */
  appImagePath: string | undefined;
  /** Linux: whether the AppImage file (and its folder) can be replaced. */
  appImageWritable: boolean;
}

/**
 * AC-13 / EC-4: places the updater cannot replace the app from. Returns the
 * reason for the "download manually" fallback, or undefined when the
 * automatic install can work.
 */
export function fallbackReason(location: InstallLocation): UpdateFallbackReason | undefined {
  if (location.platform === "darwin") {
    // Running from the mounted dmg (/Volumes/…) or e.g. ~/Downloads: Squirrel
    // cannot swap the bundle reliably — ask the user to move it first.
    const inApplications = /^\/Applications\//.test(location.appPath) || /\/Users\/[^/]+\/Applications\//.test(location.appPath);
    return inApplications ? undefined : "not-in-applications";
  }
  if (location.platform === "linux") {
    if (!location.appImagePath) return "unsupported-platform";
    return location.appImageWritable ? undefined : "not-writable";
  }
  if (location.platform === "win32") return undefined;
  return "unsupported-platform";
}
