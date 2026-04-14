import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const desktopPackageJsonPath = new URL("../apps/aria-desktop/package.json", import.meta.url);

describe("aria-desktop packaging surface", () => {
  test("declares host, renderer, and smoke-build scripts for the desktop app", async () => {
    const packageJson = JSON.parse(await readFile(desktopPackageJsonPath, "utf-8")) as {
      main?: string;
      scripts?: Record<string, string>;
    };

    expect(packageJson.main).toBe("./dist/electron-main.js");
    expect(packageJson.scripts).toMatchObject({
      "dev:renderer": "vite --config ./vite.config.ts",
      "dev:host":
        "bun run build:host && ARIA_DESKTOP_DEV_SERVER_URL=http://127.0.0.1:5173 electron ./dist/electron-main.js",
      "build:renderer": "vite build --config ./vite.config.ts",
      "build:host":
        "bun build ./src/electron-main.ts ./src/electron-preload.ts --outdir ./dist --target node --external electron",
      build: "bun run build:renderer && bun run build:host",
      "smoke:build":
        "bun run build && bun -e \"for (const path of ['./dist/electron-main.js', './dist/electron-preload.js', './dist/renderer/index.html']) { if (!(await Bun.file(path).exists())) throw new Error('Missing ' + path) }\"",
      start: "bun run build && electron ./dist/electron-main.js",
    });
  });
});
