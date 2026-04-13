import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PRODUCT_NAME, getRuntimeHome } from "../brand.js";
import { DEFAULT_CONFIG, DEFAULT_IDENTITY_MD } from "./defaults.js";
import { loadSecrets as _loadSecrets, saveSecrets as _saveSecrets } from "./secrets.js";
import type { AriaConfig, AriaConfigFile, Identity, RuntimeConfig, SecretsFile } from "./types.js";

export class ConfigManager {
  readonly homeDir: string;
  private identity: Identity | null = null;
  private configFile: AriaConfigFile | null = null;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? getRuntimeHome();
  }

  async load(): Promise<AriaConfig> {
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

  private async loadConfigFile(): Promise<AriaConfigFile> {
    const configPath = join(this.homeDir, "config.json");

    if (existsSync(configPath)) {
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);

      if (parsed.version === 3) {
        return parsed as AriaConfigFile;
      }

      throw new Error(
        "Unsupported config.json format. Esperta Aria only supports config.json version 3.",
      );
    }

    await this.writeConfigFile(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  private async writeConfigFile(config: AriaConfigFile): Promise<void> {
    const configPath = join(this.homeDir, "config.json");
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  getIdentity(): Identity {
    if (!this.identity) throw new Error("Config not loaded - call load() first");
    return this.identity;
  }

  getConfig(): RuntimeConfig {
    if (!this.configFile) throw new Error("Config not loaded - call load() first");
    return this.configFile.runtime;
  }

  getConfigFile(): AriaConfigFile {
    if (!this.configFile) throw new Error("Config not loaded - call load() first");
    return this.configFile;
  }

  async setConfig<K extends keyof RuntimeConfig>(key: K, value: RuntimeConfig[K]): Promise<void> {
    if (!this.configFile) throw new Error("Config not loaded - call load() first");
    this.configFile.runtime[key] = value;
    await this.writeConfigFile(this.configFile);
  }

  async saveConfig(config?: AriaConfigFile): Promise<void> {
    if (config) this.configFile = config;
    if (!this.configFile) throw new Error("Config not loaded - call load() first");
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

  const personalityMatch = md.match(/##\s+Personality\s*\n([\s\S]*?)(?=\n##|\n$|$)/);
  const personality = personalityMatch ? personalityMatch[1].trim() : "";

  const systemPromptMatch = md.match(/##\s+System Prompt\s*\n([\s\S]*?)(?=\n##|\n$|$)/);
  const systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : "";

  return { name, personality, systemPrompt };
}
