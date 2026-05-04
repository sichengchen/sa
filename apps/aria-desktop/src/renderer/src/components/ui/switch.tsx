import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { composeBaseClassName } from "./base-class-name.js";

type SwitchProps = SwitchPrimitive.Root.Props & {
  thumbClassName?: SwitchPrimitive.Thumb.Props["className"];
};

function Switch({ children, className, thumbClassName, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={composeBaseClassName("desktop-ui-switch", className)}
      {...props}
    >
      {children ?? (
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={composeBaseClassName("desktop-ui-switch-thumb", thumbClassName)}
        />
      )}
    </SwitchPrimitive.Root>
  );
}

export { Switch };
