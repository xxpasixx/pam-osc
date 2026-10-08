import { afterEach, describe, expect, it, vi } from "vitest";
import { REIMPORT_HINT, updateLocalPlugin } from "./plugin-update.js";

const install = (base: string, installedVersion: string | undefined) => ({
  base,
  pluginsDir: `${base}/plugins`,
  oscDir: `${base}/osc`,
  hasPamOsc: installedVersion !== undefined,
  installedVersion,
  hasOscConfig: true,
});

function stubBridge(installs: ReturnType<typeof install>[], fail = false) {
  const installMa3Asset = vi.fn(async (base: string) =>
    fail
      ? { status: "error" as const, error: "disk full", source: "s", target: base }
      : { status: "installed" as const, target: base }
  );
  (globalThis as { window?: unknown }).window = {
    pamOsc: {
      getMa3Setup: async () => ({ bundledVersion: "2.0.0.4", localAddresses: [], installs }),
      installMa3Asset,
    },
  };
  return installMa3Asset;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("PAM-9 AC-10: Install now on the plugin-update notice", () => {
  it("overwrites only the outdated installs and reminds to re-import", async () => {
    const installMa3Asset = stubBridge([install("/old", "2.0.0.3"), install("/current", "2.0.0.4"), install("/none", undefined)]);
    const notice = await updateLocalPlugin();
    expect(installMa3Asset).toHaveBeenCalledTimes(1);
    expect(installMa3Asset).toHaveBeenCalledWith("/old", "plugin", true);
    expect(notice.severity).toBe("info");
    expect(notice.message).toContain(REIMPORT_HINT);
    expect(notice.persistent).toBe(true);
  });

  it("reports a failure without a re-import hint", async () => {
    stubBridge([install("/old", "2.0.0.3")], true);
    const notice = await updateLocalPlugin();
    expect(notice.severity).toBe("error");
    expect(notice.message).toContain("disk full");
    expect(notice.message).not.toContain("re-import");
  });

  it("does nothing when everything is current", async () => {
    const installMa3Asset = stubBridge([install("/current", "2.0.0.4")]);
    const notice = await updateLocalPlugin();
    expect(installMa3Asset).not.toHaveBeenCalled();
    expect(notice.message).toMatch(/already up to date/);
  });
});
