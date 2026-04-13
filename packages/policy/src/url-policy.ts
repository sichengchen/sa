/**
 * URL policy — SSRF protection for web_fetch.
 *
 * Blocks requests to localhost, private ranges, cloud metadata endpoints,
 * Aria Runtime ports, and dangerous schemes.
 */

// ---------------------------------------------------------------------------
// Blocked patterns
// ---------------------------------------------------------------------------

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^127\.\d+\.\d+\.\d+$/, // loopback v4
  /^0\.0\.0\.0$/,
  /^::1$/, // loopback v6
  /^::ffff:127\.\d+\.\d+\.\d+$/, // IPv6-mapped loopback (dotted)
  /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/, // IPv6-mapped loopback (hex)
  /^localhost$/i,
  /^.*\.local$/i, // mDNS
  /^metadata\.google\.internal$/, // GCP metadata
  /^169\.254\.169\.254$/, // AWS / Azure / GCP metadata
  /^100\.100\.100\.200$/, // Alibaba metadata
  /^10\.\d+\.\d+\.\d+$/, // private class A
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // private class B
  /^192\.168\.\d+\.\d+$/, // private class C
  /^fd[0-9a-f]{2}:/, // IPv6 ULA
  /^\[::1\]$/, // bracketed IPv6 loopback
  /^\[::ffff:127\.\d+\.\d+\.\d+\]$/, // bracketed IPv6-mapped loopback (dotted)
  /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/, // bracketed IPv6-mapped loopback (hex)
];

const BLOCKED_SCHEMES = new Set(["file", "ftp", "gopher", "ldap", "dict", "data"]);
const BLOCKED_PORTS = new Set([7420, 7421]); // Aria Runtime ports
const FORBIDDEN_HEADERS = new Set(["authorization", "cookie", "host", "x-forwarded-for"]);

export const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// Config type (matches RuntimeConfig.security.urlPolicy)
// ---------------------------------------------------------------------------

export interface UrlPolicyConfig {
  additionalBlockedHosts?: string[];
  allowedExceptions?: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ValidateResult = { ok: true } | { ok: false; reason: string };

function normalizedPort(parsed: URL): string {
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "";
}

function matchesPathBoundary(pathname: string, allowedPathname: string): boolean {
  if (allowedPathname === "/" || allowedPathname === "") {
    return true;
  }
  if (pathname === allowedPathname) {
    return true;
  }
  const prefix = allowedPathname.endsWith("/") ? allowedPathname : `${allowedPathname}/`;
  return pathname.startsWith(prefix);
}

function matchesAllowedException(target: URL, exception: string): boolean {
  try {
    const parsedException = new URL(exception);
    return (
      parsedException.protocol === target.protocol &&
      parsedException.hostname.toLowerCase() === target.hostname.toLowerCase() &&
      normalizedPort(parsedException) === normalizedPort(target) &&
      matchesPathBoundary(target.pathname, parsedException.pathname)
    );
  } catch {
    const [host, port] = exception.toLowerCase().split(":");
    if (!host) return false;
    const targetHost = target.hostname.toLowerCase();
    const targetPort = normalizedPort(target);
    return targetHost === host && (!port || port === targetPort);
  }
}

/**
 * Check whether a URL is allowed by the URL policy.
 * Returns `{ ok: true }` when safe, or `{ ok: false, reason }` when blocked.
 */
export function validateUrl(raw: string, config?: UrlPolicyConfig): ValidateResult {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: `Invalid URL: ${raw}` };
  }

  // --- allowed exceptions (checked first) ---
  if (config?.allowedExceptions?.length) {
    for (const exception of config.allowedExceptions) {
      if (matchesAllowedException(parsed, exception)) {
        return { ok: true };
      }
    }
  }

  // --- scheme ---
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme)) {
    return { ok: false, reason: `Blocked scheme: ${scheme}` };
  }

  // --- port ---
  const port = parsed.port ? Number(parsed.port) : null;
  if (port !== null && BLOCKED_PORTS.has(port)) {
    return { ok: false, reason: `Blocked port: ${port}` };
  }

  // --- host ---
  const hostname = parsed.hostname.toLowerCase();

  // Check user-supplied additional blocked hosts
  if (config?.additionalBlockedHosts?.length) {
    for (const pattern of config.additionalBlockedHosts) {
      if (hostname === pattern.toLowerCase() || hostname.endsWith(`.${pattern.toLowerCase()}`)) {
        return { ok: false, reason: `Blocked by additional host rule: ${pattern}` };
      }
    }
  }

  // Check built-in blocked host patterns
  for (const re of BLOCKED_HOST_PATTERNS) {
    if (re.test(hostname)) {
      return { ok: false, reason: `Blocked host: ${hostname}` };
    }
  }

  return { ok: true };
}

/**
 * Strip forbidden headers from a user-supplied headers object.
 * Returns a new object with only allowed headers.
 */
export function validateHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!FORBIDDEN_HEADERS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}
