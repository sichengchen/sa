import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  RelayAccessGrantRecord,
  RelayDeviceRecord,
  RelayQueuedEventRecord,
  RelayServerRecord,
  RelaySessionAttachmentRecord,
} from "./types.js";

interface RelayPersistedState {
  servers: RelayServerRecord[];
  devices: RelayDeviceRecord[];
  accessGrants: RelayAccessGrantRecord[];
  attachments: RelaySessionAttachmentRecord[];
  events: RelayQueuedEventRecord[];
}

function emptyState(): RelayPersistedState {
  return {
    servers: [],
    devices: [],
    accessGrants: [],
    attachments: [],
    events: [],
  };
}

export class RelayStore {
  constructor(private readonly statePath: string) {}

  async load(): Promise<RelayPersistedState> {
    if (!existsSync(this.statePath)) {
      return emptyState();
    }

    const raw = await readFile(this.statePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RelayPersistedState>;
    return {
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      accessGrants: Array.isArray(parsed.accessGrants) ? parsed.accessGrants : [],
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  }

  async save(state: RelayPersistedState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2) + "\n");
  }
}
