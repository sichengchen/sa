import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";

import { composeBaseClassName } from "./base-class-name.js";

function Toggle<Value extends string = string>({
  className,
  ...props
}: TogglePrimitive.Props<Value>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={composeBaseClassName("desktop-ui-toggle", className)}
      {...props}
    />
  );
}

export { Toggle };
