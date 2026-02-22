import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import { SkillInstaller } from "../clawhub/index.js";
import type { SkillRegistry } from "../skills/index.js";

/** Create a tool that installs a skill from ClawHub */
export function createClawHubInstallTool(saHome: string, skills: SkillRegistry): ToolImpl {
  return {
    name: "clawhub_install",
    description:
      "Install a skill from the ClawHub registry (clawhub.ai) by its slug. The skill will be downloaded and available immediately.",
    dangerLevel: "moderate",
    parameters: Type.Object({
      slug: Type.String({
        description: "The ClawHub skill slug (e.g. 'steipete/apple-notes')",
      }),
      version: Type.Optional(
        Type.String({ description: "Specific version to install (defaults to latest)" }),
      ),
    }),
    async execute(args) {
      const slug = args.slug as string;
      const version = args.version as string | undefined;
      const installer = new SkillInstaller(saHome);
      try {
        const result = await installer.install(slug, version);
        // Reload skill registry so the new skill is immediately discoverable
        await skills.loadAll(saHome);
        return {
          content: `Installed skill "${result.name}" from ClawHub (${slug}).\nLocation: ${result.path}\nThe skill is now available and can be activated.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: `ClawHub install failed: ${message}`, isError: true };
      }
    },
  };
}
