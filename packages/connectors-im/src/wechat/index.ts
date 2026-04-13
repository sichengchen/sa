import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createChatSDKClient } from "../chat-sdk/client.js";
import { formatToolResult, splitMessage } from "../chat-sdk/formatter.js";
import { getRuntimeHome } from "@aria/server/brand";
import type { WeChatAccountSecret } from "@aria/server/config";
import { DEFAULT_WECHAT_API_BASE_URL, loadWeChatAccounts, upsertWeChatAccount } from "./config.js";

const WECHAT_APP_ID = "bot";
const WECHAT_CLIENT_VERSION = "1";
const WECHAT_POLL_INTERVAL_MS = 1000;
const WECHAT_RETRY_DELAY_MS = 3000;
const WECHAT_LOGIN_POLL_MS = 2000;
const WECHAT_LOGIN_TIMEOUT_MS = 5 * 60_000;
const WECHAT_USER_MESSAGE_TYPE = 1;
const WECHAT_TEXT_ITEM_TYPE = 1;
const WECHAT_VOICE_ITEM_TYPE = 3;
const WECHAT_STATE_DIR = "wechat";

type EngineClient = ReturnType<typeof createChatSDKClient>;

interface WeChatMessageItem {
  type?: number;
  text_item?: { text?: string | null } | null;
  voice_item?: { text?: string | null } | null;
}

interface WeChatInboundMessage {
  from_user_id?: string | null;
  group_id?: string | null;
  context_token?: string | null;
  message_type?: number;
  item_list?: WeChatMessageItem[] | null;
}

interface WeChatGetUpdatesResponse {
  errcode?: number;
  errmsg?: string;
  get_updates_buf?: string;
  msgs?: WeChatInboundMessage[];
}

interface WeChatSendMessageRequest {
  to_user_id: string;
  item_list: Array<{
    type: number;
    text_item: { text: string };
  }>;
  context_token?: string;
}

interface WeChatLoginQRCodeResponse {
  qrcode?: string;
  qrcode_url?: string;
}

interface WeChatLoginStatusResponse {
  errcode?: number;
  errmsg?: string;
  auth_code?: string;
  baseurl?: string;
  user_id?: string;
  wx_alias?: string;
}

type WeChatCommand =
  | { kind: "help" }
  | { kind: "new" }
  | { kind: "approve"; toolCallId: string }
  | { kind: "reject"; toolCallId: string }
  | { kind: "always"; toolCallId: string }
  | { kind: "answer"; questionId: string; answer: string }
  | { kind: "model"; modelName: string };

function randomUin(): string {
  return Buffer.from(String(Math.floor(Math.random() * 1_000_000_000)), "utf-8").toString("base64");
}

function buildHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "iLink-App-Id": WECHAT_APP_ID,
    "iLink-App-ClientVersion": WECHAT_CLIENT_VERSION,
    "X-WECHAT-UIN": randomUin(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl?.trim()) return DEFAULT_WECHAT_API_BASE_URL;
  return baseUrl.trim().endsWith("/") ? baseUrl.trim() : `${baseUrl.trim()}/`;
}

async function getJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(new URL(path, normalizeBaseUrl(baseUrl)), {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

function extractTextFromItems(itemList: WeChatMessageItem[] | null | undefined): string | null {
  const segments: string[] = [];

  for (const item of itemList ?? []) {
    if (item.type === WECHAT_TEXT_ITEM_TYPE) {
      const text = item.text_item?.text?.trim();
      if (text) segments.push(text);
      continue;
    }

    if (item.type === WECHAT_VOICE_ITEM_TYPE) {
      const text = item.voice_item?.text?.trim();
      if (text) segments.push(`[Voice] ${text}`);
    }
  }

  return segments.length > 0 ? segments.join("\n\n") : null;
}

function parseCommand(text: string): WeChatCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  if (/^\/help$/i.test(trimmed)) return { kind: "help" };
  if (/^\/new$/i.test(trimmed)) return { kind: "new" };

  const approveMatch = trimmed.match(/^\/approve\s+(\S+)$/i);
  if (approveMatch) return { kind: "approve", toolCallId: approveMatch[1]! };

  const rejectMatch = trimmed.match(/^\/reject\s+(\S+)$/i);
  if (rejectMatch) return { kind: "reject", toolCallId: rejectMatch[1]! };

  const alwaysMatch = trimmed.match(/^\/always\s+(\S+)$/i);
  if (alwaysMatch) return { kind: "always", toolCallId: alwaysMatch[1]! };

  const answerMatch = trimmed.match(/^\/answer\s+(\S+)\s+([\s\S]+)$/i);
  if (answerMatch) {
    return {
      kind: "answer",
      questionId: answerMatch[1]!,
      answer: answerMatch[2]!.trim(),
    };
  }

  const modelMatch = trimmed.match(/^\/model\s+(.+)$/i);
  if (modelMatch) return { kind: "model", modelName: modelMatch[1]!.trim() };

  return { kind: "help" };
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

function connectorHelpText(): string {
  return [
    "WeChat commands:",
    "/new",
    "/approve <toolCallId>",
    "/reject <toolCallId>",
    "/always <toolCallId>",
    "/answer <questionId> <answer>",
    "/model <name>",
    "/help",
  ].join("\n");
}

class WeChatAccountRunner {
  private client: EngineClient;
  private activeSessions = new Map<string, string>();
  private contextTokens = new Map<string, string>();
  private cursor = "";
  private readonly baseUrl: string;
  private readonly stateDir: string;
  private readonly cursorPath: string;
  private readonly contextPath: string;

  constructor(
    private readonly account: WeChatAccountSecret,
    private readonly homeDir: string,
  ) {
    this.client = createChatSDKClient();
    this.baseUrl = normalizeBaseUrl(account.apiBaseUrl);
    this.stateDir = join(this.homeDir, WECHAT_STATE_DIR);
    this.cursorPath = join(this.stateDir, `${this.account.accountId}.cursor.json`);
    this.contextPath = join(this.stateDir, `${this.account.accountId}.contexts.json`);
  }

  async init(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
    const cursorState = await readJsonFile<{ getUpdatesBuf?: string }>(this.cursorPath, {});
    this.cursor = cursorState.getUpdatesBuf?.trim() ?? "";
    const contexts = await readJsonFile<Record<string, string>>(this.contextPath, {});
    this.contextTokens = new Map(Object.entries(contexts));
  }

  async run(signal: AbortSignal): Promise<void> {
    await this.init();
    console.log(`[wechat:${this.account.accountId}] listening for direct messages`);

    while (!signal.aborted) {
      try {
        const updates = await postJson<WeChatGetUpdatesResponse>(
          this.baseUrl,
          "ilink/bot/getupdates",
          { get_updates_buf: this.cursor },
          this.account.botToken,
        );

        if (updates.errcode && updates.errcode !== 0) {
          if (updates.errcode === -14) {
            this.cursor = "";
            await this.persistCursor();
            console.warn(`[wechat:${this.account.accountId}] cursor reset after session timeout`);
          } else {
            console.warn(
              `[wechat:${this.account.accountId}] getupdates error ${updates.errcode}: ${updates.errmsg ?? "unknown error"}`,
            );
          }
          await delay(WECHAT_RETRY_DELAY_MS, undefined, { signal }).catch(() => {});
          continue;
        }

        if (updates.get_updates_buf && updates.get_updates_buf !== this.cursor) {
          this.cursor = updates.get_updates_buf;
          await this.persistCursor();
        }

        for (const message of updates.msgs ?? []) {
          if (signal.aborted) break;
          await this.handleIncomingMessage(message);
        }

        await delay(WECHAT_POLL_INTERVAL_MS, undefined, { signal }).catch(() => {});
      } catch (error) {
        if (signal.aborted) break;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[wechat:${this.account.accountId}] poll failed: ${message}`);
        await delay(WECHAT_RETRY_DELAY_MS, undefined, { signal }).catch(() => {});
      }
    }
  }

  private async persistCursor(): Promise<void> {
    await writeJsonFile(this.cursorPath, { getUpdatesBuf: this.cursor });
  }

  private async persistContexts(): Promise<void> {
    await writeJsonFile(this.contextPath, Object.fromEntries(this.contextTokens.entries()));
  }

  private async ensureSession(prefix: string): Promise<string> {
    const cached = this.activeSessions.get(prefix);
    if (cached) return cached;

    const latest = await this.client.session.getLatest.query({ prefix });
    if (latest) {
      this.activeSessions.set(prefix, latest.id);
      return latest.id;
    }

    const created = await this.client.session.create.mutate({
      connectorType: "wechat",
      prefix,
    });
    this.activeSessions.set(prefix, created.session.id);
    return created.session.id;
  }

  private async createFreshSession(prefix: string): Promise<string> {
    const created = await this.client.session.create.mutate({
      connectorType: "wechat",
      prefix,
    });
    this.activeSessions.set(prefix, created.session.id);
    return created.session.id;
  }

  private async sendText(peerId: string, text: string): Promise<void> {
    const contextToken = this.contextTokens.get(peerId);
    for (const chunk of splitMessage(text, 1800)) {
      const payload: WeChatSendMessageRequest = {
        to_user_id: peerId,
        item_list: [{ type: WECHAT_TEXT_ITEM_TYPE, text_item: { text: chunk } }],
        ...(contextToken ? { context_token: contextToken } : {}),
      };
      await postJson(this.baseUrl, "ilink/bot/sendmessage", payload, this.account.botToken);
    }
  }

  private async handleIncomingMessage(message: WeChatInboundMessage): Promise<void> {
    if (message.message_type !== WECHAT_USER_MESSAGE_TYPE) return;
    if (message.group_id) return;

    const peerId = message.from_user_id?.trim();
    if (!peerId) return;

    if (this.account.allowedUserIds?.length && !this.account.allowedUserIds.includes(peerId)) {
      return;
    }

    if (message.context_token?.trim()) {
      this.contextTokens.set(peerId, message.context_token.trim());
      await this.persistContexts();
    }

    const text = extractTextFromItems(message.item_list);
    if (!text) {
      await this.sendText(
        peerId,
        "I can only read text and transcribed voice messages in WeChat right now.",
      );
      return;
    }

    const prefix = `wechat:${this.account.accountId}:${peerId}`;
    const command = parseCommand(text);
    if (command) {
      await this.handleCommand(peerId, prefix, command);
      return;
    }

    const sessionId = await this.ensureSession(prefix);
    await this.streamReply(peerId, sessionId, text);
  }

  private async handleCommand(
    peerId: string,
    prefix: string,
    command: WeChatCommand,
  ): Promise<void> {
    try {
      switch (command.kind) {
        case "help":
          await this.sendText(peerId, connectorHelpText());
          return;
        case "new": {
          const sessionId = await this.createFreshSession(prefix);
          await this.sendText(peerId, `Started a new conversation.\nSession: ${sessionId}`);
          return;
        }
        case "approve":
          await this.client.tool.approve.mutate({
            toolCallId: command.toolCallId,
            approved: true,
          });
          await this.sendText(peerId, `Approved ${command.toolCallId}.`);
          return;
        case "reject":
          await this.client.tool.approve.mutate({
            toolCallId: command.toolCallId,
            approved: false,
          });
          await this.sendText(peerId, `Rejected ${command.toolCallId}.`);
          return;
        case "always":
          await this.client.tool.acceptForSession.mutate({
            toolCallId: command.toolCallId,
          });
          await this.sendText(
            peerId,
            `Allowed ${command.toolCallId} for the rest of this session.`,
          );
          return;
        case "answer":
          await this.client.question.answer.mutate({
            id: command.questionId,
            answer: command.answer,
          });
          await this.sendText(peerId, `Answered ${command.questionId}.`);
          return;
        case "model":
          await this.client.model.switch.mutate({ name: command.modelName });
          await this.sendText(peerId, `Switched model to ${command.modelName}.`);
          return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.sendText(peerId, `Command failed: ${message}`);
    }
  }

  private async streamReply(peerId: string, sessionId: string, text: string): Promise<void> {
    let replyText = "";
    const sideMessages: string[] = [];

    try {
      await new Promise<void>((resolve) => {
        this.client.chat.stream.subscribe(
          { sessionId, message: text },
          {
            onData: (event) => {
              switch (event.type) {
                case "text_delta":
                  replyText += event.delta;
                  break;
                case "tool_end":
                  sideMessages.push(formatToolResult(event.name, event.content, 300));
                  break;
                case "tool_approval_request":
                  sideMessages.push(
                    `Approval needed for ${event.name}.\n/approve ${event.id}\n/reject ${event.id}\n/always ${event.id}`,
                  );
                  break;
                case "user_question":
                  sideMessages.push(
                    event.options?.length
                      ? `Question: ${event.question}\nOptions: ${event.options.join(", ")}\n/answer ${event.id} <option>`
                      : `Question: ${event.question}\n/answer ${event.id} <your answer>`,
                  );
                  break;
                case "reaction":
                  sideMessages.push(event.emoji);
                  break;
                case "done":
                  resolve();
                  break;
                case "error":
                  sideMessages.push(`Error: ${event.message}`);
                  resolve();
                  break;
              }
            },
            onError: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              sideMessages.push(`Error: ${message}`);
              resolve();
            },
            onComplete: () => {
              resolve();
            },
          },
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sideMessages.push(`Error: ${message}`);
    }

    const outbound = [
      replyText.trim(),
      ...sideMessages.map((entry) => entry.trim()).filter(Boolean),
    ].filter(Boolean);

    if (outbound.length === 0) {
      await this.sendText(peerId, "Done.");
      return;
    }

    for (const message of outbound) {
      await this.sendText(peerId, message);
    }
  }
}

async function fetchLoginQRCode(baseUrl: string): Promise<{ qrcode: string; qrCodeUrl: string }> {
  const data = await getJson<WeChatLoginQRCodeResponse>(
    new URL("ilink/bot/get_bot_qrcode?bot_type=3", normalizeBaseUrl(baseUrl)).toString(),
  );

  if (!data.qrcode) {
    throw new Error("WeChat login did not return a qrcode identifier");
  }

  const qrCodeUrl = data.qrcode_url
    ? new URL(data.qrcode_url, normalizeBaseUrl(baseUrl)).toString()
    : new URL(
        `ilink/bot/get_qrcode?qrcode=${encodeURIComponent(data.qrcode)}`,
        normalizeBaseUrl(baseUrl),
      ).toString();

  return {
    qrcode: data.qrcode,
    qrCodeUrl,
  };
}

async function pollLoginStatus(
  baseUrl: string,
  qrcode: string,
): Promise<WeChatLoginStatusResponse> {
  return getJson<WeChatLoginStatusResponse>(
    new URL(
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      normalizeBaseUrl(baseUrl),
    ).toString(),
  );
}

export async function startWeChatLogin(
  options: {
    baseUrl?: string;
    homeDir?: string;
    timeoutMs?: number;
  } = {},
): Promise<WeChatAccountSecret> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const homeDir = options.homeDir ?? getRuntimeHome();
  const timeoutMs = options.timeoutMs ?? WECHAT_LOGIN_TIMEOUT_MS;
  const startedAt = Date.now();

  const { qrcode, qrCodeUrl } = await fetchLoginQRCode(baseUrl);

  console.log("Scan this QR code with WeChat to link Esperta Aria:");
  console.log(qrCodeUrl);
  console.log("");

  while (Date.now() - startedAt < timeoutMs) {
    const status = await pollLoginStatus(baseUrl, qrcode);
    if (status.auth_code && status.wx_alias) {
      const account: WeChatAccountSecret = {
        accountId: status.wx_alias,
        botToken: status.auth_code,
        apiBaseUrl: normalizeBaseUrl(status.baseurl ?? baseUrl),
        allowedUserIds: status.user_id ? [status.user_id] : undefined,
      };
      await upsertWeChatAccount(account, homeDir);
      return account;
    }

    if (status.errcode && status.errcode !== 0) {
      throw new Error(status.errmsg ?? `WeChat login failed with errcode ${status.errcode}`);
    }

    await delay(WECHAT_LOGIN_POLL_MS);
  }

  throw new Error("Timed out waiting for WeChat QR login confirmation");
}

export async function startWeChatConnector(options: { homeDir?: string } = {}): Promise<void> {
  const homeDir = options.homeDir ?? getRuntimeHome();
  const accounts = await loadWeChatAccounts(homeDir);

  if (accounts.length === 0) {
    throw new Error(
      "WeChat connector requires a linked account. Run `aria wechat login` or set WECHAT_ACCOUNT_ID + WECHAT_BOT_TOKEN.",
    );
  }

  const controller = new AbortController();
  const runners = accounts.map((account) => new WeChatAccountRunner(account, homeDir));

  const shutdown = () => {
    controller.abort();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await Promise.all(runners.map((runner) => runner.run(controller.signal)));
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}
