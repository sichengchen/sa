import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Welcome } from "./steps/Welcome.js";
import { Identity } from "./steps/Identity.js";
import { ModelSetup, type ModelSetupData } from "./steps/ModelSetup.js";
import { TelegramSetup } from "./steps/TelegramSetup.js";
import { DiscordSetup, type DiscordSetupData } from "./steps/DiscordSetup.js";
import { SlackSetup, type SlackSetupData } from "./steps/SlackSetup.js";
import { TeamsSetup, type TeamsSetupData } from "./steps/TeamsSetup.js";
import { GChatSetup, type GChatSetupData } from "./steps/GChatSetup.js";
import { GitHubSetup, type GitHubSetupData } from "./steps/GitHubSetup.js";
import { LinearSetup, type LinearSetupData } from "./steps/LinearSetup.js";
import { SkillSetup, type SkillSetupData } from "./steps/SkillSetup.js";
import { UserProfile, type UserProfileData } from "./steps/UserProfile.js";
import { Confirm, type WizardData } from "./steps/Confirm.js";
import { loadSecrets, saveSecrets } from "@aria/server/config/secrets";
import { BUNDLED_SKILLS_DIR, EMBEDDED_SKILLS } from "@aria/memory/skills/assets";
import type { ModelConfig, ProviderConfig } from "@aria/gateway/router/types";
import type { ModelTier } from "@aria/gateway/router/task-types";

type Step =
  | "welcome"
  | "identity"
  | "profile"
  | "model"
  | "telegram"
  | "discord"
  | "slack"
  | "teams"
  | "gchat"
  | "github"
  | "linear"
  | "skills"
  | "confirm"
  | "done";

interface WizardProps {
  homeDir: string;
  onComplete: () => void;
  existingConfig?: WizardData;
}

export function Wizard({ homeDir, onComplete, existingConfig }: WizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [data, setData] = useState<WizardData>(
    existingConfig
      ? { ...existingConfig }
      : {
          name: "Esperta Aria",
          personality: "Helpful, concise, and proactive personal assistant",
          userName: "",
          timezone: "",
          communicationStyle: "",
          aboutMe: "",
          providerId: "anthropic",
          providerType: "anthropic",
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250514",
          apiKeyEnvVar: "ANTHROPIC_API_KEY",
          apiKey: "",
          botToken: "",
          baseUrl: undefined,
          discordToken: "",
          discordGuildId: "",
          slackToken: "",
          slackSigningSecret: "",
          teamsBotId: "",
          teamsBotPassword: "",
          gchatServiceAccountKey: "",
          githubToken: "",
          githubWebhookSecret: "",
          linearApiKey: "",
          linearWebhookSecret: "",
          selectedSkills: [],
        },
  );

  const handleConfirm = useCallback(async () => {
    try {
      await mkdir(homeDir, { recursive: true });
      await mkdir(join(homeDir, "memory", "project"), { recursive: true });
      await mkdir(join(homeDir, "memory", "journal"), { recursive: true });

      // Write IDENTITY.md
      const identityMd = `# ${data.name}\n\n## Personality\n${data.personality}\n\n## System Prompt\nYou are ${data.name}, a personal AI agent assistant. You help with tasks, answer questions, and use tools when needed. Keep responses concise and actionable.\n`;
      await writeFile(join(homeDir, "IDENTITY.md"), identityMd);

      // Write USER.md with profile data collected from the wizard
      const userProfilePath = join(homeDir, "USER.md");

      // On re-setup, preserve any hand-edited Recurring Context section
      let recurringContext = `<!-- Projects, goals, or ongoing context ${data.name} should always be aware of. -->`;
      if (existsSync(userProfilePath)) {
        const existing = await readFile(userProfilePath, "utf-8");
        const rcMatch = existing.match(/## Recurring Context\s*\n([\s\S]*?)$/);
        if (rcMatch && rcMatch[1].trim()) {
          recurringContext = rcMatch[1].trimEnd();
        }
      }

      const aboutLine = data.aboutMe ? `\n${data.aboutMe}\n` : "\n";
      const userProfileContent = `# User Profile

## About Me
Name: ${data.userName}
Timezone: ${data.timezone || "not set"}
${aboutLine}
## Preferences
Communication style: ${data.communicationStyle || "not set"}

## Recurring Context
${recurringContext}
`;
      await writeFile(userProfilePath, userProfileContent);

      // Build providers and models arrays (deduplicating providers)
      const providerMap = new Map<string, ProviderConfig>();
      const models: ModelConfig[] = [];
      const modelTiers: Partial<Record<ModelTier, string>> = {};

      // Primary model
      providerMap.set(data.providerId, {
        id: data.providerId,
        type: data.providerType as ProviderConfig["type"],
        apiKeyEnvVar: data.apiKeyEnvVar,
        ...(data.baseUrl ? { baseUrl: data.baseUrl } : {}),
      });
      models.push({
        name: "default",
        provider: data.providerId,
        model: data.model,
        temperature: 0.7,
        maxTokens: data.maxTokens ?? 8192,
      });

      // Eco model (optional)
      if (data.ecoModel) {
        const eco = data.ecoModel;
        if (!providerMap.has(eco.providerId)) {
          providerMap.set(eco.providerId, {
            id: eco.providerId,
            type: eco.providerType as ProviderConfig["type"],
            apiKeyEnvVar: eco.apiKeyEnvVar,
            ...(eco.baseUrl ? { baseUrl: eco.baseUrl } : {}),
          });
        }
        models.push({
          name: "eco",
          provider: eco.providerId,
          model: eco.model,
          temperature: 0.7,
          maxTokens: eco.maxTokens ?? 4096,
        });
        modelTiers.eco = "eco";
      }

      // Embedding model (optional)
      if (data.embeddingModel) {
        const emb = data.embeddingModel;
        if (!providerMap.has(emb.providerId)) {
          providerMap.set(emb.providerId, {
            id: emb.providerId,
            type: emb.providerType as ProviderConfig["type"],
            apiKeyEnvVar: emb.apiKeyEnvVar,
            ...(emb.baseUrl ? { baseUrl: emb.baseUrl } : {}),
          });
        }
        models.push({
          name: "embedding",
          provider: emb.providerId,
          model: emb.model,
          type: "embedding",
        });
      }

      // Write merged config.json (v3 schema)
      const config = {
        version: 3,
        runtime: {
          activeModel: "default",
          telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
          memory: { enabled: true, directory: "memory" },
          ...(Object.keys(modelTiers).length > 0 ? { modelTiers } : {}),
        },
        providers: Array.from(providerMap.values()),
        models,
        defaultModel: "default",
      };
      await writeFile(join(homeDir, "config.json"), JSON.stringify(config, null, 2) + "\n");

      // Write empty MEMORY.md
      await writeFile(join(homeDir, "memory", "MEMORY.md"), "");

      // Persist secrets (API keys + bot tokens + pairing code) in encrypted file
      const apiKeys: Record<string, string> = {};
      if (data.apiKey) apiKeys[data.apiKeyEnvVar] = data.apiKey;
      if (data.ecoModel?.apiKey) apiKeys[data.ecoModel.apiKeyEnvVar] = data.ecoModel.apiKey;
      if (data.embeddingModel?.apiKey)
        apiKeys[data.embeddingModel.apiKeyEnvVar] = data.embeddingModel.apiKey;
      if (data.botToken) apiKeys.TELEGRAM_BOT_TOKEN = data.botToken;
      if (data.discordToken) apiKeys.DISCORD_TOKEN = data.discordToken;
      if (data.discordGuildId) apiKeys.DISCORD_GUILD_ID = data.discordGuildId;
      if (data.slackToken) apiKeys.SLACK_BOT_TOKEN = data.slackToken;
      if (data.slackSigningSecret) apiKeys.SLACK_SIGNING_SECRET = data.slackSigningSecret;
      if (data.teamsBotId) apiKeys.TEAMS_BOT_ID = data.teamsBotId;
      if (data.teamsBotPassword) apiKeys.TEAMS_BOT_PASSWORD = data.teamsBotPassword;
      if (data.gchatServiceAccountKey)
        apiKeys.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY = data.gchatServiceAccountKey;
      if (data.githubToken) apiKeys.GITHUB_TOKEN = data.githubToken;
      if (data.githubWebhookSecret) apiKeys.GITHUB_WEBHOOK_SECRET = data.githubWebhookSecret;
      if (data.linearApiKey) apiKeys.LINEAR_API_KEY = data.linearApiKey;
      if (data.linearWebhookSecret) apiKeys.LINEAR_WEBHOOK_SECRET = data.linearWebhookSecret;
      const existingSecrets = await loadSecrets(homeDir);
      await saveSecrets(homeDir, {
        ...(existingSecrets ?? { apiKeys: {} }),
        apiKeys,
        pairingCode: data.pairingCode,
      });

      // Copy selected bundled skills into ~/.aria/skills/
      if (data.selectedSkills && data.selectedSkills.length > 0) {
        const skillsDir = join(homeDir, "skills");
        await mkdir(skillsDir, { recursive: true });
        const useFsSkills = existsSync(BUNDLED_SKILLS_DIR);
        for (const name of data.selectedSkills) {
          const dest = join(skillsDir, name);
          if (useFsSkills) {
            const src = join(BUNDLED_SKILLS_DIR, name);
            await cp(src, dest, { recursive: true });
          } else if (EMBEDDED_SKILLS[name]) {
            // Single-binary build: write embedded .md files directly
            await mkdir(dest, { recursive: true });
            const skillFiles = EMBEDDED_SKILLS[name]!;
            for (const [relPath, content] of Object.entries(skillFiles)) {
              const fileDest = join(dest, relPath);
              const fileDir = join(
                dest,
                relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "",
              );
              if (fileDir !== dest) await mkdir(fileDir, { recursive: true });
              await writeFile(fileDest, content);
            }
          }
        }
      }

      setStep("done");
      // Brief delay then transition to main app
      setTimeout(onComplete, 1500);
    } catch (err) {
      console.error("Setup failed:", err);
    }
  }, [data, homeDir, onComplete]);

  switch (step) {
    case "welcome":
      return <Welcome onNext={() => setStep("identity")} />;
    case "identity":
      return (
        <Identity
          currentValues={
            existingConfig ? { name: data.name, personality: data.personality } : undefined
          }
          onNext={({ name, personality }) => {
            setData((d) => ({ ...d, name, personality }));
            setStep("profile");
          }}
          onBack={() => setStep("welcome")}
        />
      );
    case "profile":
      return (
        <UserProfile
          currentValues={
            existingConfig
              ? {
                  userName: data.userName,
                  timezone: data.timezone,
                  communicationStyle: data.communicationStyle,
                  aboutMe: data.aboutMe,
                }
              : undefined
          }
          onNext={(profileData: UserProfileData) => {
            setData((d) => ({ ...d, ...profileData }));
            setStep("model");
          }}
          onBack={() => setStep("identity")}
        />
      );
    case "model":
      return (
        <ModelSetup
          currentValues={
            existingConfig
              ? {
                  providerId: data.providerId,
                  providerType: data.providerType,
                  provider: data.provider,
                  model: data.model,
                  apiKeyEnvVar: data.apiKeyEnvVar,
                  apiKey: data.apiKey,
                  baseUrl: data.baseUrl,
                  ecoModel: data.ecoModel,
                  embeddingModel: data.embeddingModel,
                }
              : undefined
          }
          onNext={(modelData: ModelSetupData) => {
            setData((d) => ({ ...d, ...modelData }));
            setStep("telegram");
          }}
          onBack={() => setStep("profile")}
        />
      );
    case "telegram":
      return (
        <TelegramSetup
          currentValues={
            existingConfig ? { botToken: data.botToken, pairingCode: data.pairingCode } : undefined
          }
          onNext={({ botToken, pairingCode }) => {
            setData((d) => ({ ...d, botToken, pairingCode }));
            setStep("discord");
          }}
          onBack={() => setStep("model")}
        />
      );
    case "discord":
      return (
        <DiscordSetup
          currentValues={
            existingConfig
              ? {
                  discordToken: data.discordToken ?? "",
                  discordGuildId: data.discordGuildId ?? "",
                }
              : undefined
          }
          onNext={(discordData: DiscordSetupData) => {
            setData((d) => ({ ...d, ...discordData }));
            setStep("slack");
          }}
          onBack={() => setStep("telegram")}
        />
      );
    case "slack":
      return (
        <SlackSetup
          currentValues={
            existingConfig
              ? {
                  slackToken: data.slackToken ?? "",
                  slackSigningSecret: data.slackSigningSecret ?? "",
                }
              : undefined
          }
          onNext={(slackData: SlackSetupData) => {
            setData((d) => ({ ...d, ...slackData }));
            setStep("teams");
          }}
          onBack={() => setStep("discord")}
        />
      );
    case "teams":
      return (
        <TeamsSetup
          currentValues={
            existingConfig
              ? {
                  teamsBotId: data.teamsBotId ?? "",
                  teamsBotPassword: data.teamsBotPassword ?? "",
                }
              : undefined
          }
          onNext={(teamsData: TeamsSetupData) => {
            setData((d) => ({ ...d, ...teamsData }));
            setStep("gchat");
          }}
          onBack={() => setStep("slack")}
        />
      );
    case "gchat":
      return (
        <GChatSetup
          currentValues={
            existingConfig
              ? { gchatServiceAccountKey: data.gchatServiceAccountKey ?? "" }
              : undefined
          }
          onNext={(gchatData: GChatSetupData) => {
            setData((d) => ({ ...d, ...gchatData }));
            setStep("github");
          }}
          onBack={() => setStep("teams")}
        />
      );
    case "github":
      return (
        <GitHubSetup
          currentValues={
            existingConfig
              ? {
                  githubToken: data.githubToken ?? "",
                  githubWebhookSecret: data.githubWebhookSecret ?? "",
                }
              : undefined
          }
          onNext={(githubData: GitHubSetupData) => {
            setData((d) => ({ ...d, ...githubData }));
            setStep("linear");
          }}
          onBack={() => setStep("gchat")}
        />
      );
    case "linear":
      return (
        <LinearSetup
          currentValues={
            existingConfig
              ? {
                  linearApiKey: data.linearApiKey ?? "",
                  linearWebhookSecret: data.linearWebhookSecret ?? "",
                }
              : undefined
          }
          onNext={(linearData: LinearSetupData) => {
            setData((d) => ({ ...d, ...linearData }));
            setStep("skills");
          }}
          onBack={() => setStep("github")}
        />
      );
    case "skills":
      return (
        <SkillSetup
          currentValues={
            existingConfig && data.selectedSkills
              ? { selectedSkills: data.selectedSkills }
              : undefined
          }
          onNext={(skillData: SkillSetupData) => {
            setData((d) => ({ ...d, ...skillData }));
            setStep("confirm");
          }}
          onBack={() => setStep("linear")}
        />
      );
    case "confirm":
      return <Confirm data={data} onConfirm={handleConfirm} onBack={() => setStep("skills")} />;
    case "done":
      return (
        <Box padding={1}>
          <Text bold color="green">
            Setup complete! Run `aria` to start.
          </Text>
        </Box>
      );
  }
}
