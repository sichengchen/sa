import { describe, expect, test } from "bun:test";
import { resolveAriaDesktopRendererTarget } from "../apps/aria-desktop/src/renderer.js";

describe("aria-desktop host scaffold", () => {
  test("resolves renderer targets with desktop defaults", () => {
    expect(resolveAriaDesktopRendererTarget(undefined)).toEqual({
      serverId: "desktop",
      baseUrl: "http://127.0.0.1:7420/",
    });

    expect(
      resolveAriaDesktopRendererTarget({
        serverId: "relay",
        baseUrl: "https://relay.example.test/",
      }),
    ).toEqual({
      serverId: "relay",
      baseUrl: "https://relay.example.test/",
    });
  });
});
