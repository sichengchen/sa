import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, "src");
const packagesDir = resolve(rootDir, "..", "..", "packages");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(srcDir, "electron-main.ts"),
        formats: ["es"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(srcDir, "electron-preload.ts"),
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // Browser stub for desktop-bridge (not available in renderer)
        "@aria/desktop-bridge": resolve(rootDir, "src/browser-stubs/desktop-bridge.ts"),
        // Package aliases
        "@aria/desktop-ui": resolve(packagesDir, "desktop-ui", "src"),
        "@aria/desktop": resolve(packagesDir, "desktop", "src"),
        "@aria/access-client": resolve(packagesDir, "access-client", "src"),
        "@aria/projects": resolve(packagesDir, "projects", "src"),
        "@aria/protocol": resolve(packagesDir, "protocol", "src"),
        "@aria/agents-coding": resolve(packagesDir, "agents-coding", "src"),
        "@aria/ui": resolve(packagesDir, "ui", "src"),
        "@aria/jobs": resolve(packagesDir, "jobs", "src"),
        "@aria/workspaces": resolve(packagesDir, "workspaces", "src"),
        "@aria/runtime": resolve(packagesDir, "runtime", "src"),
        "@aria/policy": resolve(packagesDir, "policy", "src"),
        "@aria/prompt": resolve(packagesDir, "prompt", "src"),
        "@aria/store": resolve(packagesDir, "store", "src"),
        "@aria/tools": resolve(packagesDir, "tools", "src"),
        "@aria/memory": resolve(packagesDir, "memory", "src"),
        "@aria/automation": resolve(packagesDir, "automation", "src"),
        "@aria/handoff": resolve(packagesDir, "handoff", "src"),
        "@aria/server": resolve(packagesDir, "server", "src"),
        "@aria/gateway": resolve(packagesDir, "gateway", "src"),
        "@aria/audit": resolve(packagesDir, "audit", "src"),
        "@aria/agent-aria": resolve(packagesDir, "agent-aria", "src"),
        "@aria/providers-aria": resolve(packagesDir, "providers-aria", "src"),
        "@aria/providers-codex": resolve(packagesDir, "providers-codex", "src"),
        "@aria/providers-claude-code": resolve(packagesDir, "providers-claude-code", "src"),
        "@aria/providers-opencode": resolve(packagesDir, "providers-opencode", "src"),
      },
    },
    root: resolve(srcDir, "renderer"),
    build: {
      outDir: resolve(rootDir, "dist/renderer"),
      rollupOptions: {
        input: resolve(srcDir, "renderer", "index.html"),
      },
    },
  },
});
