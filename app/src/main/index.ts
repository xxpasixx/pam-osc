import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { copyFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { MAX_SHARE_BYTES, type ShareKind } from "../core/sharing/share.js";
import { Engine } from "../core/engine/index.js";
import type { EngineConfig } from "../core/engine/index.js";
import type { SettingsDraft } from "../core/settings/schema.js";
import { easymidiTransport } from "../transports/easymidi-transport.js";
import { udpOscTransport } from "../transports/osc-udp.js";
import { applySettings } from "./apply-settings.js";
import { Catalog } from "./catalog.js";
import { EngineHost } from "./engine-host.js";
import { analyzeV1File, importV1File, ImportSerializer } from "./import-v1.js";
import { MidiLearn } from "./midi-learn.js";
import { MidiPortLister } from "./midi-ports.js";
import { diagnoseUdpPort } from "./port-diagnosis.js";
import { SessionLog } from "./session-log.js";
import { SettingsStore } from "./settings-store.js";
import { importShareFile } from "./share-files.js";
import { writeSupportPackage } from "./support-package.js";
import { draftFromPersisted } from "./snapshot.js";
import { TrafficBuffer } from "./traffic-buffer.js";
import {
  IPC,
  type EditorSaveResult,
  type ExportFileResult,
  type ImportShareOutcome,
  type Notice,
  type PortDiagnosis,
  type SaveDeviceRequest,
  type Snapshot,
} from "../shared/ipc.js";

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

  // Session log (PAM-7 AC-11): lifecycle + errors, never per-message traffic.
  const sessionLog = new SessionLog(join(userData, "logs"));
  await sessionLog.start();
  sessionLog.log(`pam-osc ${app.getVersion()} starting (${process.platform})`);

  const settingsStore = new SettingsStore(userData);
  const catalog = new Catalog({
    bundledDevicesDir: join(bundledRoot, "devices"),
    bundledMappingsDir: join(bundledRoot, "mappings"),
    userDevicesDir: join(userData, "devices"),
    userMappingsDir: join(userData, "mappings"),
  });

  const notices: Notice[] = [];
  const pushNotice = (notice: Notice) => {
    // Reloads re-emit unchanged conditions — exact repeats are dropped so the
    // notices area doesn't fill up with copies of the same message.
    const repeat = notices.some(
      (existing) =>
        existing.severity === notice.severity &&
        existing.source === notice.source &&
        existing.message === notice.message
    );
    if (repeat) return;
    notices.push(notice);
    if (notices.length > 100) notices.shift();
    sessionLog.log(`notice ${notice.severity}${notice.source ? ` [${notice.source}]` : ""}: ${notice.message}`);
    send(IPC.evNotice, notice);
  };
  const send = (channel: string, payload: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  const loaded = await settingsStore.load();
  if (loaded.notice) pushNotice(loaded.notice);
  await catalog.refresh();
  for (const notice of catalog.notices()) pushNotice(notice);

  const trafficBuffer = new TrafficBuffer((batch) => send(IPC.evTraffic, batch));

  // Port diagnosis (PAM-4 AC-2): runs once per engine run when the console
  // is unreachable or the engine fails to start — the usual suspects are the
  // console-side settings or another app holding our OSC receive port.
  let portDiagnosis: PortDiagnosis | undefined;
  let diagnosing = false;
  const runPortDiagnosis = () => {
    if (diagnosing) return;
    diagnosing = true;
    void diagnoseUdpPort(settingsStore.settings.console.receivePort)
      .then((diagnosis) => {
        portDiagnosis = diagnosis;
        send(IPC.evPortDiagnosis, diagnosis);
      })
      .finally(() => {
        diagnosing = false;
      });
  };
  const resetPortDiagnosis = () => {
    portDiagnosis = undefined;
    send(IPC.evPortDiagnosis, undefined);
  };

  const engineHost = new EngineHost(new Engine(easymidiTransport, udpOscTransport), {
    onState: (state) => {
      if (state === "starting") resetPortDiagnosis(); // fresh run, fresh diagnosis
      sessionLog.log(`engine ${state}`);
      send(IPC.evEngineState, state);
    },
    onConnection: (status) => {
      if (status.state === "unreachable" && portDiagnosis === undefined) runPortDiagnosis();
      sessionLog.log(`console ${status.state}`);
      send(IPC.evConnection, status);
    },
    onDevices: (statuses) => send(IPC.evDevices, statuses),
    onIssue: (issue) => {
      // Info-level issues (e.g. "user file overrides bundled" — the expected
      // copy-on-activate state) would re-appear as notices on every engine
      // reload; they stay in the system log, only real problems pop up.
      if (issue.severity !== "info") {
        const source = issue.source?.includes("/") ? basename(issue.source) : issue.source;
        pushNotice({ severity: issue.severity, source, message: issue.message });
      }
      sessionLog.log(
        `${issue.severity}${issue.source ? ` [${issue.source.includes("/") ? basename(issue.source) : issue.source}]` : ""}: ${issue.message}`
      );
      trafficBuffer.push({
        at: Date.now(),
        category: "system",
        source: issue.source,
        text: `${issue.severity}: ${issue.message}`,
      });
    },
    onLog: (line) => {
      sessionLog.log(line);
      trafficBuffer.push({ at: Date.now(), category: "system", text: line });
    },
    onTraffic: (event) =>
      trafficBuffer.push({ at: Date.now(), category: event.direction, source: event.source, text: event.text }),
    onMidiInput: (port, event) => midiLearn.onEngineInput(port, event),
  });

  // MIDI learn (PAM-6 AC-4): taps the engine when it holds the port,
  // otherwise opens the port temporarily for the session.
  const midiLearn = new MidiLearn(
    easymidiTransport,
    () => engineHost.boundInputPorts(),
    (event) => send(IPC.evMidiLearn, event),
    (event) => send(IPC.evMidiActivity, event)
  );

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
      engineConfigFrom(loaded.settings.console, loaded.settings.activeMappingIds)
    );
    if (error) {
      pushNotice({ severity: "error", message: `engine did not start with the saved settings: ${error}` });
      runPortDiagnosis(); // a blocked receive port is the classic cause (AC-2)
    }
  }

  const midiPorts = new MidiPortLister(easymidiTransport, (ports) => {
    midiLearn.onPortsChanged(ports); // a vanished port ends a learn session
    send(IPC.evMidiPorts, ports);
  });

  async function buildSnapshot(): Promise<Snapshot> {
    return {
      settings: draftFromPersisted(settingsStore.settings, catalog),
      firstRun: !settingsStore.hasPersisted,
      catalog: catalog.entries(),
      invalidFiles: catalog.invalidFiles(),
      boards: catalog.boards(),
      midiPorts: midiPorts.current(),
      ...engineHost.snapshot(),
      notices: [...notices],
      traffic: trafficBuffer.recent(),
      portDiagnosis,
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
  handle(IPC.applySettings, async (_event, draft) => {
    const result = await applySettings(draft as SettingsDraft, {
      catalog,
      settingsStore,
      engineHost,
      buildEngineConfig: (validated) =>
        engineConfigFrom(
          validated.console,
          validated.activeMappings.map((mapping) => mapping.id)
        ),
      buildSnapshot,
    });
    sessionLog.log(result.ok ? "settings applied" : "settings apply rejected (validation)");
    return result;
  });
  handle(IPC.revealMappingsFolder, async () => {
    await shell.openPath(join(userData, "mappings"));
  });
  handle(IPC.duplicateMapping, (_event, id) => catalog.duplicate(String(id)));
  handle(IPC.createMapping, (_event, rawRequest) => {
    const request = rawRequest as { deviceDefinitionId?: unknown; name?: unknown };
    if (typeof request?.deviceDefinitionId !== "string" || typeof request.name !== "string") {
      return { error: "invalid create request" };
    }
    return catalog.createMapping(request.deviceDefinitionId, request.name);
  });

  // ---- v1 mapping import (PAM-5) ----
  // Import only accepts paths this dialog handed out — the renderer never
  // gets to point the main process at an arbitrary file.
  const pickedV1Files = new Set<string>();
  handle(IPC.pickV1MappingFile, async () => {
    if (!window) return { status: "canceled" };
    const picked = await dialog.showOpenDialog(window, {
      title: "Import v1 mapping",
      filters: [{ name: "v1 mapping (JSON)", extensions: ["json"] }],
      properties: ["openFile"],
    });
    const filePath = picked.filePaths[0];
    if (picked.canceled || !filePath) return { status: "canceled" };
    const result = await analyzeV1File(filePath);
    if (result.status === "ok") pickedV1Files.add(result.filePath);
    return result;
  });
  // Imports run one at a time (review BUG-2) — see ImportSerializer.
  const importSerializer = new ImportSerializer();
  handle(IPC.importV1Mapping, (_event, rawRequest) => {
    const request = rawRequest as { filePath?: unknown; deviceDefinitionId?: unknown; name?: unknown };
    if (
      typeof request?.filePath !== "string" ||
      typeof request.deviceDefinitionId !== "string" ||
      typeof request.name !== "string"
    ) {
      return { ok: false, error: "invalid import request" };
    }
    if (!pickedV1Files.has(request.filePath)) {
      return { ok: false, error: "pick the v1 file via the import dialog first" };
    }
    const { filePath, deviceDefinitionId, name } = request;
    return importSerializer.run(() => importV1File({ filePath, deviceDefinitionId, name }, catalog));
  });

  // ---- sharing: single-file export/import + support package (PAM-7) ----
  // Export copies the real loaded file's bytes (AC-1/AC-8); the extension
  // filters pickers only — imports detect the kind from content (AC-12/13).
  const exportShare = async (kind: ShareKind, id: string): Promise<ExportFileResult> => {
    if (!window) return { status: "canceled" };
    const source = kind === "mapping" ? catalog.mappingFile(id) : catalog.deviceFile(id);
    if (!source) return { status: "error", error: `${kind} "${id}" not found` };
    const extension = kind === "mapping" ? "mapping" : "device";
    const picked = await dialog.showSaveDialog(window, {
      title: kind === "mapping" ? "Export mapping" : "Export board",
      defaultPath: `${id}.${extension}`,
      filters: [{ name: `pam-osc ${extension} file`, extensions: [extension] }],
    });
    if (picked.canceled || !picked.filePath) return { status: "canceled" };
    try {
      const info = await stat(source.file);
      // AC-5 export side: never produce a file the loader would refuse.
      if (info.size > MAX_SHARE_BYTES) {
        return { status: "error", error: "refusing to export — the file exceeds the 1 MB share cap" };
      }
      await copyFile(source.file, picked.filePath);
    } catch {
      return { status: "error", error: "could not write the export file" };
    }
    sessionLog.log(`exported ${kind} "${id}"`);
    return { status: "saved", file: picked.filePath };
  };
  handle(IPC.exportMapping, (_event, id) => exportShare("mapping", String(id)));
  handle(IPC.exportDevice, (_event, id) => exportShare("device", String(id)));

  const importShare = async (kind: ShareKind): Promise<ImportShareOutcome> => {
    if (!window) return { canceled: true };
    const extension = kind === "mapping" ? "mapping" : "device";
    const picked = await dialog.showOpenDialog(window, {
      title: kind === "mapping" ? "Import mapping" : "Import board",
      // AC-12: the custom extension filters the picker; .json stays accepted
      // for hand-copied files. The content check decides what it really is.
      filters: [{ name: `pam-osc ${extension} file (.${extension}, .json)`, extensions: [extension, "json"] }],
      properties: ["openFile"],
    });
    const filePath = picked.filePaths[0];
    if (picked.canceled || !filePath) return { canceled: true };
    const result = await importSerializer.run(() => importShareFile(kind, filePath, catalog));
    sessionLog.log(
      result.ok
        ? `imported ${result.kind} "${result.id}"${result.renamed ? " (renamed — id was taken)" : ""}`
        : `${kind} import failed: ${result.error}`
    );
    return result;
  };
  handle(IPC.importMappingFile, () => importShare("mapping"));
  handle(IPC.importDeviceFile, () => importShare("device"));

  handle(IPC.exportSupportPackage, async (): Promise<ExportFileResult> => {
    if (!window) return { status: "canceled" };
    const picked = await dialog.showSaveDialog(window, {
      title: "Export support package",
      defaultPath: `pam-osc-support-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "zip archive", extensions: ["zip"] }],
    });
    if (picked.canceled || !picked.filePath) return { status: "canceled" };
    await sessionLog.flush();
    const files = catalog.allFiles();
    try {
      await writeSupportPackage(picked.filePath, {
        devices: files.devices,
        mappings: files.mappings,
        settingsFile: join(userData, "settings.json"),
        logFiles: [sessionLog.filePath, sessionLog.previousPath],
        manifest: {
          app: "pam-osc",
          version: app.getVersion(),
          exportedAt: new Date().toISOString(),
          platform: process.platform,
          devices: files.devices.length,
          mappings: files.mappings.length,
        },
      });
    } catch {
      return { status: "error", error: "could not write the support package" };
    }
    sessionLog.log("exported support package");
    return { status: "saved", file: picked.filePath };
  });

  // ---- visual mapping editor (PAM-6) ----
  const activeIds = () => new Set(settingsStore.settings.activeMappingIds);
  handle(IPC.getMappingForEdit, (_event, id) => catalog.mappingForEdit(String(id)));
  handle(IPC.getDeviceDefinitionForEdit, (_event, id) => catalog.deviceForEdit(String(id), activeIds()));
  handle(IPC.getDefinitionUsage, (_event, id) => catalog.definitionUsage(String(id), activeIds()));

  // Editor saves reuse the PAM-3 apply transaction for the engine reload
  // (design → Save → validate → reload): same stop→start, same rollback.
  const reloadEngineIfNeeded = async (needed: boolean): Promise<Notice[]> => {
    if (!needed || engineHost.snapshot().engineState === "stopped") return [];
    const settings = settingsStore.settings;
    const outcome = await engineHost.apply(engineConfigFrom(settings.console, settings.activeMappingIds));
    if (outcome.ok) return [];
    return [
      {
        severity: "error",
        message: outcome.rolledBack
          ? `the saved files did not apply — the engine keeps running with the previous state: ${outcome.error}`
          : `engine restart failed after saving: ${outcome.error}`,
      },
    ];
  };

  handle(IPC.saveMapping, async (_event, draft): Promise<EditorSaveResult> => {
    const result = await catalog.saveMapping(draft);
    if (!result.ok) return result;
    sessionLog.log(`saved mapping "${result.id}"`);
    const notices = await reloadEngineIfNeeded(settingsStore.settings.activeMappingIds.includes(result.id));
    for (const notice of notices) pushNotice(notice);
    return { ok: true, id: result.id, snapshot: await buildSnapshot(), notices };
  });

  handle(IPC.saveDeviceDefinition, async (_event, rawRequest): Promise<EditorSaveResult> => {
    const request = rawRequest as SaveDeviceRequest;
    if (typeof request !== "object" || request === null || !Array.isArray(request.retargetMappingIds)) {
      return { ok: false, errors: [{ path: "", message: "invalid save request" }] };
    }
    const result = await catalog.saveDeviceDefinition({
      draft: request.draft,
      retargetMappingIds: request.retargetMappingIds.map(String),
      createNew: request.createNew === true,
    });
    if (!result.ok) return result;
    sessionLog.log(`saved board "${result.id}"`);

    const notices: Notice[] = [];
    if (result.rewrittenMappings.length > 0) {
      notices.push({
        severity: "info",
        message: `updated mapping file(s) along with the board: ${result.rewrittenMappings.join(", ")}`,
      });
    }
    const active = activeIds();
    const affectsEngine =
      catalog.definitionUsage(result.id, active).some((ref) => ref.active) ||
      result.rewrittenMappings.some((id) => active.has(id));
    notices.push(...(await reloadEngineIfNeeded(affectsEngine)));
    for (const notice of notices) pushNotice(notice);
    return { ok: true, id: result.id, snapshot: await buildSnapshot(), notices };
  });

  handle(IPC.startMidiLearn, (_event, port) => {
    if (typeof port !== "string" || port.length === 0) return { ok: false, error: "no MIDI input port given" };
    return midiLearn.start(port);
  });
  handle(IPC.cancelMidiLearn, () => midiLearn.cancel());
  handle(IPC.startMidiIndicate, (_event, port) => {
    if (typeof port !== "string" || port.length === 0) return { ok: false, error: "no MIDI input port given" };
    return midiLearn.startIndicate(port);
  });
  handle(IPC.stopMidiIndicate, () => midiLearn.cancel());

  // ---- diagnostics & engine control (PAM-4) ----
  handle(IPC.startEngine, async () => {
    if (engineHost.snapshot().engineState !== "stopped") return { ok: false, error: "engine is already running" };
    const settings = settingsStore.settings;
    if (settings.activeMappingIds.length === 0) {
      return { ok: false, error: "no active mappings configured — add a device under Setup first" };
    }
    const error = await engineHost.autoStart(engineConfigFrom(settings.console, settings.activeMappingIds));
    if (error) runPortDiagnosis();
    return error ? { ok: false, error } : { ok: true };
  });
  handle(IPC.stopEngine, () => engineHost.stop());
  handle(IPC.checkConnection, () => {
    resetPortDiagnosis(); // a re-check earns a fresh diagnosis if it fails again
    engineHost.checkConnection();
  });
  handle(IPC.runOutputTest, (_event, mappingId) => engineHost.outputTest(String(mappingId)));

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
    midiLearn.shutdown();
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
    sessionLog.log("session ending");
    trafficBuffer.stop();
    void engineHost.shutdown();
  });
}
