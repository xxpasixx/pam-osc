import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
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
      firstRun: !settingsStore.hasPersisted,
      catalog: catalog.entries(),
      invalidFiles: catalog.invalidFiles(),
      midiPorts: midiPorts.current(),
      ...engineHost.snapshot(),
      notices: [...notices],
    };
  }

  // ---- IPC (queries validated at the boundary; the renderer is untrusted) ----
  // Only our own window's main frame may call — anything else is dropped.
  const handle = (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!window || event.sender !== window.webContents) {
        throw new Error("rejected: unknown IPC sender");
      }
      return handler(event, ...args);
    });
  };
  handle(IPC.getSnapshot, () => buildSnapshot());
  handle(IPC.listMidiPorts, () => midiPorts.current());
  handle(IPC.applySettings, (_event, draft) =>
    applySettings(draft as SettingsDraft, {
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
  handle(IPC.revealMappingsFolder, async () => {
    await shell.openPath(join(userData, "mappings"));
  });
  handle(IPC.duplicateMapping, (_event, id) => catalog.duplicate(String(id)));

  // ---- window ----
  // Saved bounds from a since-disconnected display would restore the window
  // off-screen: only reuse the position when it still intersects a display.
  const saved = settingsStore.settings.ui?.windowBounds;
  const onScreen =
    saved !== undefined &&
    screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        saved.x < area.x + area.width &&
        saved.x + saved.width > area.x &&
        saved.y < area.y + area.height &&
        saved.y + saved.height > area.y
      );
    });
  const bounds = onScreen ? saved : undefined;
  window = new BrowserWindow({
    width: bounds?.width ?? saved?.width ?? 980,
    height: bounds?.height ?? saved?.height ?? 720,
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

  // The renderer is local display code — it never opens windows or navigates.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const devServer = process.env["ELECTRON_RENDERER_URL"];
    if (!(devServer && url.startsWith(devServer)) && !url.startsWith("file://")) {
      event.preventDefault();
    }
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
