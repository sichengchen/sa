/** Model performance tiers */
export type ModelTier = "performance" | "normal" | "eco";

/** Task types that can be routed to different tiers */
export type TaskType =
  | "chat"
  | "tool_use"
  | "reasoning"
  | "classification"
  | "summarization"
  | "transcription";

/** Default mapping from task type to model tier */
export const DEFAULT_TASK_TIER: Record<TaskType, ModelTier> = {
  chat: "performance",
  tool_use: "performance",
  reasoning: "performance",
  classification: "eco",
  summarization: "eco",
  transcription: "eco",
};
