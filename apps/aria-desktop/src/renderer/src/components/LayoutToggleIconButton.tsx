import type { ReactNode } from "react";
import { DesktopIconButton } from "./DesktopIconButton.js";

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
    <DesktopIconButton
      active={active}
      className={className}
      icon={icon}
      label={label}
      onClick={onClick}
      pressed={active}
    />
  );
}
