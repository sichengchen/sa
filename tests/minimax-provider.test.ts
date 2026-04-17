import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchModelList,
  getPresetModelList,
  lookupModelMeta,
  MINIMAX_API_KEY_ENV_VAR,
  MINIMAX_ANTHROPIC_BASE_URL,
  MINIMAX_ANTHROPIC_PRESET_MODELS,
  MINIMAX_ANTHROPIC_PROVIDER_ID,
  MINIMAX_BASE_URL,
  MINIMAX_INTL_PROVIDER_ID,
  MINIMAX_PROVIDER_ID,
} from "../packages/cli/src/shared/fetch-models.js";
import { PROVIDER_OPTIONS } from "../packages/cli/src/shared/ModelPicker.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("MiniMax CLI provider support", () => {
  test("exposes only the Anthropic-compatible MiniMax presets in setup options", () => {
    const minimax = PROVIDER_OPTIONS.find((provider) => provider.id === MINIMAX_PROVIDER_ID);
    const minimaxIntl = PROVIDER_OPTIONS.find(
      (provider) => provider.id === MINIMAX_INTL_PROVIDER_ID,
    );
    const minimaxAnthropic = PROVIDER_OPTIONS.find(
      (provider) => provider.id === MINIMAX_ANTHROPIC_PROVIDER_ID,
    );
    expect(minimaxAnthropic).toBeDefined();
    expect(minimaxAnthropic).toMatchObject({
      id: MINIMAX_ANTHROPIC_PROVIDER_ID,
      type: "anthropic",
      apiKeyEnvVar: MINIMAX_API_KEY_ENV_VAR,
      baseUrl: MINIMAX_ANTHROPIC_BASE_URL,
    });
    expect(minimax).toBeUndefined();
    expect(minimaxIntl).toBeUndefined();
  });

  test("fetches MiniMax models from the official OpenAI-compatible endpoint", async () => {
    let seenUrl = "";
    let seenAuth = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = String(
        init?.headers instanceof Headers
          ? init.headers.get("authorization")
          : ((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""),
      );
      return new Response(
        JSON.stringify({
          data: [{ id: "MiniMax-M2.1" }, { id: "MiniMax-M2.5" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const models = await fetchModelList("openai-compat", "sk-test", "", MINIMAX_PROVIDER_ID);

    expect(seenUrl).toBe(`${MINIMAX_BASE_URL}/models`);
    expect(seenAuth).toContain("Bearer sk-test");
    expect(models).toEqual(["MiniMax-M2.1", "MiniMax-M2.5"]);
  });

  test("uses official preset models for Anthropic-compatible MiniMax providers", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("unexpected network call");
    }) as typeof fetch;

    const presetModels = getPresetModelList("anthropic", MINIMAX_ANTHROPIC_PROVIDER_ID);
    const fetchedModels = await fetchModelList(
      "anthropic",
      "",
      MINIMAX_ANTHROPIC_BASE_URL,
      MINIMAX_ANTHROPIC_PROVIDER_ID,
    );

    expect(presetModels).toEqual([...MINIMAX_ANTHROPIC_PRESET_MODELS]);
    expect(fetchedModels).toEqual([...MINIMAX_ANTHROPIC_PRESET_MODELS]);
    expect(fetchCalled).toBe(false);
  });

  test("returns MiniMax context metadata for supported models", () => {
    expect(lookupModelMeta("openai-compat", "MiniMax-M2.5", MINIMAX_PROVIDER_ID)).toEqual({
      maxTokens: 196_608,
    });
    expect(lookupModelMeta("anthropic", "MiniMax-M2.7", MINIMAX_ANTHROPIC_PROVIDER_ID)).toEqual({
      maxTokens: 196_608,
    });
    expect(lookupModelMeta("openai-compat", "gpt-4o-mini", MINIMAX_PROVIDER_ID)).toEqual(null);
  });
});
