import type { PamOscApi } from "../../shared/ipc.js";

declare global {
  interface Window {
    /** The narrow preload bridge — the renderer's only way out (see src/shared/ipc.ts). */
    pamOsc: PamOscApi;
  }
}

export {};
