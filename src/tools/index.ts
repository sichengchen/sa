import type { ToolImpl } from "../agent/types.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { bashTool } from "./bash.js";

export { readTool } from "./read.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
export { bashTool } from "./bash.js";

export function getBuiltinTools(): ToolImpl[] {
  return [readTool, writeTool, editTool, bashTool];
}
