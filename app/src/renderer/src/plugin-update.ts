import type { Notice } from "../../shared/ipc.js";
import { comparePluginVersions } from "../../shared/plugin-version.js";

/**
 * PAM-9 AC-10: "Install now" on the plugin-update notice — copies the bundled
 * plugin into every detected onPC installation that has an older one, via the
 * same guarded install the MA3 tab uses (main only accepts folders it detected).
 */

/** The step people forget: the console only loads the new file after a re-import. */
export const REIMPORT_HINT =
  "Remember to re-import it into your showfile on the console: Plugins pool → edit the pam-osc slot → Import, then start it again.";

export async function updateLocalPlugin(): Promise<Notice> {
  try {
    const info = await window.pamOsc.getMa3Setup();
    const bundled = info.bundledVersion;
    const outdated = info.installs.filter(
      (install) =>
        bundled !== undefined &&
        install.installedVersion !== undefined &&
        comparePluginVersions(install.installedVersion, bundled) < 0
    );
    if (!bundled || outdated.length === 0) {
      return { severity: "info", source: "MA3 plugin", message: "The plugin in onPC is already up to date." };
    }
    const failures: string[] = [];
    for (const install of outdated) {
      const result = await window.pamOsc.installMa3Asset(install.base, "plugin", true);
      if (result.status === "error") failures.push(result.error);
    }
    if (failures.length > 0) {
      return {
        severity: "error",
        source: "MA3 plugin",
        message: `Plugin update failed: ${failures.join("; ")} — use the MA3 tab to install it manually.`,
        persistent: true,
      };
    }
    return {
      severity: "info",
      source: "MA3 plugin",
      message: `Plugin ${bundled} installed into onPC. ${REIMPORT_HINT}`,
      persistent: true,
    };
  } catch (error) {
    return {
      severity: "error",
      source: "MA3 plugin",
      message: `Plugin update failed: ${error instanceof Error ? error.message : String(error)}`,
      persistent: true,
    };
  }
}
