import { getRuntimeHome } from "@aria/shared/brand.js";
import { loadSecrets, saveSecrets } from "@aria/engine/config/secrets.js";
import type { SecretsFile, WeChatAccountSecret } from "@aria/engine/config/types.js";

export const DEFAULT_WECHAT_API_BASE_URL = "https://ilinkai.weixin.qq.com/";

function normalizeBaseUrl(value: string | undefined): string {
  if (!value?.trim()) return DEFAULT_WECHAT_API_BASE_URL;
  return value.trim().endsWith("/") ? value.trim() : `${value.trim()}/`;
}

function normalizeUserIds(userIds: string[] | undefined): string[] | undefined {
  const normalized = (userIds ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

export function normalizeWeChatAccount(account: WeChatAccountSecret): WeChatAccountSecret {
  return {
    accountId: account.accountId.trim(),
    botToken: account.botToken.trim(),
    apiBaseUrl: normalizeBaseUrl(account.apiBaseUrl),
    allowedUserIds: normalizeUserIds(account.allowedUserIds),
  };
}

function parseEnvAccount(): WeChatAccountSecret | null {
  const accountId = process.env.WECHAT_ACCOUNT_ID?.trim();
  const botToken = process.env.WECHAT_BOT_TOKEN?.trim();
  if (!accountId || !botToken) return null;

  const allowedUserIds = process.env.WECHAT_ALLOWED_USER_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return normalizeWeChatAccount({
    accountId,
    botToken,
    apiBaseUrl: process.env.WECHAT_API_BASE_URL,
    allowedUserIds,
  });
}

function sanitizeAccounts(accounts: WeChatAccountSecret[] | undefined): WeChatAccountSecret[] {
  return (accounts ?? [])
    .filter((account) => account.accountId?.trim() && account.botToken?.trim())
    .map(normalizeWeChatAccount);
}

export async function loadWeChatAccounts(homeDir = getRuntimeHome()): Promise<WeChatAccountSecret[]> {
  const secrets = await loadSecrets(homeDir);
  const merged = new Map<string, WeChatAccountSecret>();

  for (const account of sanitizeAccounts(secrets?.wechatAccounts)) {
    merged.set(account.accountId, account);
  }

  const envAccount = parseEnvAccount();
  if (envAccount) {
    merged.set(envAccount.accountId, envAccount);
  }

  return Array.from(merged.values());
}

export async function upsertWeChatAccount(
  account: WeChatAccountSecret,
  homeDir = getRuntimeHome(),
): Promise<WeChatAccountSecret[]> {
  const normalized = normalizeWeChatAccount(account);
  const secrets = (await loadSecrets(homeDir)) ?? ({ apiKeys: {} } satisfies SecretsFile);
  const existing = sanitizeAccounts(secrets.wechatAccounts).filter(
    (entry) => entry.accountId !== normalized.accountId,
  );
  const nextAccounts = [...existing, normalized].sort((a, b) => a.accountId.localeCompare(b.accountId));

  await saveSecrets(homeDir, {
    ...secrets,
    wechatAccounts: nextAccounts,
  });

  return nextAccounts;
}
