import { accessSync, constants } from "node:fs";
import { dirname } from "node:path";
import { app, dialog, ipcMain, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import electronUpdater from "electron-updater";
import { parsePreferences, pendingLaunchInstall } from "../core/update/policy.js";
import { RELEASES_URL, UPDATE_IPC, type UpdateState } from "../shared/update.js";
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

/**
 * AC-15: the version to install at this start. A stale schedule (that version
 * or newer already runs, e.g. right after the install) is cleared here.
 */
export function launchInstallFor(settingsStore: SettingsStore): string | undefined {
  const stored = settingsStore.settings.updates;
  const pending = pendingLaunchInstall(stored, app.getVersion(), app.isPackaged);
  if (!pending && stored?.installOnNextLaunch && app.isPackaged) void settingsStore.setInstallOnNextLaunch(undefined);
  return pending;
}

export function startUpdates(deps: {
  getWindow: () => BrowserWindow | undefined;
  settingsStore: SettingsStore;
  log: (line: string) => void;
  /** The Help menu shows the preference checkboxes — rebuild it when they change. */
  onPreferencesChanged: () => void;
  /** AC-16: called when a scheduled launch install did not happen — start the bridge. */
  onLaunchInstallAbandoned: () => void;
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
    // electron-updater sends a per-installation random ID (staged rollouts,
    // which we don't use) with every request. Our headers override it with a
    // constant — no identifier leaves the machine (spec → Technical Requirements).
    updater.requestHeaders = { "x-user-staging-id": "pam-osc" };
  }

  const service = new UpdateService({
    updater,
    installedVersion: app.getVersion(),
    supported: app.isPackaged,
    stored: () => deps.settingsStore.settings.updates,
    persist: async (preferences) => {
      await deps.settingsStore.setUpdatePreferences(preferences);
      deps.onPreferencesChanged();
    },
    persistLaunchInstall: (version) => deps.settingsStore.setInstallOnNextLaunch(version),
    launchInstall: launchInstallFor(deps.settingsStore),
    onLaunchInstallAbandoned: deps.onLaunchInstallAbandoned,
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
  handle(UPDATE_IPC.scheduleForNextLaunch, () => service.scheduleForNextLaunch());
  // Fallback link (AC-13 / EC-4): only ever our own releases page.
  handle(UPDATE_IPC.openReleasePage, (raw) => {
    const url = typeof raw === "string" && raw.startsWith(`${RELEASES_URL}/`) ? raw : RELEASES_URL;
    return shell.openExternal(url);
  });

  // Dev-only preview of the update notice (no packaged app, no network):
  // PAM_UPDATE_PREVIEW=ready|scheduled|installing|fallback npm run dev
  const preview = !app.isPackaged ? process.env["PAM_UPDATE_PREVIEW"] : undefined;
  const previewVersion = "2.0.0-beta.4";
  const previews: Record<string, UpdateState> = {
    ready: { kind: "ready", version: previewVersion, scheduled: false },
    scheduled: { kind: "ready", version: previewVersion, scheduled: true },
    installing: { kind: "installing", version: previewVersion },
    fallback: {
      kind: "fallback",
      version: previewVersion,
      releaseUrl: `${RELEASES_URL}/tag/v${previewVersion}`,
      reason: "not-in-applications",
    },
  };
  const previewed = preview ? previews[preview] : undefined;
  if (previewed) {
    service.previewState(previewed);
    // In the preview "On next launch" just shows the scheduled state.
    if (previewed.kind === "ready") {
      ipcMain.removeHandler(UPDATE_IPC.scheduleForNextLaunch);
      handle(UPDATE_IPC.scheduleForNextLaunch, () => service.previewState(previews["scheduled"]!));
    }
  }

  service.start();
  return service;
}

/** Plain-text result of a menu-triggered check (the only time a check talks back). */
function describeResult(state: UpdateState, installedVersion: string): { message: string; detail?: string } {
  switch (state.kind) {
    case "up-to-date":
      return { message: `pam-osc ${installedVersion} is up to date.` };
    case "downloading":
      return {
        message: `pam-osc ${state.version} is available.`,
        detail: "It is downloading in the background — a notice appears when it is ready to install.",
      };
    case "ready":
      return {
        message: `pam-osc ${state.version} is ready to install.`,
        detail: "Use the notice at the top: Install now, or On next launch.",
      };
    case "fallback":
      return {
        message: `pam-osc ${state.version} is available.`,
        detail: "This installation can't update itself — use the Download button in the notice.",
      };
    case "error":
      return { message: "Couldn't check for updates.", detail: state.message };
    default:
      return { message: "Update check did not finish — try again in a moment." };
  }
}

/**
 * PAM-34 (spec delta 2026-10-07): updates live in the Help menu, not in the
 * Setup view — "Check for Updates…" plus the two preference checkboxes.
 */
export function updatesMenuItems(
  getService: () => UpdateService | undefined,
  getWindow: () => BrowserWindow | undefined
): MenuItemConstructorOptions[] {
  const service = getService();
  const status = service?.status();
  const supported = status?.supported === true;
  const preferences = status?.preferences;
  const setPreference = (key: "checkAutomatically" | "receiveBetas", value: boolean) => {
    if (!service || !preferences) return;
    void service.setPreferences({ ...preferences, [key]: value });
  };
  return [
    {
      label: "Check for Updates…",
      click: () => {
        const show = (options: Electron.MessageBoxOptions) => {
          const window = getWindow();
          void (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
        };
        if (!service || !supported) {
          show({ type: "info", message: "Updates are disabled in development builds." });
          return;
        }
        void service.checkNow().then(() => {
          const status = service.status();
          show({ type: "info", ...describeResult(status.state, status.installedVersion) });
        });
      },
    },
    {
      label: "Check for Updates Automatically",
      type: "checkbox",
      enabled: supported,
      checked: preferences?.checkAutomatically ?? true,
      click: (item) => setPreference("checkAutomatically", item.checked),
    },
    {
      label: "Receive Beta Updates",
      type: "checkbox",
      enabled: supported,
      checked: preferences?.receiveBetas ?? false,
      click: (item) => setPreference("receiveBetas", item.checked),
    },
    { type: "separator" },
    {
      label: `Version ${app.getVersion()}`,
      enabled: false,
    },
    { label: "pam-osc Releases on GitHub", click: () => void shell.openExternal(RELEASES_URL) },
  ];
}
