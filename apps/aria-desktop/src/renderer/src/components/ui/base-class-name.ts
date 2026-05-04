import { cn } from "../../lib/utils.js";

export type BaseClassName<State> = string | ((state: State) => string | undefined);

export function composeBaseClassName<State>(
  baseClassName: string,
  className?: BaseClassName<State>,
): BaseClassName<State> {
  if (!className) {
    return baseClassName;
  }

  if (typeof className === "function") {
    return (state) => cn(baseClassName, className(state));
  }

  return cn(baseClassName, className);
}
