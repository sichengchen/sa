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
import { SkillSetup, type SkillSetupData } from "./steps/SkillSetup.js";
import { UserProfile, type UserProfileData } from "./steps/UserProfile.js";
import { Confirm, type WizardData } from "./steps/Confirm.js";
import { saveSecrets } from "@sa/engine/config/secrets.js";
import { BUNDLED_SKILLS_DIR } from "@sa/engine/skills/registry.js";

type Step = "welcome" | "identity" | "profile" | "model" | "telegram" | "discord" | "skills" | "confirm" | "done";

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
          name: "Sasa",
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
          selectedSkills: [],
        }
  );

  const handleConfirm = useCallback(async () => {
    try {
      await mkdir(homeDir, { recursive: true });
      await mkdir(join(homeDir, "memory", "topics"), { recursive: true });

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

      // Write merged config.json (v3 schema)
      const config = {
        version: 3,
        runtime: {
          activeModel: "default",
          telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
          memory: { enabled: true, directory: "memory" },
        },
        providers: [
          {
            id: data.providerId,
            type: data.providerType,
            apiKeyEnvVar: data.apiKeyEnvVar,
            ...(data.baseUrl ? { baseUrl: data.baseUrl } : {}),
          },
        ],
        models: [
          {
            name: "default",
            provider: data.providerId,
            model: data.model,
            temperature: 0.7,
            maxTokens: data.maxTokens ?? 8192,
          },
        ],
        defaultModel: "default",
      };
      await writeFile(
        join(homeDir, "config.json"),
        JSON.stringify(config, null, 2) + "\n"
      );

      // Write empty MEMORY.md
      await writeFile(join(homeDir, "memory", "MEMORY.md"), "");

      // Persist secrets (API key + bot tokens + pairing code) in encrypted file
      const apiKeys: Record<string, string> = {};
      if (data.apiKey) apiKeys[data.apiKeyEnvVar] = data.apiKey;
      if (data.botToken) apiKeys.TELEGRAM_BOT_TOKEN = data.botToken;
      if (data.discordToken) apiKeys.DISCORD_TOKEN = data.discordToken;
      if (data.discordGuildId) apiKeys.DISCORD_GUILD_ID = data.discordGuildId;
      await saveSecrets(homeDir, {
        apiKeys,
        pairingCode: data.pairingCode,
      });

      // Copy selected bundled skills into ~/.sa/skills/
      if (data.selectedSkills && data.selectedSkills.length > 0) {
        const skillsDir = join(homeDir, "skills");
        await mkdir(skillsDir, { recursive: true });
        for (const name of data.selectedSkills) {
          const src = join(BUNDLED_SKILLS_DIR, name);
          const dest = join(skillsDir, name);
          await cp(src, dest, { recursive: true });
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
            existingConfig
              ? { name: data.name, personality: data.personality }
              : undefined
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
            existingConfig
              ? { botToken: data.botToken, pairingCode: data.pairingCode }
              : undefined
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
              ? { discordToken: data.discordToken ?? "", discordGuildId: data.discordGuildId ?? "" }
              : undefined
          }
          onNext={(discordData: DiscordSetupData) => {
            setData((d) => ({ ...d, ...discordData }));
            setStep("skills");
          }}
          onBack={() => setStep("telegram")}
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
          onBack={() => setStep("discord")}
        />
      );
    case "confirm":
      return (
        <Confirm
          data={data}
          onConfirm={handleConfirm}
          onBack={() => setStep("skills")}
        />
      );
    case "done":
      return (
        <Box padding={1}>
          <Text bold color="green">
            Setup complete! Run `sa` to start.
          </Text>
        </Box>
      );
  }
}
