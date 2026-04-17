import { app, BrowserWindow } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerDesktopIpc } from "./ipc.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

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
      preload: join(currentDir, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep Node-capable access constrained to the preload bridge.
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(join(currentDir, "../renderer/index.html"));
  }

  return window;
}

app.setName("Aria Desktop");

app.whenReady().then(async () => {
  registerDesktopIpc();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
