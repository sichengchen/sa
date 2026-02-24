import { describe, it, expect } from "bun:test";
import { validateUrl, validateHeaders, MAX_REDIRECTS } from "./url-policy.js";

describe("validateUrl", () => {
  // --- Allowed URLs ---
  it("allows normal HTTPS URLs", () => {
    expect(validateUrl("https://example.com")).toEqual({ ok: true });
    expect(validateUrl("https://api.github.com/repos")).toEqual({ ok: true });
  });

  it("allows normal HTTP URLs", () => {
    expect(validateUrl("http://example.com/page")).toEqual({ ok: true });
  });

  // --- Blocked schemes ---
  it("blocks file:// scheme", () => {
    const r = validateUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked scheme");
  });

  it("blocks ftp:// scheme", () => {
    const r = validateUrl("ftp://ftp.example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked scheme");
  });

  it("blocks data: scheme", () => {
    const r = validateUrl("data:text/html,<h1>hi</h1>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked scheme");
  });

  it("blocks gopher:// scheme", () => {
    const r = validateUrl("gopher://example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked scheme");
  });

  // --- Loopback / localhost ---
  it("blocks localhost", () => {
    const r = validateUrl("http://localhost:3000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked host");
  });

  it("blocks 127.0.0.1", () => {
    const r = validateUrl("http://127.0.0.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked host");
  });

  it("blocks 127.x.x.x variations", () => {
    expect(validateUrl("http://127.0.0.2").ok).toBe(false);
    expect(validateUrl("http://127.255.255.255").ok).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(validateUrl("http://0.0.0.0").ok).toBe(false);
  });

  it("blocks IPv6 loopback ::1", () => {
    expect(validateUrl("http://[::1]").ok).toBe(false);
  });

  it("blocks IPv6-mapped IPv4 loopback", () => {
    expect(validateUrl("http://[::ffff:127.0.0.1]").ok).toBe(false);
  });

  // --- Private ranges ---
  it("blocks 10.x.x.x (class A)", () => {
    expect(validateUrl("http://10.0.0.1").ok).toBe(false);
    expect(validateUrl("http://10.255.255.255").ok).toBe(false);
  });

  it("blocks 172.16-31.x.x (class B)", () => {
    expect(validateUrl("http://172.16.0.1").ok).toBe(false);
    expect(validateUrl("http://172.31.255.255").ok).toBe(false);
    // 172.15 and 172.32 should be allowed
    expect(validateUrl("http://172.15.0.1").ok).toBe(true);
    expect(validateUrl("http://172.32.0.1").ok).toBe(true);
  });

  it("blocks 192.168.x.x (class C)", () => {
    expect(validateUrl("http://192.168.0.1").ok).toBe(false);
    expect(validateUrl("http://192.168.1.100").ok).toBe(false);
  });

  // --- Cloud metadata ---
  it("blocks AWS/Azure/GCP metadata (169.254.169.254)", () => {
    expect(validateUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
  });

  it("blocks GCP metadata (metadata.google.internal)", () => {
    expect(validateUrl("http://metadata.google.internal/computeMetadata/v1/").ok).toBe(false);
  });

  it("blocks Alibaba metadata (100.100.100.200)", () => {
    expect(validateUrl("http://100.100.100.200/latest/meta-data/").ok).toBe(false);
  });

  // --- SA engine ports ---
  it("blocks SA engine port 7420", () => {
    const r = validateUrl("http://example.com:7420/api");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked port");
  });

  it("blocks SA engine port 7421", () => {
    const r = validateUrl("http://example.com:7421/ws");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Blocked port");
  });

  // --- mDNS ---
  it("blocks .local domains", () => {
    expect(validateUrl("http://myhost.local").ok).toBe(false);
    expect(validateUrl("http://printer.local:631").ok).toBe(false);
  });

  // --- Invalid URLs ---
  it("rejects invalid URLs", () => {
    const r = validateUrl("not-a-url");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Invalid URL");
  });

  // --- Config: additionalBlockedHosts ---
  it("blocks additional hosts from config", () => {
    const config = { additionalBlockedHosts: ["evil.com", "malware.org"] };
    expect(validateUrl("https://evil.com/payload", config).ok).toBe(false);
    expect(validateUrl("https://sub.evil.com/payload", config).ok).toBe(false);
    expect(validateUrl("https://malware.org", config).ok).toBe(false);
    expect(validateUrl("https://safe.com", config).ok).toBe(true);
  });

  // --- Config: allowedExceptions ---
  it("allows exceptions that override blocks", () => {
    const config = { allowedExceptions: ["http://localhost:3000"] };
    // This specific URL is allowed despite localhost being blocked
    expect(validateUrl("http://localhost:3000", config).ok).toBe(true);
    expect(validateUrl("http://localhost:3000/api/health", config).ok).toBe(true);
    // But other localhost URLs are still blocked
    expect(validateUrl("http://localhost:4000", config).ok).toBe(false);
  });
});

describe("validateHeaders", () => {
  it("strips forbidden headers", () => {
    const result = validateHeaders({
      "Authorization": "Bearer secret",
      "Cookie": "session=abc",
      "Accept": "text/html",
      "X-Custom": "value",
    });
    expect(result).toEqual({
      "Accept": "text/html",
      "X-Custom": "value",
    });
  });

  it("strips Host and X-Forwarded-For", () => {
    const result = validateHeaders({
      "Host": "evil.com",
      "X-Forwarded-For": "1.2.3.4",
      "Content-Type": "application/json",
    });
    expect(result).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("is case-insensitive for forbidden headers", () => {
    const result = validateHeaders({
      "authorization": "token",
      "COOKIE": "val",
      "X-Safe": "ok",
    });
    expect(result).toEqual({
      "X-Safe": "ok",
    });
  });

  it("passes through all headers when none are forbidden", () => {
    const headers = { "Accept": "text/html", "X-Custom": "value" };
    expect(validateHeaders(headers)).toEqual(headers);
  });
});

describe("MAX_REDIRECTS", () => {
  it("is a positive number", () => {
    expect(MAX_REDIRECTS).toBe(5);
  });
});
