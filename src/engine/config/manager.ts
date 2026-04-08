import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Identity, RuntimeConfig, SAConfig, SAConfigFile, SecretsFile } from "./types.js";
import { DEFAULT_IDENTITY_MD, DEFAULT_CONFIG } from "./defaults.js";
import { loadSecrets as _loadSecrets, saveSecrets as _saveSecrets } from "./secrets.js";
import { PRODUCT_NAME, getRuntimeHome } from "@sa/shared/brand.js";

export class ConfigManager {
  readonly homeDir: string;
  private identity: Identity | null = null;
  private configFile: SAConfigFile | null = null;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? getRuntimeHome();
  }

  async load(): Promise<SAConfig> {
    await mkdir(this.homeDir, { recursive: true });

    this.identity = await this.loadIdentity();
    this.configFile = await this.loadConfigFile();

    return {
      identity: this.identity,
      runtime: this.configFile.runtime,
      providers: this.configFile.providers,
      models: this.configFile.models,
      defaultModel: this.configFile.defaultModel,
    };
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

  private async loadConfigFile(): Promise<SAConfigFile> {
    const configPath = join(this.homeDir, "config.json");
    const modelsPath = join(this.homeDir, "models.json");

    if (existsSync(configPath)) {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);

      // v3 merged config — use directly
      if (parsed.version === 3) {
        return parsed as SAConfigFile;
      }

      // Legacy config.json (no version field = pre-v3 RuntimeConfig)
      // Check if models.json also exists for migration
      if (existsSync(modelsPath)) {
        const modelsRaw = await readFile(modelsPath, "utf-8");
        const models = JSON.parse(modelsRaw);
        const merged = this.migrateToV3(parsed as RuntimeConfig, models);
        await this.writeConfigFile(merged);
        // Remove legacy models.json after migration
        await rm(modelsPath, { force: true });
        return merged;
      }

      // Legacy config.json without models.json — create defaults for models
      const merged = this.migrateToV3(parsed as RuntimeConfig, null);
      await this.writeConfigFile(merged);
      return merged;
    }

    // No config.json at all — if models.json exists alone, migrate it
    if (existsSync(modelsPath)) {
      const modelsRaw = await readFile(modelsPath, "utf-8");
      const models = JSON.parse(modelsRaw);
      const merged = this.migrateToV3(DEFAULT_CONFIG.runtime, models);
      await this.writeConfigFile(merged);
      await rm(modelsPath, { force: true });
      return merged;
    }

    // Fresh install — write defaults
    await this.writeConfigFile(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  private migrateToV3(
    runtime: RuntimeConfig,
    models: { version?: number; default?: string; providers?: any[]; models?: any[] } | null,
  ): SAConfigFile {
    return {
      version: 3,
      runtime,
      providers: models?.providers ?? DEFAULT_CONFIG.providers,
      models: models?.models ?? DEFAULT_CONFIG.models,
      defaultModel: models?.default ?? DEFAULT_CONFIG.defaultModel,
    };
  }

  private async writeConfigFile(config: SAConfigFile): Promise<void> {
    const configPath = join(this.homeDir, "config.json");
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  getIdentity(): Identity {
    if (!this.identity) throw new Error("Config not loaded — call load() first");
    return this.identity;
  }

  getConfig(): RuntimeConfig {
    if (!this.configFile) throw new Error("Config not loaded — call load() first");
    return this.configFile.runtime;
  }

  getConfigFile(): SAConfigFile {
    if (!this.configFile) throw new Error("Config not loaded — call load() first");
    return this.configFile;
  }

  async setConfig<K extends keyof RuntimeConfig>(
    key: K,
    value: RuntimeConfig[K]
  ): Promise<void> {
    if (!this.configFile) throw new Error("Config not loaded — call load() first");
    this.configFile.runtime[key] = value;
    await this.writeConfigFile(this.configFile);
  }

  /** Save the full config file to disk */
  async saveConfig(config?: SAConfigFile): Promise<void> {
    if (config) this.configFile = config;
    if (!this.configFile) throw new Error("Config not loaded — call load() first");
    await this.writeConfigFile(this.configFile);
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
  const name = nameMatch ? nameMatch[1].trim() : PRODUCT_NAME;

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
