/**
 * Content framing — wraps external data in `<data-*>` tags to signal
 * the LLM that the content is untrusted and should not be interpreted
 * as instructions.
 */

/**
 * Wrap content in a data-source tag.
 * Escapes closing tags within the content to prevent breakout.
 */
export function frameAsData(content: string, source: string): string {
  const escaped = content.replace(/<\/data-/g, "&lt;/data-");
  return `<data-${source}>\n${escaped}\n</data-${source}>`;
}

// ---------------------------------------------------------------------------
// API key / secret redaction
// ---------------------------------------------------------------------------

/** Patterns that look like API keys or tokens */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,           // OpenAI / generic
  /\bsk-ant-[a-zA-Z0-9-]{20,}\b/g,      // Anthropic
  /\bghp_[a-zA-Z0-9]{36,}\b/g,          // GitHub PAT
  /\bghs_[a-zA-Z0-9]{36,}\b/g,          // GitHub App token
  /\bgho_[a-zA-Z0-9]{36,}\b/g,          // GitHub OAuth
  /\bxoxb-[a-zA-Z0-9-]+\b/g,            // Slack bot
  /\bxoxp-[a-zA-Z0-9-]+\b/g,            // Slack user
  /\bAIza[a-zA-Z0-9_-]{35,}\b/g,        // Google AI
  /\bgsk_[a-zA-Z0-9]{20,}\b/g,          // Groq
  /\bnpm_[a-zA-Z0-9]{36}\b/g,           // npm
  /\bglpat-[a-zA-Z0-9_-]{20,}\b/g,      // GitLab PAT
];

/**
 * Redact API key patterns from a string.
 * Replaces matches with `[REDACTED]`.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Path masking
// ---------------------------------------------------------------------------

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const ARIA_HOME_RESOLVED = process.env.ARIA_HOME
  ? process.env.ARIA_HOME
  : HOME
    ? `${HOME}/.aria`
    : "";

/**
 * Mask Aria internal paths: replace `~/.aria/...` and resolved runtime-home paths
 * with `[ARIA_HOME]/...`.
 */
export function maskPaths(text: string): string {
  let result = text;
  if (ARIA_HOME_RESOLVED) {
    result = result.replaceAll(ARIA_HOME_RESOLVED, HOME_PLACEHOLDER);
  }
  // Also handle the tilde form
  result = result.replace(/~\/\.aria\b/g, HOME_PLACEHOLDER);
  return result;
}

// ---------------------------------------------------------------------------
// Stack trace truncation
// ---------------------------------------------------------------------------

/**
 * Truncate stack traces to at most `maxFrames` frames.
 * Looks for blocks of lines starting with common stack frame prefixes.
 */
export function truncateStackTraces(text: string, maxFrames = 3): string {
  // Match blocks of stack frames (lines starting with "    at " or "  at ")
  return text.replace(
    /((?:^[ \t]+at .+\n?){1,})/gm,
    (block) => {
      const lines = block.split("\n").filter(Boolean);
      if (lines.length <= maxFrames) return block;
      return lines.slice(0, maxFrames).join("\n") + `\n    ... (${lines.length - maxFrames} more frames)\n`;
    },
  );
}

// ---------------------------------------------------------------------------
// Combined sanitizer
// ---------------------------------------------------------------------------

/**
 * Full sanitization pipeline for tool results:
 * 1. Redact API keys
 * 2. Mask Aria runtime paths
 * 3. Truncate stack traces
 */
export function sanitizeContent(text: string): string {
  let result = redactSecrets(text);
  result = maskPaths(result);
  result = truncateStackTraces(result);
  return result;
}
import { HOME_PLACEHOLDER } from "@aria/shared/brand.js";
