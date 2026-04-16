import { describe, expect, test } from "bun:test";

import { buildAccessClientConfig, resolveAccessClientRoute } from "@aria/access-client";

describe("access routing and client transport", () => {
  test("prefers the primary gateway URL when it is reachable", () => {
    expect(
      resolveAccessClientRoute({
        serverId: "home",
        baseUrl: "https://gateway.example.test/home",
        primaryBaseUrl: "https://aria.home.example/",
        secondaryBaseUrl: "https://gateway.example.test/home",
        primaryReachable: true,
      }),
    ).toMatchObject({
      serverId: "home",
      baseUrl: "https://aria.home.example",
      httpUrl: "https://aria.home.example",
      wsUrl: "wss://aria.home.example",
      accessMode: "primary",
      usesSecondary: false,
    });
  });

  test("falls back to the secondary published URL when the primary path is unavailable", () => {
    const route = resolveAccessClientRoute({
      serverId: "home",
      baseUrl: "https://gateway.example.test/home",
      primaryBaseUrl: "https://aria.home.example/",
      secondaryBaseUrl: "https://gateway.example.test/home",
      primaryReachable: false,
    });

    expect(route).toMatchObject({
      accessMode: "secondary",
      usesSecondary: true,
      httpUrl: "https://gateway.example.test/home",
      wsUrl: "wss://gateway.example.test/home",
    });
    expect(
      buildAccessClientConfig({
        serverId: "home",
        baseUrl: "https://gateway.example.test/home",
        primaryBaseUrl: "https://aria.home.example/",
        secondaryBaseUrl: "https://gateway.example.test/home",
        primaryReachable: false,
        token: "secret",
      }),
    ).toEqual({
      serverId: "home",
      httpUrl: "https://gateway.example.test/home",
      wsUrl: "wss://gateway.example.test/home",
      token: "secret",
    });
  });
});
