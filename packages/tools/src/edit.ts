import { readFile, writeFile } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";

export const editTool: ToolImpl = {
  name: "edit",
  description:
    "Perform an exact string replacement in a file. The old_string must appear exactly once in the file.",
  summary: "Make precise string replacements in a file. Prefer this over bash+sed.",
  dangerLevel: "moderate",
  parameters: Type.Object({
    file_path: Type.String({ description: "Absolute path to the file to edit" }),
    old_string: Type.String({ description: "The exact string to find and replace" }),
    new_string: Type.String({ description: "The replacement string" }),
  }),
  async execute(args) {
    const filePath = args.file_path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;

    try {
      const content = await readFile(filePath, "utf-8");
      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        return {
          content: `Error: old_string not found in ${filePath}`,
          isError: true,
        };
      }
      if (occurrences > 1) {
        return {
          content: `Error: old_string found ${occurrences} times in ${filePath} — must be unique`,
          isError: true,
        };
      }

      const updated = content.replace(oldString, newString);
      await writeFile(filePath, updated);
      return { content: `File edited: ${filePath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error editing file: ${msg}`, isError: true };
    }
  },
};
