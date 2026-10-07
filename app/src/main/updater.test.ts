import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { UpdatePreferences, UpdateStatus } from "../shared/update.js";
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, UpdateService, type UpdaterLike } from "./updater.js";

class FakeUpdater extends EventEmitter implements UpdaterLike {
  allowPrerelease = false;
  allowDowngrade = true;
  autoDownload = true;
  autoInstallOnAppQuit = false;
  checks = 0;
  downloads = 0;
  installs: Array<[boolean | undefined, boolean | undefined]> = [];
  checkResult: () => void = () => this.emit("update-not-available", { version: "0.0.0" });

  checkForUpdates(): Promise<unknown> {
    this.checks++;
    this.emit("checking-for-update");
    this.checkResult();
    return Promise.resolve(undefined);
  }
  downloadUpdate(): Promise<unknown> {
    this.downloads++;
    return Promise.resolve(undefined);
  }
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

function setup(overrides: { version?: string; stored?: { checkAutomatically?: boolean; receiveBetas?: boolean }; appPath?: string; supported?: boolean } = {}) {
  const updater = new FakeUpdater();
  const statuses: UpdateStatus[] = [];
  const persisted: UpdatePreferences[] = [];
  const logs: string[] = [];
  const timeouts: Array<() => void> = [];
  const intervals: Array<() => void> = [];
  const service = new UpdateService({
    updater,
    installedVersion: overrides.version ?? "2.0.0-beta.3",
    supported: overrides.supported ?? true,
    stored: () => overrides.stored,
    persist: async (preferences) => {
      persisted.push(preferences);
    },
    location: () => ({
      platform: "darwin",
      appPath: overrides.appPath ?? "/Applications/pam-osc.app",
      appImagePath: undefined,
      appImageWritable: false,
    }),
    log: (line) => logs.push(line),
    onStatus: (status) => statuses.push(status),
    timers: {
      setTimeout: ((fn: () => void, ms: number) => {
        expect(ms).toBe(FIRST_CHECK_DELAY_MS);
        timeouts.push(fn);
        return 0;
      }) as unknown as typeof setTimeout,
      setInterval: ((fn: () => void, ms: number) => {
        expect(ms).toBe(CHECK_INTERVAL_MS);
        intervals.push(fn);
        return 1;
      }) as unknown as typeof setInterval,
      clearInterval: vi.fn() as unknown as typeof clearInterval,
    },
    now: () => new Date("2026-10-07T12:00:00Z"),
  });
  return { updater, service, statuses, persisted, logs, timeouts, intervals };
}

describe("PAM-34 UpdateService", () => {
  it("configures the updater for live-show safety and the channel (AC-7, AC-8, AC-10)", () => {
    const { updater } = setup({ version: "2.0.0-beta.3" });
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.allowPrerelease).toBe(true);
    expect(setup({ version: "2.0.0" }).updater.allowPrerelease).toBe(false);
  });

  it("AC-1: first scheduled check runs after the start delay, then downloads a newer version", async () => {
    const { updater, service, timeouts, statuses } = setup();
    updater.checkResult = () => updater.emit("update-available", { version: "2.0.0-beta.4" });
    service.start();
    expect(updater.checks).toBe(0); // nothing before the delay
    timeouts[0]!();
    await Promise.resolve();
    expect(updater.checks).toBe(1);
    expect(updater.downloads).toBe(1);
    expect(service.status().state).toEqual({ kind: "downloading", version: "2.0.0-beta.4", percent: 0 });
    updater.emit("download-progress", { percent: 42.4 });
    expect(service.status().state).toEqual({ kind: "downloading", version: "2.0.0-beta.4", percent: 42 });
    updater.emit("update-downloaded", { version: "2.0.0-beta.4" });
    expect(service.status().state).toEqual({ kind: "ready", version: "2.0.0-beta.4" });
    expect(statuses.at(-1)?.state.kind).toBe("ready");
  });

  it("AC-2: a failed check becomes a quiet error state, logged once", async () => {
    const { updater, service, logs } = setup();
    updater.checkResult = () => updater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED\nstack…"));
    await service.checkNow();
    expect(service.status().state).toEqual({
      kind: "error",
      checkedAt: "2026-10-07T12:00:00.000Z",
      message: "net::ERR_INTERNET_DISCONNECTED",
    });
    expect(logs.filter((line) => line.includes("failed"))).toHaveLength(1);
  });

  it("AC-3: an integrity failure during download never reaches ready", async () => {
    const { updater, service } = setup();
    updater.checkResult = () => updater.emit("update-available", { version: "2.0.0-beta.4" });
    await service.checkNow();
    updater.emit("error", new Error("sha512 checksum mismatch"));
    expect(service.status().state.kind).toBe("error");
    service.installNow();
    expect(updater.installs).toHaveLength(0);
  });

  it("AC-6 / AC-7: installs only on explicit request, never by itself", async () => {
    const { updater, service } = setup();
    updater.checkResult = () => updater.emit("update-available", { version: "2.0.0-beta.4" });
    await service.checkNow();
    service.installNow(); // still downloading → ignored
    expect(updater.installs).toHaveLength(0);
    updater.emit("update-downloaded", { version: "2.0.0-beta.4" });
    expect(updater.installs).toHaveLength(0); // ready, but no self-install
    service.installNow();
    expect(updater.installs).toEqual([[true, true]]);
  });

  it("keeps a ready update when later checks run or fail", async () => {
    const { updater, service, intervals } = setup();
    updater.checkResult = () => updater.emit("update-available", { version: "2.0.0-beta.4" });
    service.start();
    await service.checkNow();
    updater.emit("update-downloaded", { version: "2.0.0-beta.4" });
    updater.checkResult = () => updater.emit("error", new Error("offline"));
    intervals[0]!();
    await service.checkNow();
    expect(service.status().state).toEqual({ kind: "ready", version: "2.0.0-beta.4" });
  });

  it("EC-3: an older or equal offered version counts as up to date", async () => {
    const { updater, service } = setup({ version: "2.0.0-beta.4" });
    updater.checkResult = () => updater.emit("update-available", { version: "2.0.0-beta.4" });
    await service.checkNow();
    expect(service.status().state.kind).toBe("up-to-date");
    expect(updater.downloads).toBe(0);
  });

  it("EC-4: outside /Applications it offers the manual download instead", async () => {
    const { updater, service } = setup({ appPath: "/Volumes/pam-osc/pam-osc.app" });
    updater.checkResult = () => updater.emit("update-available", { version: "2.0.0-beta.4" });
    await service.checkNow();
    expect(service.status().state).toEqual({
      kind: "fallback",
      version: "2.0.0-beta.4",
      releaseUrl: "https://github.com/xxpasixx/pam-osc/releases/tag/v2.0.0-beta.4",
      reason: "not-in-applications",
    });
    expect(updater.downloads).toBe(0);
  });

  it("AC-14: auto-check off → scheduled checks do nothing, Check now still works", async () => {
    const { updater, service, timeouts, intervals } = setup({ stored: { checkAutomatically: false } });
    expect(service.status().state.kind).toBe("disabled");
    service.start();
    timeouts[0]!();
    intervals[0]!();
    expect(updater.checks).toBe(0);
    await service.checkNow();
    expect(updater.checks).toBe(1);
  });

  it("AC-8 / AC-14: changing preferences persists them and re-checks on a channel switch", async () => {
    const { updater, service, persisted } = setup({ version: "2.0.0" });
    const status = await service.setPreferences({ checkAutomatically: true, receiveBetas: true });
    expect(persisted).toEqual([{ checkAutomatically: true, receiveBetas: true }]);
    expect(updater.allowPrerelease).toBe(true);
    expect(status.preferences.receiveBetas).toBe(true);
    expect(updater.checks).toBe(1);
    await service.setPreferences({ checkAutomatically: false, receiveBetas: true });
    expect(service.status().state.kind).toBe("disabled");
  });

  it("dev builds never touch the updater", async () => {
    const { updater, service, timeouts } = setup({ supported: false });
    service.start();
    expect(timeouts).toHaveLength(0);
    await service.checkNow();
    expect(updater.checks).toBe(0);
    expect(service.status().supported).toBe(false);
  });
});
