import type { AriaDesktopApi } from "../../shared/api.js";

declare global {
  interface Window {
    ariaDesktop: AriaDesktopApi;
  }
}

declare module "*.css";

export {};
