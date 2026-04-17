const { contextBridge, ipcRenderer } = require("electron");
const { existsSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const DEFAULT_LOCAL_HTTP_URL = "http://127.0.0.1:7420/";

function resolveRuntimeHome() {
  return process.env.ARIA_HOME || join(homedir(), ".aria");
}

function readTrimmedFile(path: string) {
  return existsSync(path) ? readFileSync(path, "utf-8").trim() : undefined;
}

function resolveDesktopTarget() {
  const runtimeHome = resolveRuntimeHome();
  const baseUrl =
    process.env.ARIA_DESKTOP_SERVER_URL ||
    readTrimmedFile(join(runtimeHome, "engine.url")) ||
    DEFAULT_LOCAL_HTTP_URL;
  const token =
    process.env.ARIA_DESKTOP_SERVER_TOKEN || readTrimmedFile(join(runtimeHome, "engine.token"));

  return {
    serverId: process.env.ARIA_DESKTOP_SERVER_ID ?? "desktop",
    baseUrl,
    token,
  };
}

contextBridge.exposeInMainWorld("ariaDesktop", {
  target: resolveDesktopTarget(),
  terminal: {
    spawn: (id: string, cwd?: string) => ipcRenderer.invoke("terminal:spawn", id, cwd),
    write: (id: string, data: string) => ipcRenderer.invoke("terminal:write", id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke("terminal:resize", id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke("terminal:kill", id),
    list: () => ipcRenderer.invoke("terminal:list"),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data);
      ipcRenderer.on("terminal:data", handler);
      return () => ipcRenderer.removeListener("terminal:data", handler);
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) => callback(id, exitCode);
      ipcRenderer.on("terminal:exit", handler);
      return () => ipcRenderer.removeListener("terminal:exit", handler);
    },
  },
});
