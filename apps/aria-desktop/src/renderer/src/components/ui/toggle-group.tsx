import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";

import { composeBaseClassName } from "./base-class-name.js";

function ToggleGroup<Value extends string = string>({
  className,
  ...props
}: ToggleGroupPrimitive.Props<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={composeBaseClassName("desktop-ui-toggle-group", className)}
      {...props}
    />
  );
}

export { ToggleGroup };
