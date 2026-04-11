import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";

export const writeTool: ToolImpl = {
  name: "write",
  description:
    "Write content to a file. Creates the file and parent directories if they don't exist. Overwrites existing files.",
  summary: "Create or overwrite a file. Prefer this over bash+echo.",
  dangerLevel: "moderate",
  parameters: Type.Object({
    file_path: Type.String({ description: "Absolute path to write the file" }),
    content: Type.String({ description: "Content to write to the file" }),
  }),
  async execute(args) {
    const filePath = args.file_path as string;
    const content = args.content as string;

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
      return { content: `File written: ${filePath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error writing file: ${msg}`, isError: true };
    }
  },
};
