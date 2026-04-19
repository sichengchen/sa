type DesktopThreadListItemProps = {
  active?: boolean;
  disabled?: boolean;
  meta?: string | null;
  onSelect: () => void;
  preview?: string | null;
  title: string;
};

export function DesktopThreadListItem({
  active = false,
  disabled = false,
  meta,
  onSelect,
  title,
}: DesktopThreadListItemProps) {
  return (
    <button
      type="button"
      className={`thread-list-item${active ? " is-active" : ""}${disabled ? " is-disabled" : ""} is-compact`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="thread-list-item-main">
        <span className="thread-list-item-name">{title}</span>
      </span>
      {meta ? <span className="thread-list-item-meta">{meta}</span> : null}
    </button>
  );
}
