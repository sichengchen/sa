import { join } from "node:path";

export interface AriaDesktopElectronHostOptions {
  distDir: string;
  devServerUrl?: string;
}

export interface AriaDesktopElectronHostBootstrap {
  preloadPath: string;
  rendererEntry: { kind: "url"; value: string } | { kind: "file"; value: string };
  window: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
  };
}

export interface AriaDesktopElectronWindowHandle {
  loadURL(url: string): unknown;
  loadFile(filePath: string): unknown;
}

export interface AriaDesktopElectronRuntime {
  platform: string;
  whenReady(): Promise<void>;
  onActivate(handler: () => void): void;
  onWindowAllClosed(handler: () => void): void;
  createWindow(options: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    preloadPath: string;
  }): AriaDesktopElectronWindowHandle;
  getAllWindows(): readonly unknown[];
  quit(): void;
}

export function createAriaDesktopElectronHostBootstrap(
  options: AriaDesktopElectronHostOptions,
): AriaDesktopElectronHostBootstrap {
  return {
    preloadPath: join(options.distDir, "..", "preload", "index.cjs"),
    rendererEntry: options.devServerUrl
      ? { kind: "url", value: options.devServerUrl }
      : {
          kind: "file",
          value: join(options.distDir, "..", "renderer", "index.html"),
        },
    window: {
      width: 1440,
      height: 960,
      minWidth: 1100,
      minHeight: 720,
    },
  };
}

export async function runAriaDesktopElectronHost(
  runtime: AriaDesktopElectronRuntime,
  options: AriaDesktopElectronHostOptions,
): Promise<AriaDesktopElectronHostBootstrap> {
  const host = createAriaDesktopElectronHostBootstrap(options);

  const openWindow = () => {
    const window = runtime.createWindow({
      ...host.window,
      preloadPath: host.preloadPath,
    });

    if (host.rendererEntry.kind === "url") {
      void window.loadURL(host.rendererEntry.value);
    } else {
      void window.loadFile(host.rendererEntry.value);
    }
  };

  await runtime.whenReady();
  openWindow();

  runtime.onActivate(() => {
    if (runtime.getAllWindows().length === 0) {
      openWindow();
    }
  });

  runtime.onWindowAllClosed(() => {
    if (runtime.platform !== "darwin") {
      runtime.quit();
    }
  });

  return host;
}
