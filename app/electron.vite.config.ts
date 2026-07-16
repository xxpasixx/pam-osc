import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  // Main process: ESM (package.json "type": "module"); native/externalized
  // deps (easymidi, osc-min, zod) stay in dependencies.
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  // Preload runs sandboxed (design: sandbox on) — sandboxed preloads must be
  // CommonJS, so it is built as .cjs while everything else stays ESM.
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: "cjs" },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
