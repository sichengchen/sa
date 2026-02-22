/** ClawHub API response types */

/** A skill result from ClawHub search or browse */
export interface ClawHubSkill {
  /** Unique slug (e.g. "openai/code-review") */
  slug: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Author / org name */
  author: string;
  /** Latest version string (semver) */
  version: string;
  /** Download count */
  downloads: number;
  /** Relevance score (only present in search results) */
  score?: number;
  /** Tags / categories */
  tags: string[];
  /** ISO date string */
  updatedAt: string;
}

/** Paginated response wrapper */
export interface ClawHubPage<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

/** Search options */
export interface SearchOptions {
  limit?: number;
  cursor?: string;
}

/** Skill detail (full metadata for a single skill) */
export interface ClawHubSkillDetail extends ClawHubSkill {
  /** Available versions */
  versions: string[];
  /** License identifier */
  license: string | null;
  /** Repository URL */
  repository: string | null;
  /** README / long description */
  readme: string | null;
}

/** Local registry entry tracking installed skills */
export interface InstalledSkillEntry {
  slug: string;
  name: string;
  version: string;
  installedAt: string;
}
