import { Type } from "@mariozechner/pi-ai";
import { NodeHtmlMarkdown } from "node-html-markdown";
import type { ToolImpl } from "../../runtime/src/agent/types.js";
import { validateUrl, validateHeaders, MAX_REDIRECTS, type UrlPolicyConfig } from "../../policy/src/url-policy.js";
import { frameAsData, sanitizeContent } from "../../runtime/src/agent/content-frame.js";

const DEFAULT_MAX_LENGTH = 50_000;
const FETCH_TIMEOUT = 30_000;
const USER_AGENT = "EspertaAria/1.0 (local-first agent platform)";

const nhm = new NodeHtmlMarkdown();

export function createWebFetchTool(urlPolicy?: UrlPolicyConfig): ToolImpl {
  return {
    name: "web_fetch",
    description: "Fetch a URL and return its content. HTML is converted to markdown for readability.",
    summary:
      "Fetch a URL and return content as markdown (HTML) or plain text (JSON, text, XML). Supports custom headers and max length truncation.",
    dangerLevel: "safe",
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

      // Validate URL against policy
      const check = validateUrl(url, urlPolicy);
      if (!check.ok) {
        return {
          content: `Blocked by URL policy: ${check.reason}`,
          isError: true,
        };
      }

      // Strip forbidden headers
      const safeHeaders = customHeaders ? validateHeaders(customHeaders) : undefined;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      try {
        // Manual redirect following with per-hop validation
        let currentUrl = url;
        let res: Response | undefined;

        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          res = await fetch(currentUrl, {
            headers: {
              "User-Agent": USER_AGENT,
              ...safeHeaders,
            },
            signal: controller.signal,
            redirect: "manual",
          });

          // Check for redirect
          if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) {
              return { content: `Error: Redirect ${res.status} with no Location header`, isError: true };
            }

            // Resolve relative redirect URLs
            const redirectUrl = new URL(location, currentUrl).toString();

            // Validate redirect target
            const redirectCheck = validateUrl(redirectUrl, urlPolicy);
            if (!redirectCheck.ok) {
              return {
                content: `Blocked by URL policy: redirect to ${redirectUrl} — ${redirectCheck.reason}`,
                isError: true,
              };
            }

            if (hop === MAX_REDIRECTS) {
              return { content: `Error: Too many redirects (max ${MAX_REDIRECTS})`, isError: true };
            }

            currentUrl = redirectUrl;
            continue;
          }

          break;
        }

        if (!res) {
          return { content: "Error: No response received", isError: true };
        }

        if (!res.ok) {
          return { content: `Error: HTTP ${res.status} ${res.statusText}`, isError: true };
        }

        // Defense-in-depth: validate the final response URL
        if (res.url && res.url !== currentUrl) {
          const finalCheck = validateUrl(res.url, urlPolicy);
          if (!finalCheck.ok) {
            return {
              content: `Blocked by URL policy: final URL ${res.url} — ${finalCheck.reason}`,
              isError: true,
            };
          }
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

        const framed = frameAsData(sanitizeContent(output || "(empty response)"), "web-fetch");
        return { content: framed, isError: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error: ${msg}`, isError: true };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** @deprecated Use createWebFetchTool() instead */
export const webFetchTool: ToolImpl = createWebFetchTool();
