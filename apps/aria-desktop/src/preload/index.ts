import { contextBridge, ipcRenderer } from "electron";
import { ariaDesktopChannels, type AriaDesktopApi } from "../shared/api.js";

const ariaDesktopApi: AriaDesktopApi = {
  ping: () => ipcRenderer.invoke(ariaDesktopChannels.ping),
  getRuntimeInfo: () => ipcRenderer.invoke(ariaDesktopChannels.getRuntimeInfo),
};

contextBridge.exposeInMainWorld("ariaDesktop", ariaDesktopApi);
