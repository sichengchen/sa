import { describe, expect, test } from "vitest";
import { PROVIDER_TYPES } from "../packages/cli/src/config/ProviderManager";

describe("ProviderManager presets", () => {
  test("use unique ids for selectable provider types", () => {
    const ids = PROVIDER_TYPES.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("do not expose openai-compatible providers in the add menu", () => {
    expect(PROVIDER_TYPES.some((provider) => provider.type === "openai-compat")).toBe(false);
  });
});
