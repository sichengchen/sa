import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { composeBaseClassName } from "./base-class-name.js";

type SelectContentProps = SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignItemWithTrigger" | "alignOffset" | "side" | "sideOffset"
  > & {
    listClassName?: SelectPrimitive.List.Props["className"];
    positionerClassName?: SelectPrimitive.Positioner.Props["className"];
  };

const Select = SelectPrimitive.Root;

function SelectGroup(props: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({ children, className, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={composeBaseClassName("desktop-ui-select-trigger", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon" className="desktop-ui-select-icon">
        <ChevronDown aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  align = "center",
  alignItemWithTrigger = true,
  alignOffset,
  children,
  className,
  listClassName,
  positionerClassName,
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        className={composeBaseClassName("desktop-ui-select-positioner", positionerClassName)}
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={composeBaseClassName("desktop-ui-select-content", className)}
          {...props}
        >
          <SelectPrimitive.List
            data-slot="select-list"
            className={composeBaseClassName("desktop-ui-select-list", listClassName)}
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={composeBaseClassName("desktop-ui-select-label", className)}
      {...props}
    />
  );
}

function SelectItem({ children, className, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={composeBaseClassName("desktop-ui-select-item", className)}
      {...props}
    >
      <SelectPrimitive.ItemText data-slot="select-item-text">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        className="desktop-ui-select-item-indicator"
      >
        <Check aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={composeBaseClassName("desktop-ui-select-separator", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
