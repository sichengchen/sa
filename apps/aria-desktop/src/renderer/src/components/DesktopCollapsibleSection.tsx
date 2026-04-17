import type { ReactNode } from "react";

export type DesktopCollapsibleSectionProps = {
  children: ReactNode;
  className?: string;
  collapsed?: boolean;
  id?: string;
  innerClassName?: string;
};

export function DesktopCollapsibleSection({
  children,
  className,
  collapsed = false,
  id,
  innerClassName,
}: DesktopCollapsibleSectionProps) {
  return (
    <div
      id={id}
      className={`desktop-collapsible-section${collapsed ? " is-collapsed" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden={collapsed}
    >
      <div
        className={`desktop-collapsible-section-inner${innerClassName ? ` ${innerClassName}` : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
