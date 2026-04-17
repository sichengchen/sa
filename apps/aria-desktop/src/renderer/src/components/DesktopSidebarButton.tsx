import type { ReactNode } from "react";

export type DesktopSidebarButtonProps = {
  active?: boolean;
  className?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

export function DesktopSidebarButton({
  active = false,
  className,
  icon,
  label,
  onClick,
}: DesktopSidebarButtonProps) {
  return (
    <button
      type="button"
      className={`desktop-sidebar-button${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
    >
      <span className="desktop-sidebar-button-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="desktop-sidebar-button-label">{label}</span>
    </button>
  );
}
