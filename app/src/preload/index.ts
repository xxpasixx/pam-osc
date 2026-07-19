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
  setOnboardingCompleted: () => ipcRenderer.invoke(IPC.setOnboardingCompleted),
  revealMappingsFolder: () => ipcRenderer.invoke(IPC.revealMappingsFolder),
  duplicateMapping: (id) => ipcRenderer.invoke(IPC.duplicateMapping, id),
  createMapping: (request) => ipcRenderer.invoke(IPC.createMapping, request),
  pickV1MappingFile: () => ipcRenderer.invoke(IPC.pickV1MappingFile),
  importV1Mapping: (request) => ipcRenderer.invoke(IPC.importV1Mapping, request),
  getMappingForEdit: (id) => ipcRenderer.invoke(IPC.getMappingForEdit, id),
  getDeviceDefinitionForEdit: (id) => ipcRenderer.invoke(IPC.getDeviceDefinitionForEdit, id),
  getDefinitionUsage: (id) => ipcRenderer.invoke(IPC.getDefinitionUsage, id),
  saveMapping: (draft) => ipcRenderer.invoke(IPC.saveMapping, draft),
  saveDeviceDefinition: (request) => ipcRenderer.invoke(IPC.saveDeviceDefinition, request),
  startMidiLearn: (inputPort) => ipcRenderer.invoke(IPC.startMidiLearn, inputPort),
  cancelMidiLearn: () => ipcRenderer.invoke(IPC.cancelMidiLearn),
  startMidiIndicate: (inputPort) => ipcRenderer.invoke(IPC.startMidiIndicate, inputPort),
  stopMidiIndicate: () => ipcRenderer.invoke(IPC.stopMidiIndicate),
  exportMapping: (id) => ipcRenderer.invoke(IPC.exportMapping, id),
  exportDevice: (id) => ipcRenderer.invoke(IPC.exportDevice, id),
  importMappingFile: () => ipcRenderer.invoke(IPC.importMappingFile),
  importDeviceFile: () => ipcRenderer.invoke(IPC.importDeviceFile),
  exportSupportPackage: () => ipcRenderer.invoke(IPC.exportSupportPackage),
  getMa3Setup: () => ipcRenderer.invoke(IPC.getMa3Setup),
  installMa3Asset: (base, asset, overwrite) => ipcRenderer.invoke(IPC.installMa3Asset, base, asset, overwrite),
  revealBundledAsset: (asset) => ipcRenderer.invoke(IPC.revealBundledAsset, asset),
  startEngine: () => ipcRenderer.invoke(IPC.startEngine),
  stopEngine: () => ipcRenderer.invoke(IPC.stopEngine),
  checkConnection: () => ipcRenderer.invoke(IPC.checkConnection),
  runOutputTest: (mappingId) => ipcRenderer.invoke(IPC.runOutputTest, mappingId),
  onConnection: subscribe(IPC.evConnection),
  onConsoleState: subscribe(IPC.evConsoleState),
  onDevices: subscribe(IPC.evDevices),
  onEngineState: subscribe(IPC.evEngineState),
  onMidiPorts: subscribe(IPC.evMidiPorts),
  onNotice: subscribe(IPC.evNotice),
  onTraffic: subscribe(IPC.evTraffic),
  onPortDiagnosis: subscribe(IPC.evPortDiagnosis),
  onMidiLearn: subscribe(IPC.evMidiLearn),
  onMidiActivity: subscribe(IPC.evMidiActivity),
  onCatalogChanged: subscribe(IPC.evCatalogChanged),
};

contextBridge.exposeInMainWorld("pamOsc", api);
