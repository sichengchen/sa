import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ariaDesktop", {
  target: {
    serverId: process.env.ARIA_DESKTOP_SERVER_ID ?? "desktop",
    baseUrl: process.env.ARIA_DESKTOP_SERVER_URL ?? "http://127.0.0.1:7420/",
  },
});
