import type { ClawHubSkill, ClawHubSkillDetail, ClawHubPage, SearchOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://api.clawhub.ai";
const DEFAULT_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 15_000;

export interface ClawHubClientOptions {
  baseUrl?: string;
  /** GitHub OAuth token (optional — needed for uploads, not for search/download) */
  token?: string;
}

/** HTTP client for the ClawHub skill registry (clawhub.ai) */
export class ClawHubClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(options: ClawHubClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = options.token;
  }

  /** Vector search over skills */
  async search(query: string, options: SearchOptions = {}): Promise<ClawHubPage<ClawHubSkill>> {
    const params = new URLSearchParams({ q: query, limit: String(options.limit ?? DEFAULT_LIMIT) });
    if (options.cursor) params.set("cursor", options.cursor);
    return this.get<ClawHubPage<ClawHubSkill>>(`/skills/search?${params}`);
  }

  /** Get full metadata for a single skill */
  async getSkill(slug: string): Promise<ClawHubSkillDetail> {
    return this.get<ClawHubSkillDetail>(`/skills/${encodeURIComponent(slug)}`);
  }

  /** List popular / highlighted skills */
  async listPopular(limit: number = DEFAULT_LIMIT): Promise<ClawHubPage<ClawHubSkill>> {
    return this.get<ClawHubPage<ClawHubSkill>>(`/skills/popular?limit=${limit}`);
  }

  /** Download a skill zip as a Buffer */
  async download(slug: string, version?: string): Promise<ArrayBuffer> {
    const versionPath = version ? `/${encodeURIComponent(version)}` : "";
    const url = `${this.baseUrl}/skills/${encodeURIComponent(slug)}/download${versionPath}`;
    const res = await fetch(url, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new ClawHubError(`Download failed: ${res.status} ${res.statusText}`, res.status);
    }
    return res.arrayBuffer();
  }

  // --- internal ---

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ClawHubError(
        `ClawHub API error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }
}

/** Typed error for ClawHub API failures */
export class ClawHubError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ClawHubError";
  }
}
