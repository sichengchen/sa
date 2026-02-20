import React from "react";
import { render } from "ink";
import { ConfigApp } from "./ConfigMenu.js";

export async function runConfig(homeDir: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const instance = render(
      React.createElement(ConfigApp, {
        homeDir,
        onExit: () => {
          instance.unmount();
          resolve();
        },
      })
    );
  });
}
