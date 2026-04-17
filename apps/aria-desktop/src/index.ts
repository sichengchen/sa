export {
  ariaDesktopChannels,
  type AriaDesktopApi,
  type AriaDesktopRuntimeInfo,
} from "./shared/api.js";

export const ariaDesktopHost = {
  id: "aria-desktop",
  packageName: "aria-desktop",
  displayName: "Aria Desktop",
  surface: "desktop",
} as const;
