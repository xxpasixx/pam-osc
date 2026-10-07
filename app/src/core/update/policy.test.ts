import { describe, expect, it } from "vitest";
import {
  compareVersions,
  effectivePreferences,
  fallbackReason,
  isPrereleaseVersion,
  isWorthInstalling,
  needsInstallConfirmation,
  parsePreferences,
  pendingLaunchInstall,
} from "./policy.js";

describe("PAM-34 update policy", () => {
  it("AC-9: beta installs default to receiving betas, stable installs do not", () => {
    expect(isPrereleaseVersion("2.0.0-beta.3")).toBe(true);
    expect(isPrereleaseVersion("v2.0.0-beta.3")).toBe(true);
    expect(isPrereleaseVersion("2.0.0")).toBe(false);
    expect(effectivePreferences(undefined, "2.0.0-beta.3")).toEqual({ checkAutomatically: true, receiveBetas: true });
    expect(effectivePreferences(undefined, "2.0.0")).toEqual({ checkAutomatically: true, receiveBetas: false });
  });

  it("AC-14 / AC-9: stored choices win over the derived defaults", () => {
    expect(effectivePreferences({ checkAutomatically: false }, "2.0.0-beta.3")).toEqual({
      checkAutomatically: false,
      receiveBetas: true,
    });
    expect(effectivePreferences({ receiveBetas: false }, "2.0.0-beta.3").receiveBetas).toBe(false);
    expect(effectivePreferences({ receiveBetas: true }, "2.0.0").receiveBetas).toBe(true);
  });

  it("rejects malformed preference payloads from the renderer", () => {
    expect(parsePreferences({ checkAutomatically: true, receiveBetas: false })).toEqual({
      checkAutomatically: true,
      receiveBetas: false,
    });
    expect(parsePreferences({ checkAutomatically: "yes", receiveBetas: false })).toBeUndefined();
    expect(parsePreferences(null)).toBeUndefined();
    expect(parsePreferences("x")).toBeUndefined();
  });

  it("orders versions by semver precedence", () => {
    expect(compareVersions("2.0.0-beta.10", "2.0.0-beta.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0-beta.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0-beta.3", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("2.1.0-alpha.1", "2.0.9")).toBeGreaterThan(0);
    expect(compareVersions("v2.0.0", "2.0.0")).toBe(0);
    expect(compareVersions("2.0.0-beta", "2.0.0-beta.1")).toBeLessThan(0);
    expect(compareVersions("garbage", "2.0.0")).toBe(0);
  });

  it("EC-3 / AC-10: never installs an equal or older version", () => {
    expect(isWorthInstalling("2.0.0-beta.4", "2.0.0-beta.3")).toBe(true);
    expect(isWorthInstalling("2.0.0-beta.3", "2.0.0-beta.3")).toBe(false);
    expect(isWorthInstalling("2.0.0-beta.2", "2.0.0-beta.3")).toBe(false);
    expect(isWorthInstalling("1.4.0", "2.0.0-beta.3")).toBe(false);
  });

  it("AC-6: asks before restarting while the bridge is active", () => {
    expect(needsInstallConfirmation("running")).toBe(true);
    expect(needsInstallConfirmation("starting")).toBe(true);
    expect(needsInstallConfirmation("stopped")).toBe(false);
  });

  it("EC-4 / AC-13: falls back to a manual download where the app cannot be replaced", () => {
    const mac = (appPath: string) =>
      fallbackReason({ platform: "darwin", appPath, appImagePath: undefined, appImageWritable: false });
    expect(mac("/Applications/pam-osc.app")).toBeUndefined();
    expect(mac("/Users/pascal/Applications/pam-osc.app")).toBeUndefined();
    expect(mac("/Volumes/pam-osc 2.0.0/pam-osc.app")).toBe("not-in-applications");
    expect(mac("/Users/pascal/Downloads/pam-osc.app")).toBe("not-in-applications");

    const linux = (appImagePath: string | undefined, appImageWritable: boolean) =>
      fallbackReason({ platform: "linux", appPath: "", appImagePath, appImageWritable });
    expect(linux("/home/u/pam-osc.AppImage", true)).toBeUndefined();
    expect(linux("/opt/pam-osc.AppImage", false)).toBe("not-writable");
    expect(linux(undefined, false)).toBe("unsupported-platform");

    expect(fallbackReason({ platform: "win32", appPath: "", appImagePath: undefined, appImageWritable: false })).toBeUndefined();
  });

  it("AC-15: a scheduled launch install only runs when it is still newer, never in dev", () => {
    expect(pendingLaunchInstall({ installOnNextLaunch: "2.0.0-beta.4" }, "2.0.0-beta.3", true)).toBe("2.0.0-beta.4");
    expect(pendingLaunchInstall({ installOnNextLaunch: "2.0.0-beta.4" }, "2.0.0-beta.4", true)).toBeUndefined();
    expect(pendingLaunchInstall({ installOnNextLaunch: "2.0.0-beta.4" }, "2.0.0-beta.3", false)).toBeUndefined();
    expect(pendingLaunchInstall({}, "2.0.0-beta.3", true)).toBeUndefined();
    expect(pendingLaunchInstall(undefined, "2.0.0-beta.3", true)).toBeUndefined();
  });
});
