import { type ReactElement, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TabItem {
  id: string;
  label: string;
  closable?: boolean;
}

export interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose?: (id: string) => void;
  className?: string;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  className,
}: TabBarProps): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Workspace tabs"
      className={cn(
        "flex items-stretch overflow-hidden border-b border-[var(--aria-border)]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "group inline-flex min-h-[32px] items-center border-r border-[var(--aria-border)] bg-transparent px-3 text-sm transition-colors",
              isActive
                ? "bg-[var(--aria-panel-active)] text-[var(--aria-text)]"
                : "text-[var(--aria-text-muted)] hover:bg-[var(--aria-panel-muted)] hover:text-[var(--aria-text)]",
            )}
          >
            <button
              type="button"
              className="flex items-center gap-2 bg-transparent text-inherit"
              onClick={() => onTabSelect(tab.id)}
            >
              <span className="truncate max-w-[120px]">{tab.label}</span>
              {tab.closable && onTabClose && (
                <span
                  role="button"
                  aria-label={`Close ${tab.label}`}
                  className="ml-1 flex items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--aria-panel-muted)] group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export interface TabContentProps {
  activeTabId: string;
  tabId: string;
  children?: ReactNode;
  className?: string;
}

export function TabContent({
  activeTabId,
  tabId,
  children,
  className,
}: TabContentProps): ReactElement | null {
  if (activeTabId !== tabId) return null;

  return (
    <div
      role="tabpanel"
      tabIndex={0}
      className={cn("flex-1 overflow-auto p-3", className)}
    >
      {children}
    </div>
  );
}
