import type { PamOscApi } from "../../shared/ipc.js";
import type { PamOscUpdatesApi } from "../../shared/update.js";

declare global {
  interface Window {
    /** The narrow preload bridge — the renderer's only way out (see src/shared/ipc.ts). */
    pamOsc: PamOscApi;
    /** PAM-34: the updater's own bridge (src/shared/update.ts). */
    pamOscUpdates: PamOscUpdatesApi;
  }
}

export {};
