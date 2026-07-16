import { contextBridge, ipcRenderer } from "electron";
import { IPC, type PamOscApi } from "../shared/ipc.js";

/**
 * The narrow bridge (design → IPC contract): exactly the PamOscApi surface,
 * nothing generic, no Node APIs in the renderer. Runs sandboxed — built as
 * CommonJS (see electron.vite.config.ts).
 */

function subscribe<T>(channel: string) {
  return (listener: (payload: T) => void): (() => void) => {
    const handler = (_event: unknown, payload: T) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.off(channel, handler);
    };
  };
}

const api: PamOscApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  listMidiPorts: () => ipcRenderer.invoke(IPC.listMidiPorts),
  applySettings: (draft) => ipcRenderer.invoke(IPC.applySettings, draft),
  revealMappingsFolder: () => ipcRenderer.invoke(IPC.revealMappingsFolder),
  duplicateMapping: (id) => ipcRenderer.invoke(IPC.duplicateMapping, id),
  onConnection: subscribe(IPC.evConnection),
  onDevices: subscribe(IPC.evDevices),
  onEngineState: subscribe(IPC.evEngineState),
  onMidiPorts: subscribe(IPC.evMidiPorts),
  onNotice: subscribe(IPC.evNotice),
};

contextBridge.exposeInMainWorld("pamOsc", api);
