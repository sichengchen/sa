import type { ReactNode } from "react";

export type DesktopIconButtonProps = {
  active?: boolean;
  className?: string;
  controlsId?: string;
  expanded?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
};

export function DesktopIconButton({
  active = false,
  className,
  controlsId,
  expanded,
  icon,
  label,
  onClick,
  pressed,
}: DesktopIconButtonProps) {
  return (
    <button
      type="button"
      className={`desktop-icon-button${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      aria-controls={controlsId}
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
