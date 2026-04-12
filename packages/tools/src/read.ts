import { readFile } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";

export const readTool: ToolImpl = {
  name: "read",
  description:
    "Read the contents of a file. Returns the file content as text. Optionally specify line offset and limit for partial reads.",
  summary: "Read file contents. Prefer this over bash+cat.",
  dangerLevel: "safe",
  parameters: Type.Object({
    file_path: Type.String({ description: "Absolute path to the file to read" }),
    offset: Type.Optional(
      Type.Number({ description: "Line number to start reading from (1-based)" })
    ),
    limit: Type.Optional(
      Type.Number({ description: "Maximum number of lines to read" })
    ),
  }),
  async execute(args) {
    const filePath = args.file_path as string;
    const offset = (args.offset as number | undefined) ?? 1;
    const limit = args.limit as number | undefined;

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const startIdx = Math.max(0, offset - 1);
      const sliced = limit ? lines.slice(startIdx, startIdx + limit) : lines.slice(startIdx);
      return { content: sliced.join("\n") };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error reading file: ${msg}`, isError: true };
    }
  },
};
