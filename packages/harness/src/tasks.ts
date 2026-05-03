export interface HarnessTaskLink {
  taskId: string;
  parentSessionId: string;
  childSessionId: string;
  role?: string;
  cwd?: string;
}

export function createTaskLink(
  input: Omit<HarnessTaskLink, "taskId" | "childSessionId"> & {
    taskId?: string;
    childSessionId?: string;
  },
): HarnessTaskLink {
  const taskId = input.taskId ?? crypto.randomUUID();
  return {
    taskId,
    parentSessionId: input.parentSessionId,
    childSessionId: input.childSessionId ?? `${input.parentSessionId}:task:${taskId}`,
    role: input.role,
    cwd: input.cwd,
  };
}
