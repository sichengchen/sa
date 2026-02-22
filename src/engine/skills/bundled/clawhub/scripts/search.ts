#!/usr/bin/env bun
/**
 * ClawHub search script — search the skill registry.
 * Usage: bun run search.ts <query>
 */
import { ClawHubClient } from "../lib/client.js";

const query = process.argv[2];
if (!query) {
  console.error("Usage: bun run search.ts <query>");
  process.exit(1);
}

const client = new ClawHubClient();
try {
  const results = await client.search(query, { limit: 10 });
  if (results.items.length === 0) {
    console.log(`No skills found for "${query}" on ClawHub.`);
    process.exit(0);
  }

  const lines = results.items.map(
    (s, i) =>
      `${i + 1}. ${s.name} (${s.slug})\n   ${s.description}\n   v${s.version} · ${s.downloads} downloads · ${s.tags.join(", ")}`,
  );

  console.log(`Found ${results.items.length} skill(s) on ClawHub:\n`);
  console.log(lines.join("\n\n"));
  if (results.hasMore) {
    console.log("\n(More results available)");
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ClawHub search failed: ${message}`);
  process.exit(1);
}
