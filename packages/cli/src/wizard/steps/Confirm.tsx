import React from "react";
import { Box, Text, useInput } from "ink";
import type { ModelPickerResult } from "../../shared/ModelPicker.js";

export interface WizardData {
  name: string;
  personality: string;
  userName: string;
  timezone: string;
  communicationStyle: string;
  aboutMe: string;
  /** Provider unique ID (references ProviderConfig.id) */
  providerId: string;
  /** Provider type for pi-ai */
  providerType: string;
  /** Kept for display compatibility */
  provider: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
  botToken: string;
  baseUrl?: string;
  pairingCode?: string;
  discordToken?: string;
  discordGuildId?: string;
  slackToken?: string;
  slackSigningSecret?: string;
  teamsBotId?: string;
  teamsBotPassword?: string;
  gchatServiceAccountKey?: string;
  githubToken?: string;
  githubWebhookSecret?: string;
  linearApiKey?: string;
  linearWebhookSecret?: string;
  selectedSkills?: string[];
  /** Max output tokens from PI-mono model metadata */
  maxTokens?: number;
  /** Optional eco model for lightweight tasks */
  ecoModel?: ModelPickerResult;
  /** Optional embedding model for memory vector search */
  embeddingModel?: ModelPickerResult;
}

interface ConfirmProps {
  data: WizardData;
  onConfirm: () => void;
  onBack: () => void;
}

export function Confirm({ data, onConfirm, onBack }: ConfirmProps) {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      onConfirm();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Confirm Setup
      </Text>
      <Text />
      <Text bold>Identity:</Text>
      <Text> Name: {data.name}</Text>
      <Text> Personality: {data.personality}</Text>
      <Text />
      <Text bold>Your Profile:</Text>
      <Text> Name: {data.userName}</Text>
      <Text> Timezone: {data.timezone || "(not set)"}</Text>
      <Text> Style: {data.communicationStyle || "(not set)"}</Text>
      {data.aboutMe && <Text> About: {data.aboutMe}</Text>}
      <Text />
      <Text bold>Models:</Text>
      <Text>
        {" "}
        Primary: {data.provider}/{data.model} <Text dimColor>[performance]</Text>
      </Text>
      <Text> API Key: {data.apiKey ? "••••••••" : `(set ${data.apiKeyEnvVar} manually)`}</Text>
      {data.baseUrl && <Text> Base URL: {data.baseUrl}</Text>}
      {data.ecoModel ? (
        <Text>
          {" "}
          Eco: {data.ecoModel.providerId}/{data.ecoModel.model} <Text dimColor>[eco]</Text>
        </Text>
      ) : (
        <Text dimColor> Eco: (not configured — primary used for all tiers)</Text>
      )}
      {data.embeddingModel ? (
        <Text>
          {" "}
          Embedding: {data.embeddingModel.providerId}/{data.embeddingModel.model}
        </Text>
      ) : (
        <Text dimColor> Embedding: (not configured — keyword search only)</Text>
      )}
      <Text />
      <Text bold>Telegram:</Text>
      <Text> {data.botToken ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text bold>Discord:</Text>
      <Text> {data.discordToken ? "Configured" : "Skipped"}</Text>
      {data.discordGuildId && <Text> Guild: {data.discordGuildId}</Text>}
      <Text />
      <Text bold>Slack:</Text>
      <Text> {data.slackToken ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text bold>Teams:</Text>
      <Text> {data.teamsBotId ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text bold>Google Chat:</Text>
      <Text> {data.gchatServiceAccountKey ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text bold>GitHub:</Text>
      <Text> {data.githubToken ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text bold>Linear:</Text>
      <Text> {data.linearApiKey ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text bold>Skills:</Text>
      <Text>
        {" "}
        {data.selectedSkills && data.selectedSkills.length > 0
          ? `${data.selectedSkills.length} selected: ${data.selectedSkills.join(", ")}`
          : "None selected"}
      </Text>
      <Text />
      <Text dimColor>Enter to save | Esc to go back</Text>
    </Box>
  );
}
