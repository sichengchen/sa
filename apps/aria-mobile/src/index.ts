import {
  ariaMobileApp,
  ariaMobileActionSections,
  ariaMobileDetailPresentations,
  ariaMobileTabs,
  type AriaMobileBootstrap,
  type AriaMobileShellInitialThread,
} from "@aria/mobile";
import type { AccessClientTarget } from "@aria/access-client";
import {
  ariaMobileApplication,
  ariaMobileAppFrame,
  ariaMobileAppModel,
  ariaMobileLaunchModes,
  ariaMobileNavigation,
  createAriaMobileApplicationBootstrap,
  createAriaMobileAppShell,
  type AriaMobileAppShell,
  type AriaMobileApplicationBootstrap,
  type AriaMobileNavigation,
  type AriaMobileNavigationSpace,
  type AriaMobileNavigationSpaceScreen,
} from "./app.js";
import {
  AriaMobileApplicationRoot,
  createAriaMobileApplicationRoot,
  type AriaMobileApplicationRootProps,
} from "./root.js";
import {
  AriaMobileApplicationShell,
  createAriaMobileApplicationShell,
  createAriaMobileApplicationShellBootstrap,
  type AriaMobileApplicationShellBootstrap,
  type AriaMobileApplicationShellProps,
} from "./shell.js";

export {
  ariaMobileApplication,
  ariaMobileAppFrame,
  ariaMobileAppModel,
  ariaMobileLaunchModes,
  ariaMobileNavigation,
  createAriaMobileApplicationBootstrap,
  createAriaMobileApplicationShell,
  createAriaMobileApplicationShellBootstrap,
  createAriaMobileAppShell,
  AriaMobileApplicationRoot,
  createAriaMobileApplicationRoot,
  AriaMobileApplicationShell,
  type AriaMobileAppShell,
  type AriaMobileApplicationBootstrap,
  type AriaMobileApplicationShellBootstrap,
  type AriaMobileApplicationShellProps,
  type AriaMobileApplicationRootProps,
  type AriaMobileNavigation,
  type AriaMobileNavigationSpace,
  type AriaMobileNavigationSpaceScreen,
};

export * from "@aria/mobile";

export const ariaMobileHost = {
  id: "aria-mobile",
  packageName: "aria-mobile",
  displayName: "Aria Mobile",
  surface: "mobile",
  shellPackage: "@aria/mobile",
  sharedPackages: ariaMobileApp.sharedPackages,
  capabilities: ariaMobileApp.capabilities,
  navigation: ariaMobileNavigation,
  tabs: ariaMobileTabs,
  detailPresentations: ariaMobileDetailPresentations,
  actionSections: ariaMobileActionSections,
} as const;

export interface AriaMobileHostBootstrap {
  host: typeof ariaMobileHost;
  shell: typeof ariaMobileApp;
  appShell: ReturnType<typeof createAriaMobileAppShell>;
  bootstrap: AriaMobileBootstrap;
}

export function createAriaMobileHostBootstrap(
  target: AccessClientTarget,
  initialThread?: AriaMobileShellInitialThread,
): AriaMobileHostBootstrap {
  const appShell = createAriaMobileAppShell({
    target,
    initialThread,
  });

  return {
    host: ariaMobileHost,
    shell: ariaMobileApp,
    appShell,
    bootstrap: appShell,
  };
}
