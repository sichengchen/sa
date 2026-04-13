import {
  ariaMobileApp,
  ariaMobileActionSections,
  ariaMobileDetailPresentations,
  ariaMobileTabs,
  type AriaMobileBootstrap,
  type AriaMobileServerInput,
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
  createConnectedAriaMobileAppShell,
  createAriaMobileAppShell,
  connectAriaMobileAppShell,
  sendAriaMobileAppShellMessage,
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
  createConnectedAriaMobileAppShell,
  createAriaMobileApplicationShell,
  createAriaMobileApplicationShellBootstrap,
  createAriaMobileAppShell,
  connectAriaMobileAppShell,
  sendAriaMobileAppShellMessage,
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
  serverSwitcher: ariaMobileApp.serverSwitcher,
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

interface AriaMobileHostBootstrapOptions {
  target: AccessClientTarget;
  initialThread?: AriaMobileShellInitialThread;
  servers?: AriaMobileServerInput[];
  activeServerId?: string;
}

function normalizeMobileHostBootstrapOptions(
  targetOrOptions: AccessClientTarget | AriaMobileHostBootstrapOptions,
  initialThread?: AriaMobileShellInitialThread,
): AriaMobileHostBootstrapOptions {
  if ("target" in targetOrOptions) {
    return targetOrOptions;
  }

  return {
    target: targetOrOptions,
    initialThread,
  };
}

export function createAriaMobileHostBootstrap(
  targetOrOptions: AccessClientTarget | AriaMobileHostBootstrapOptions,
  initialThread?: AriaMobileShellInitialThread,
): AriaMobileHostBootstrap {
  const options = normalizeMobileHostBootstrapOptions(targetOrOptions, initialThread);
  const appShell = createAriaMobileAppShell({
    ...options,
  });

  return {
    host: ariaMobileHost,
    shell: ariaMobileApp,
    appShell,
    bootstrap: appShell,
  };
}
