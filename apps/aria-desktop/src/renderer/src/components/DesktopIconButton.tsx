import type { ReactNode } from "react";

export type DesktopIconButtonProps = {
  active?: boolean;
  className?: string;
  controlsId?: string;
  disabled?: boolean;
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
  disabled = false,
  expanded,
  icon,
  label,
  onClick,
  pressed,
}: DesktopIconButtonProps) {
  return (
    <button
      type="button"
      className={`desktop-icon-button${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
      aria-controls={controlsId}
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
