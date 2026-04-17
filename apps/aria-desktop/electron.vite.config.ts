import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
    },
  },
  renderer: {
    root: resolve(rootDir, "src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(rootDir, "src/renderer/src"),
      },
    },
    build: {
      outDir: resolve(rootDir, "dist/renderer"),
    },
  },
});
