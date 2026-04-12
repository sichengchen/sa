import type { ReactElement } from "react";
import type { CreateAriaMobileShellOptions } from "@aria/mobile";
import { AriaMobileApplicationShell, createAriaMobileApplicationShell } from "./shell.js";
import type { AriaMobileAppShell, AriaMobileNavigation } from "./app.js";

export interface AriaMobileApplicationRootProps {
  shell: AriaMobileAppShell;
  navigation?: AriaMobileNavigation;
}

export function AriaMobileApplicationRoot(
  props: AriaMobileApplicationRootProps,
): ReactElement {
  return (
    <AriaMobileApplicationShell shell={props.shell} navigation={props.navigation} />
  );
}

export function createAriaMobileApplicationRoot(
  options: CreateAriaMobileShellOptions,
): ReactElement {
  return createAriaMobileApplicationShell(options);
}
