import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, resolve } from "node:path";
import { Engine } from "../core/engine/index.js";
import type { EngineConfig } from "../core/engine/index.js";
import type { SettingsDraft } from "../core/settings/schema.js";
import { easymidiTransport } from "../transports/easymidi-transport.js";
import { udpOscTransport } from "../transports/osc-udp.js";
import { applySettings } from "./apply-settings.js";
import { Catalog } from "./catalog.js";
import { EngineHost } from "./engine-host.js";
import { MidiPortLister } from "./midi-ports.js";
import { SettingsStore } from "./settings-store.js";
import { draftFromPersisted } from "./snapshot.js";
import { IPC, type Notice, type Snapshot } from "../shared/ipc.js";

/**
 * Main-process bootstrap (design → Behaviors 1): single-instance lock,
 * settings, catalog, engine auto-start (before the window — the bridge
 * never waits for the UI), window with hardened defaults, IPC wiring.
 */

// EC-5: a second instance focuses the first one's window and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  let window: BrowserWindow | undefined;

  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  await app.whenReady();

  const userData = app.getPath("userData");
  // Bundled content: repo resources/ in dev, extraResources in the package.
  const bundledRoot = app.isPackaged
    ? join(process.resourcesPath, "resources")
    : resolve(app.getAppPath(), "../resources");

  const settingsStore = new SettingsStore(userData);
  const catalog = new Catalog({
    bundledDevicesDir: join(bundledRoot, "devices"),
    bundledMappingsDir: join(bundledRoot, "mappings"),
    userDevicesDir: join(userData, "devices"),
    userMappingsDir: join(userData, "mappings"),
  });

  const notices: Notice[] = [];
  const pushNotice = (notice: Notice) => {
    notices.push(notice);
    if (notices.length > 100) notices.shift();
    send(IPC.evNotice, notice);
  };
  const send = (channel: string, payload: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  const loaded = await settingsStore.load();
  if (loaded.notice) pushNotice(loaded.notice);
  await catalog.refresh();
  for (const notice of catalog.notices()) pushNotice(notice);

  const engineHost = new EngineHost(new Engine(easymidiTransport, udpOscTransport), {
    onState: (state) => send(IPC.evEngineState, state),
    onConnection: (status) => send(IPC.evConnection, status),
    onDevices: (statuses) => send(IPC.evDevices, statuses),
    onIssue: (issue) => pushNotice({ severity: issue.severity, source: issue.source, message: issue.message }),
    onLog: () => {
      // Engine logs stay out of the UI for now — PAM-4 adds diagnostics.
    },
  });

  const engineConfigFrom = (console: SettingsDraft["console"], mappingIds: string[]): EngineConfig => ({
    consoleAddress: console.address,
    sendPort: console.sendPort,
    receivePort: console.receivePort,
    sources: catalog.sources(),
    activeMappingIds: mappingIds,
  });

  // AC-4: valid persisted settings → the engine starts before the window.
  if (!loaded.firstRun && loaded.settings.activeMappingIds.length > 0) {
    const error = await engineHost.autoStart(
      engineConfigFrom(loaded.settings.console, loaded.settings.activeMappingIds),
    );
    if (error) {
      pushNotice({ severity: "error", message: `engine did not start with the saved settings: ${error}` });
    }
  }

  const midiPorts = new MidiPortLister(easymidiTransport, (ports) => send(IPC.evMidiPorts, ports));

  async function buildSnapshot(): Promise<Snapshot> {
    return {
      settings: draftFromPersisted(settingsStore.settings, catalog),
      firstRun: loaded.firstRun,
      catalog: catalog.entries(),
      invalidFiles: catalog.invalidFiles(),
      midiPorts: midiPorts.current(),
      ...engineHost.snapshot(),
      notices: [...notices],
    };
  }

  // ---- IPC (queries validated at the boundary; the renderer is untrusted) ----
  ipcMain.handle(IPC.getSnapshot, () => buildSnapshot());
  ipcMain.handle(IPC.listMidiPorts, () => midiPorts.current());
  ipcMain.handle(IPC.applySettings, (_event, draft: SettingsDraft) =>
    applySettings(draft, {
      catalog,
      settingsStore,
      engineHost,
      buildEngineConfig: (validated) =>
        engineConfigFrom(
          validated.console,
          validated.activeMappings.map((mapping) => mapping.id),
        ),
      buildSnapshot,
    }),
  );
  ipcMain.handle(IPC.revealMappingsFolder, async () => {
    await shell.openPath(join(userData, "mappings"));
  });
  ipcMain.handle(IPC.duplicateMapping, (_event, id: string) => catalog.duplicate(String(id)));

  // ---- window ----
  const bounds = settingsStore.settings.ui?.windowBounds;
  window = new BrowserWindow({
    width: bounds?.width ?? 980,
    height: bounds?.height ?? 720,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: "#141416",
    title: "pam-osc",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once("ready-to-show", () => window?.show());
  window.on("close", () => {
    if (!window) return;
    void settingsStore.saveWindowBounds(window.getBounds());
  });
  window.on("closed", () => {
    midiPorts.stop();
    window = undefined;
  });

  midiPorts.start();

  if (process.env["ELECTRON_RENDERER_URL"]) {
    await window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    await window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  // The bridge is the app: closing the window stops the engine and quits
  // (a background/tray mode is a later feature — see docs/ideas.md).
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    void engineHost.shutdown();
  });
}
