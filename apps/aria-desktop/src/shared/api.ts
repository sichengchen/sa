export const ariaDesktopChannels = {
  ping: "aria-desktop:ping",
  getRuntimeInfo: "aria-desktop:get-runtime-info",
} as const;

export interface AriaDesktopRuntimeInfo {
  productName: string;
  platform: NodeJS.Platform;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}

export interface AriaDesktopApi {
  ping: () => Promise<string>;
  getRuntimeInfo: () => Promise<AriaDesktopRuntimeInfo>;
}
