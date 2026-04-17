import { app, ipcMain } from "electron";
import { ariaDesktopChannels, type AriaDesktopRuntimeInfo } from "../shared/api.js";

let registered = false;

function getRuntimeInfo(): AriaDesktopRuntimeInfo {
  return {
    productName: app.getName(),
    platform: process.platform,
    versions: {
      chrome: process.versions.chrome ?? "",
      electron: process.versions.electron ?? "",
      node: process.versions.node ?? "",
    },
  };
}

export function registerDesktopIpc(): void {
  if (registered) {
    return;
  }

  ipcMain.handle(ariaDesktopChannels.ping, () => "pong");
  ipcMain.handle(ariaDesktopChannels.getRuntimeInfo, () => getRuntimeInfo());

  registered = true;
}
