import { accessSync, constants } from "node:fs";
import { dirname } from "node:path";
import { app, ipcMain, shell, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import { parsePreferences } from "../core/update/policy.js";
import { RELEASES_URL, UPDATE_IPC } from "../shared/update.js";
import type { SettingsStore } from "./settings-store.js";
import { UpdateService } from "./updater.js";

/**
 * PAM-34: wires the Update Service into the app — its own IPC channels and
 * sender check, so main/index.ts only needs one call. Kept out of index.ts on
 * purpose (parallel PAM-35 work edits that file).
 */

const writable = (path: string): boolean => {
  try {
    accessSync(path, constants.W_OK);
    accessSync(dirname(path), constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

export function startUpdates(deps: {
  getWindow: () => BrowserWindow | undefined;
  settingsStore: SettingsStore;
  log: (line: string) => void;
}): UpdateService {
  const send = (channel: string, payload: unknown) => {
    const window = deps.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  // electron-updater is CommonJS — its default export carries autoUpdater.
  const updater = app.isPackaged ? electronUpdater.autoUpdater : undefined;
  if (updater) {
    // Route the library's own diagnostics into the session log (support package).
    updater.logger = {
      info: (message: unknown) => deps.log(`updater: ${String(message)}`),
      warn: (message: unknown) => deps.log(`updater warn: ${String(message)}`),
      error: (message: unknown) => deps.log(`updater error: ${String(message)}`),
      debug: () => undefined,
    };
  }

  const service = new UpdateService({
    updater,
    installedVersion: app.getVersion(),
    supported: app.isPackaged,
    stored: () => deps.settingsStore.settings.updates,
    persist: (preferences) => deps.settingsStore.setUpdatePreferences(preferences),
    location: () => ({
      platform: process.platform,
      // …/pam-osc.app/Contents/MacOS/pam-osc → …/pam-osc.app
      appPath: process.platform === "darwin" ? app.getPath("exe").replace(/\/Contents\/MacOS\/[^/]+$/, "") : "",
      appImagePath: process.env["APPIMAGE"],
      appImageWritable: process.env["APPIMAGE"] ? writable(process.env["APPIMAGE"]) : false,
    }),
    log: deps.log,
    onStatus: (status) => send(UPDATE_IPC.evStatus, status),
  });

  // Same rule as every app IPC call: only our own window may ask.
  const handle = (channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      const window = deps.getWindow();
      if (!window || event.sender !== window.webContents) throw new Error("rejected: unknown IPC sender");
      return handler(...args);
    });
  };
  handle(UPDATE_IPC.getStatus, () => service.status());
  handle(UPDATE_IPC.checkNow, () => service.checkNow());
  handle(UPDATE_IPC.setPreferences, (raw) => {
    const preferences = parsePreferences(raw);
    if (!preferences) throw new Error("rejected: invalid update preferences");
    return service.setPreferences(preferences);
  });
  handle(UPDATE_IPC.installNow, () => service.installNow());
  // Fallback link (AC-13 / EC-4): only ever our own releases page.
  handle(UPDATE_IPC.openReleasePage, (raw) => {
    const url = typeof raw === "string" && raw.startsWith(`${RELEASES_URL}/`) ? raw : RELEASES_URL;
    return shell.openExternal(url);
  });

  service.start();
  return service;
}
