import { app, BrowserWindow } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureEngine } from "@aria/server/daemon";
import { DesktopAriaService } from "./desktop-aria-service.js";
import { DesktopProjectsService } from "./desktop-projects-service.js";
import { DesktopSettingsService } from "./desktop-settings-service.js";
import { registerDesktopIpc } from "./ipc.js";
import { getDesktopPreloadPath, getDesktopRendererHtmlPath } from "./desktop-main-paths.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const desktopProjectsService = new DesktopProjectsService();
let mainWindow: BrowserWindow | null = null;
let desktopAriaService: DesktopAriaService | null = null;

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Aria Desktop",
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: getDesktopPreloadPath(currentDir),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep Node-capable access constrained to the preload bridge.
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(getDesktopRendererHtmlPath(currentDir));
  }

  return window;
}

app.setName("Aria Desktop");

app.whenReady().then(async () => {
  await ensureEngine();
  desktopAriaService = new DesktopAriaService();
  const desktopSettingsService = new DesktopSettingsService();
  desktopProjectsService.init();
  registerDesktopIpc(desktopProjectsService, desktopAriaService, desktopSettingsService);
  mainWindow = await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  desktopProjectsService.close();
});
