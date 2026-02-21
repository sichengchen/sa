import { Type } from "@mariozechner/pi-ai";
import { NodeHtmlMarkdown } from "node-html-markdown";
import type { ToolImpl } from "../agent/types.js";

const DEFAULT_MAX_LENGTH = 50_000;
const FETCH_TIMEOUT = 30_000;
const USER_AGENT = "SA-Agent/1.0 (personal AI assistant)";

const nhm = new NodeHtmlMarkdown();

export const webFetchTool: ToolImpl = {
  name: "web_fetch",
  description: "Fetch a URL and return its content. HTML is converted to markdown for readability.",
  summary:
    "Fetch a URL and return content as markdown (HTML) or plain text (JSON, text, XML). Supports custom headers and max length truncation.",
  parameters: Type.Object({
    url: Type.String({ description: "The URL to fetch" }),
    maxLength: Type.Optional(
      Type.Number({ description: "Max characters to return (default 50000)" }),
    ),
    headers: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: "Additional HTTP headers to send",
      }),
    ),
  }),
  async execute(args) {
    const url = args.url as string;
    const maxLength = (args.maxLength as number | undefined) ?? DEFAULT_MAX_LENGTH;
    const customHeaders = args.headers as Record<string, string> | undefined;

    try {
      new URL(url);
    } catch {
      return { content: `Error: Invalid URL: ${url}`, isError: true };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...customHeaders,
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { content: `Error: HTTP ${res.status} ${res.statusText}`, isError: true };
      }

      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();

      let output: string;
      if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
        output = nhm.translate(body);
      } else {
        output = body;
      }

      if (output.length > maxLength) {
        output = output.slice(0, maxLength) + `\n\n[Truncated at ${maxLength} characters]`;
      }

      return { content: output || "(empty response)", isError: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error: ${msg}`, isError: true };
    }
  },
};
