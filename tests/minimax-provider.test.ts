import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchModelList,
  lookupModelMeta,
  MINIMAX_API_KEY_ENV_VAR,
  MINIMAX_BASE_URL,
  MINIMAX_PROVIDER_ID,
} from "../packages/cli/src/shared/fetch-models.js";
import { PROVIDER_OPTIONS } from "../packages/cli/src/shared/ModelPicker.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("MiniMax CLI provider support", () => {
  test("exposes a first-class MiniMax preset in provider options", () => {
    const minimax = PROVIDER_OPTIONS.find((provider) => provider.id === MINIMAX_PROVIDER_ID);
    expect(minimax).toBeDefined();
    expect(minimax).toMatchObject({
      id: MINIMAX_PROVIDER_ID,
      type: "openai-compat",
      apiKeyEnvVar: MINIMAX_API_KEY_ENV_VAR,
      baseUrl: MINIMAX_BASE_URL,
      compatMode: "preset",
    });
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

  test("returns MiniMax context metadata for supported models", () => {
    expect(lookupModelMeta("openai-compat", "MiniMax-M2.5", MINIMAX_PROVIDER_ID)).toEqual({
      maxTokens: 204_800,
    });
    expect(lookupModelMeta("openai-compat", "gpt-4o-mini", MINIMAX_PROVIDER_ID)).toEqual(null);
  });
});
