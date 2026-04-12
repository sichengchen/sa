import { ariaDesktopContextPanels, ariaDesktopNavigation } from "@aria/desktop";

export const ariaDesktopAppFrame = {
  kind: "three-pane-workbench",
  sidebar: {
    label: "Projects",
    mode: "unified-project-thread-tree",
    navigation: ariaDesktopNavigation,
  },
  center: {
    defaultSpaceId: "projects",
    defaultScreenId: "thread-list",
    activeScreenId: "thread",
    threadListMode: "unified-project-thread-list",
  },
  rightRail: {
    defaultContextPanelId: "review",
    panels: ariaDesktopContextPanels,
  },
  composer: {
    placement: "bottom-docked",
    scope: "active-thread",
  },
  statusStrip: {
    threadEnvironmentPlacement: "thread-header",
    connectionPlacement: "top-chrome",
  },
} as const;
