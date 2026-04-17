import { create } from "zustand";

export interface Tab {
  id: string;
  label: string;
  type: "thread" | "projects" | "chat";
  threadId?: string;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string;
  addTab: (tab: Tab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabLabel: (id: string, label: string) => void;
}

export const useTabsStore = create<TabsState>((set) => ({
  tabs: [
    { id: "projects-root", label: "Projects", type: "projects" },
  ],
  activeTabId: "projects-root",

  addTab: (tab) =>
    set((state) => {
      // Don't add duplicate tabs
      if (state.tabs.some((t) => t.id === tab.id)) {
        return { activeTabId: tab.id };
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id };
    }),

  removeTab: (id) =>
    set((state) => {
      // Can't remove the projects tab
      if (id === "projects-root") return state;
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActiveTabId =
        state.activeTabId === id
          ? newTabs[newTabs.length - 1]?.id ?? "projects-root"
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabLabel: (id, label) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, label } : t)),
    })),
}));
