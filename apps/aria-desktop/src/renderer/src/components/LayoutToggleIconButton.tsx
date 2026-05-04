import type { ReactNode } from "react";

import { Toggle } from "./ui/toggle.js";

export type LayoutToggleIconButtonProps = {
  active?: boolean;
  className?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

export function LayoutToggleIconButton({
  active = false,
  className,
  icon,
  label,
  onClick,
}: LayoutToggleIconButtonProps) {
  return (
    <Toggle
      aria-label={label}
      className={(state) =>
        `desktop-icon-button${state.pressed ? " is-active" : ""}${className ? ` ${className}` : ""}`
      }
      pressed={active}
      onPressedChange={onClick}
    >
      {icon}
    </Toggle>
  );
}
