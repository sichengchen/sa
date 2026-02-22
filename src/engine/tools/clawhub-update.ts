import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import { ClawHubClient, SkillInstaller } from "../clawhub/index.js";
import type { SkillRegistry } from "../skills/index.js";

/** Create a tool that checks for and applies skill updates from ClawHub */
export function createClawHubUpdateTool(saHome: string, skills: SkillRegistry): ToolImpl {
  return {
    name: "clawhub_update",
    description:
      "Check for updates to installed ClawHub skills and update them. Pass a slug to update one skill, or omit to check all installed skills.",
    dangerLevel: "moderate",
    parameters: Type.Object({
      slug: Type.Optional(
        Type.String({
          description: "Specific skill slug to update (omit to check all installed skills)",
        }),
      ),
    }),
    async execute(args) {
      const slug = args.slug as string | undefined;
      const client = new ClawHubClient();
      const installer = new SkillInstaller(saHome);

      try {
        const installed = await installer.listInstalled();
        if (installed.length === 0) {
          return { content: "No ClawHub skills are installed. Nothing to update." };
        }

        const toCheck = slug
          ? installed.filter((e) => e.slug === slug)
          : installed;

        if (toCheck.length === 0) {
          return { content: `Skill "${slug}" is not installed from ClawHub.`, isError: true };
        }

        const updates: string[] = [];
        const errors: string[] = [];

        for (const entry of toCheck) {
          try {
            const detail = await client.getSkill(entry.slug);
            if (detail.version !== entry.version) {
              await installer.install(entry.slug, detail.version);
              updates.push(
                `Updated "${entry.name}" (${entry.slug}): ${entry.version} → ${detail.version}`,
              );
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to check "${entry.slug}": ${msg}`);
          }
        }

        // Reload skill registry if anything was updated
        if (updates.length > 0) {
          await skills.loadAll(saHome);
        }

        const parts: string[] = [];
        if (updates.length > 0) {
          parts.push(`Updated ${updates.length} skill(s):\n${updates.join("\n")}`);
        } else {
          parts.push("All installed skills are up to date.");
        }
        if (errors.length > 0) {
          parts.push(`\nErrors:\n${errors.join("\n")}`);
        }

        return { content: parts.join("\n") };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: `ClawHub update failed: ${message}`, isError: true };
      }
    },
  };
}
