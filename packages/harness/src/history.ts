export interface HarnessHistoryEntry {
  id: string;
  type: "prompt" | "skill" | "shell" | "task" | "result";
  input?: string;
  output?: string;
  raw?: unknown;
  at: number;
}

export class HarnessHistory {
  private readonly entries: HarnessHistoryEntry[];

  constructor(entries: HarnessHistoryEntry[] = []) {
    this.entries = [...entries];
  }

  append(
    entry: Omit<HarnessHistoryEntry, "id" | "at"> & { id?: string; at?: number },
  ): HarnessHistoryEntry {
    const fullEntry = {
      ...entry,
      id: entry.id ?? crypto.randomUUID(),
      at: entry.at ?? Date.now(),
    };
    this.entries.push(fullEntry);
    return fullEntry;
  }

  toJSON(): HarnessHistoryEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
