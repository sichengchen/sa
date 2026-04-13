import { ensureEngine } from "@aria/server/daemon";
import { createTuiClient } from "@aria/console/client.js";
import { CLI_NAME } from "@aria/server/brand";

type InspectLayer = "curated" | "profile" | "project" | "operational" | "journal";

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} memory [list|read|search] ...\n`);
  console.log("Commands:");
  console.log("  list                    Show memory layers and recent journal entries");
  console.log(
    "  list <layer>            Show keys for one layer (profile|project|operational|journal)",
  );
  console.log("  read <layer> <key>      Read a memory entry (use 'curated' without a key)");
  console.log("  search <query>          Search memory across layers");
}

function isLayer(value: string): value is Exclude<InspectLayer, "curated"> {
  return (
    value === "profile" || value === "project" || value === "operational" || value === "journal"
  );
}

export async function memoryCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  await ensureEngine();
  const client = createTuiClient();

  if (action === "list") {
    const target = args[1];
    const overview = await client.memory.overview.query();

    if (!target) {
      console.log(`Curated memory: ${overview.curatedLength} chars`);
      console.log(
        `Profile keys (${overview.layers.profile.length}): ${overview.layers.profile.join(", ") || "none"}`,
      );
      console.log(
        `Project keys (${overview.layers.project.length}): ${overview.layers.project.join(", ") || "none"}`,
      );
      console.log(
        `Operational keys (${overview.layers.operational.length}): ${overview.layers.operational.join(", ") || "none"}`,
      );
      console.log(`Recent journals: ${overview.journals.join(", ") || "none"}`);
      return;
    }

    if (target === "curated") {
      console.log(overview.curatedPreview ?? "(curated memory is empty)");
      return;
    }

    if (!isLayer(target)) {
      printHelp();
      process.exit(1);
    }

    const entries = target === "journal" ? overview.journals : overview.layers[target];
    console.log(entries.join("\n") || `(no ${target} entries)`);
    return;
  }

  if (action === "read") {
    const layer = (args[1] ?? "") as InspectLayer;
    const key = args[2];
    if (!["curated", "profile", "project", "operational", "journal"].includes(layer)) {
      printHelp();
      process.exit(1);
    }

    const result = await client.memory.read.query({
      layer,
      key,
    });
    console.log(result.content ?? `(no ${layer} entry found)`);
    return;
  }

  if (action === "search") {
    const query = args.slice(1).join(" ").trim();
    if (!query) {
      printHelp();
      process.exit(1);
    }

    const results = await client.memory.search.query({ query, limit: 10 });
    if (results.length === 0) {
      console.log("No memory results found.");
      return;
    }

    for (const result of results) {
      console.log(`[${result.sourceType}] ${result.source} score=${result.score.toFixed(3)}`);
      console.log(`  ${result.content.replace(/\s+/g, " ").trim().slice(0, 240)}`);
    }
    return;
  }

  printHelp();
  process.exit(1);
}
