import { describe, expect, test } from "bun:test";

import {
  CLI_NAME as serverCliName,
  PRODUCT_NAME as serverProductName,
  RUNTIME_NAME as serverRuntimeName,
  getRuntimeHome as getServerRuntimeHome,
} from "@aria/server/brand";
import {
  CLI_NAME,
  PRODUCT_NAME,
  RUNTIME_NAME,
  getRuntimeHome,
} from "@aria/shared/brand.js";
import { createEngineClient as createAccessClient } from "@aria/access-client/client";
import { createEngineClient } from "@aria/shared/client.js";
import { markdownToHtml as markdownToUiHtml, parseInlineMarkdown as parseUiInlineMarkdown } from "@aria/ui/markdown";
import { markdownToHtml, parseInlineMarkdown } from "@aria/shared/markdown.js";
import { ConnectorTypeSchema as protocolConnectorTypeSchema } from "@aria/protocol/types";
import { ConnectorTypeSchema } from "@aria/shared/types.js";

describe("@aria/shared-types compatibility package", () => {
  test("keeps brand helpers aligned with the server-owned brand surface", () => {
    expect(CLI_NAME).toBe(serverCliName);
    expect(PRODUCT_NAME).toBe(serverProductName);
    expect(RUNTIME_NAME).toBe(serverRuntimeName);
    expect(getRuntimeHome()).toBe(getServerRuntimeHome());
  });

  test("keeps client and markdown helpers aligned with target package owners", () => {
    expect(createEngineClient).toBe(createAccessClient);
    expect(parseInlineMarkdown).toBe(parseUiInlineMarkdown);
    expect(markdownToHtml).toBe(markdownToUiHtml);
  });

  test("keeps protocol type surfaces aligned with target package exports", () => {
    expect(ConnectorTypeSchema).toBe(protocolConnectorTypeSchema);
    expect(ConnectorTypeSchema.options).toEqual(protocolConnectorTypeSchema.options);
  });
});
