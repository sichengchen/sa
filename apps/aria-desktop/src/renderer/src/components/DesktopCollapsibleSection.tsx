import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent } from "./ui/collapsible.js";

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
    <Collapsible open={!collapsed}>
      <CollapsibleContent
        id={id}
        keepMounted
        className={(state) =>
          `desktop-collapsible-section${state.open ? "" : " is-collapsed"}${className ? ` ${className}` : ""}`
        }
        aria-hidden={collapsed}
      >
        <div
          className={`desktop-collapsible-section-inner${innerClassName ? ` ${innerClassName}` : ""}`}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
