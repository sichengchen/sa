import type { ReactNode } from "react";

type DesktopSidebarSectionHeaderProps = {
  actions?: ReactNode;
  title: ReactNode;
};

export function DesktopSidebarSectionHeader({ actions, title }: DesktopSidebarSectionHeaderProps) {
  return (
    <div className="desktop-sidebar-section-header">
      <div className="desktop-sidebar-section-title">{title}</div>
      {actions ? <div className="desktop-sidebar-section-actions">{actions}</div> : null}
    </div>
  );
}
