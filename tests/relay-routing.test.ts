import { describe, expect, test } from "bun:test";

import {
  buildAccessClientConfig,
  resolveAccessClientRoute,
} from "@aria/access-client";
import { selectRelayRoute } from "@aria/relay";

describe("relay routing and client transport", () => {
  test("prefers direct access when the server is reachable", () => {
    const route = selectRelayRoute({
      serverId: "home",
      directBaseUrl: "https://aria.home.example/",
      relayBaseUrl: "https://relay.example.test/home",
      directReachable: true,
    });

    expect(route).toMatchObject({
      serverId: "home",
      baseUrl: "https://aria.home.example/",
      transportMode: "direct",
      usesRelay: false,
      reason: "direct-first",
    });
    expect(
      resolveAccessClientRoute({
        serverId: "home",
        baseUrl: "https://relay.example.test/home",
        directBaseUrl: "https://aria.home.example/",
        relayBaseUrl: "https://relay.example.test/home",
        directReachable: true,
      }),
    ).toMatchObject({
      serverId: "home",
      baseUrl: "https://aria.home.example",
      httpUrl: "https://aria.home.example",
      wsUrl: "wss://aria.home.example",
      transportMode: "direct",
      usesRelay: false,
    });
  });

  test("falls back to relay-assisted routing before a full relay tunnel", () => {
    const route = resolveAccessClientRoute({
      serverId: "home",
      baseUrl: "https://relay.example.test/home",
      directBaseUrl: "https://aria.home.example/",
      relayBaseUrl: "https://relay.example.test/home",
      directReachable: false,
    });

    expect(route).toMatchObject({
      transportMode: "relay_assisted",
      usesRelay: true,
      httpUrl: "https://aria.home.example",
      wsUrl: "wss://aria.home.example",
    });
    expect(
      buildAccessClientConfig({
        serverId: "home",
        baseUrl: "https://relay.example.test/home",
        directBaseUrl: "https://aria.home.example/",
        relayBaseUrl: "https://relay.example.test/home",
        directReachable: false,
        token: "secret",
      }),
    ).toEqual({
      serverId: "home",
      httpUrl: "https://aria.home.example",
      wsUrl: "wss://aria.home.example",
      token: "secret",
    });
  });

  test("uses a relay tunnel when only relay transport is available", () => {
    const route = resolveAccessClientRoute({
      serverId: "relay-only",
      baseUrl: "https://relay.example.test/relay-only",
      relayBaseUrl: "https://relay.example.test/relay-only",
      preferredTransportMode: "relay_tunnel",
    });

    expect(route).toMatchObject({
      transportMode: "relay_tunnel",
      usesRelay: true,
      httpUrl: "https://relay.example.test/relay-only",
      wsUrl: "wss://relay.example.test/relay-only",
    });
  });
});
