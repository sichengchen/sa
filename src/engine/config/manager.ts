import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { Identity, RuntimeConfig, SAConfig, SecretsFile } from "./types.js";
import { DEFAULT_IDENTITY_MD, DEFAULT_CONFIG, DEFAULT_MODELS } from "./defaults.js";
import { loadSecrets as _loadSecrets, saveSecrets as _saveSecrets } from "./secrets.js";

export class ConfigManager {
  readonly homeDir: string;
  private identity: Identity | null = null;
  private runtime: RuntimeConfig | null = null;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? process.env.SA_HOME ?? join(homedir(), ".sa");
  }

  async load(): Promise<SAConfig> {
    await mkdir(this.homeDir, { recursive: true });

    this.identity = await this.loadIdentity();
    this.runtime = await this.loadRuntime();

    // Ensure models.json exists for the router
    const modelsPath = join(this.homeDir, "models.json");
    if (!existsSync(modelsPath)) {
      await writeFile(modelsPath, JSON.stringify(DEFAULT_MODELS, null, 2) + "\n");
    }

    return { identity: this.identity, runtime: this.runtime };
  }

  private async loadIdentity(): Promise<Identity> {
    const identityPath = join(this.homeDir, "IDENTITY.md");
    let md: string;
    if (existsSync(identityPath)) {
      md = await readFile(identityPath, "utf-8");
    } else {
      md = DEFAULT_IDENTITY_MD;
      await writeFile(identityPath, md);
    }
    return parseIdentityMd(md);
  }

  private async loadRuntime(): Promise<RuntimeConfig> {
    const configPath = join(this.homeDir, "config.json");
    if (existsSync(configPath)) {
      const raw = await readFile(configPath, "utf-8");
      return JSON.parse(raw);
    }
    await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    return { ...DEFAULT_CONFIG };
  }

  getIdentity(): Identity {
    if (!this.identity) throw new Error("Config not loaded — call load() first");
    return this.identity;
  }

  getConfig(): RuntimeConfig {
    if (!this.runtime) throw new Error("Config not loaded — call load() first");
    return this.runtime;
  }

  async setConfig<K extends keyof RuntimeConfig>(
    key: K,
    value: RuntimeConfig[K]
  ): Promise<void> {
    if (!this.runtime) throw new Error("Config not loaded — call load() first");
    this.runtime[key] = value;
    const configPath = join(this.homeDir, "config.json");
    await writeFile(configPath, JSON.stringify(this.runtime, null, 2) + "\n");
  }

  getModelsPath(): string {
    return join(this.homeDir, "models.json");
  }

  getUserProfilePath(): string {
    return join(this.homeDir, "USER.md");
  }

  async loadUserProfile(): Promise<string | null> {
    const path = this.getUserProfilePath();
    if (!existsSync(path)) return null;
    const content = await readFile(path, "utf-8");
    return content.trim() || null;
  }

  async loadSecrets(): Promise<SecretsFile | null> {
    return _loadSecrets(this.homeDir);
  }

  async saveSecrets(secrets: SecretsFile): Promise<void> {
    return _saveSecrets(this.homeDir, secrets);
  }
}

function parseIdentityMd(md: string): Identity {
  const nameMatch = md.match(/^#\s+(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : "SA";

  const personalityMatch = md.match(
    /##\s+Personality\s*\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  const personality = personalityMatch
    ? personalityMatch[1].trim()
    : "";

  const systemPromptMatch = md.match(
    /##\s+System Prompt\s*\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  const systemPrompt = systemPromptMatch
    ? systemPromptMatch[1].trim()
    : "";

  return { name, personality, systemPrompt };
}
