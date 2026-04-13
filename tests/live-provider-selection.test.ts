import { describe, expect, test } from "bun:test";

import {
  getLiveTestLabel,
  listAvailableLiveProviders,
  resolveLiveProviderSelection,
} from "./helpers/live-model.js";

describe("live provider selection", () => {
  test("prefers the first configured provider when no override is set", () => {
    const selection = resolveLiveProviderSelection({
      OPENAI_API_KEY: "openai-key",
      GOOGLE_AI_API_KEY: "google-key",
    });

    expect(selection).toMatchObject({
      providerId: "openai",
      apiKeyEnvVar: "OPENAI_API_KEY",
      modelId: "gpt-4o-mini",
    });
  });

  test("respects the explicit provider override", () => {
    const selection = resolveLiveProviderSelection({
      ANTHROPIC_API_KEY: "anthropic-key",
      OPENAI_API_KEY: "openai-key",
      ARIA_LIVE_PROVIDER: "anthropic",
      ARIA_LIVE_MODEL: "claude-sonnet-4-5-20250514",
    });

    expect(selection).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5-20250514",
    });
    expect(getLiveTestLabel(selection)).toBe("anthropic:claude-sonnet-4-5-20250514");
  });

  test("lists every available live provider and ignores blank env values", () => {
    expect(
      listAvailableLiveProviders({
        ANTHROPIC_API_KEY: " ",
        OPENAI_API_KEY: "openai-key",
        GOOGLE_AI_API_KEY: "google-key",
        MINIMAX_API_KEY: "minimax-key",
      }).map((provider) => provider.providerId),
    ).toEqual(["openai", "google", "minimax"]);
  });
});
