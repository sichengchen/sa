import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import type { Message } from "@mariozechner/pi-ai";
import type { Session } from "@aria/shared/types.js";

const MAX_PREVIEW_CHARS = 220;
const MAX_SUMMARY_CHARS = 800;
const MAX_INDEXED_MESSAGE_CHARS = 600;
const MAX_SEARCH_DOC_CHARS = 50_000;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  preview TEXT NOT NULL,
  summary TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  role TEXT NOT NULL,
  tool_name TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  UNIQUE(session_id, message_index)
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_idx ON messages(session_id, message_index);

CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(
  session_id UNINDEXED,
  content
);
`;

export interface ArchivedMessage {
  role: string;
  content: string;
  timestamp: number;
  toolName?: string;
  isError?: boolean;
}

export interface ArchivedSessionRecord {
  sessionId: string;
  connectorType: string;
  connectorId: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
  preview: string;
  summary: string;
}

export interface ArchivedSessionSearchResult extends ArchivedSessionRecord {
  snippet: string;
  score: number;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).trimEnd() + "…";
}

function stripMemoryContext(text: string): string {
  return text.replace(/^<memory_context>\n[\s\S]*?\n<\/memory_context>\n\n/, "");
}

function extractContent(value: unknown): string {
  if (typeof value === "string") return stripMemoryContext(value);
  if (Array.isArray(value)) {
    return value
      .map((part) => extractPartContent(part))
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.errorMessage === "string") return record.errorMessage;
    if (typeof record.text === "string") return record.text;
    return JSON.stringify(value);
  }
  return "";
}

function extractPartContent(part: unknown): string {
  if (typeof part === "string") return stripMemoryContext(part);
  if (!part || typeof part !== "object") return "";

  const record = part as Record<string, unknown>;
  if (typeof record.text === "string") return stripMemoryContext(record.text);

  if (record.type === "toolCall") {
    const toolName = typeof record.name === "string" ? record.name : "tool";
    const args = record.arguments ? JSON.stringify(record.arguments) : "";
    return args ? `[toolCall:${toolName}] ${args}` : `[toolCall:${toolName}]`;
  }

  return JSON.stringify(record);
}

function normalizeMessage(message: Message): ArchivedMessage {
  const role = message.role === "toolResult" ? "tool" : message.role;
  const raw = extractContent((message as { content?: unknown }).content);
  const content = raw.trim();
  const toolName = message.role === "toolResult"
    ? ((message as { toolName?: string }).toolName ?? undefined)
    : undefined;
  const isError = message.role === "toolResult"
    ? Boolean((message as { isError?: boolean }).isError)
    : false;

  return {
    role,
    content,
    timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
    toolName,
    isError,
  };
}

function buildPreview(messages: ArchivedMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.content.length > 0);
  if (!latest) return "";
  return truncate(latest.content.replace(/\s+/g, " "), MAX_PREVIEW_CHARS);
}

function buildSummary(messages: ArchivedMessage[]): string {
  const userMessages = messages.filter((message) => message.role === "user" && message.content);
  const assistantMessages = messages.filter((message) => message.role === "assistant" && message.content);
  const toolNames = Array.from(new Set(
    messages
      .map((message) => message.toolName)
      .filter((name): name is string => Boolean(name)),
  ));

  const parts: string[] = [];
  if (userMessages[0]?.content) {
    parts.push(`Started: ${truncate(userMessages[0].content.replace(/\s+/g, " "), 180)}`);
  }
  if (userMessages.length > 1) {
    const latestUser = userMessages[userMessages.length - 1]!;
    parts.push(`Latest user: ${truncate(latestUser.content.replace(/\s+/g, " "), 180)}`);
  }
  if (assistantMessages.length > 0) {
    const latestAssistant = assistantMessages[assistantMessages.length - 1]!;
    parts.push(`Latest assistant: ${truncate(latestAssistant.content.replace(/\s+/g, " "), 220)}`);
  }
  if (toolNames.length > 0) {
    parts.push(`Tools: ${toolNames.slice(0, 8).join(", ")}`);
  }

  return truncate(parts.join("\n"), MAX_SUMMARY_CHARS);
}

function buildSearchDocument(summary: string, preview: string, messages: ArchivedMessage[]): string {
  const chunks: string[] = [];
  if (summary) chunks.push(summary);
  if (preview) chunks.push(preview);

  for (const message of messages) {
    if (!message.content) continue;
    const prefix = message.toolName ? `${message.role}:${message.toolName}` : message.role;
    chunks.push(`${prefix} ${truncate(message.content, MAX_INDEXED_MESSAGE_CHARS)}`);
  }

  return truncate(chunks.join("\n"), MAX_SEARCH_DOC_CHARS);
}

function sanitizeFtsQuery(query: string): string {
  const tokens = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `"${token}"`);

  return tokens.join(" ");
}

export class SessionArchiveManager {
  private readonly dbPath: string;
  private db: Database | null = null;

  constructor(runtimeHome: string) {
    this.dbPath = join(runtimeHome, "session-archive.sqlite");
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(SCHEMA_SQL);
  }

  async syncSession(session: Session, messages: readonly Message[]): Promise<void> {
    if (!this.db) return;

    const normalized = messages.map(normalizeMessage);
    const preview = buildPreview(normalized);
    const summary = buildSummary(normalized);
    const searchDoc = buildSearchDocument(summary, preview, normalized);
    const now = Date.now();

    const upsertSession = this.db.prepare(`
      INSERT INTO sessions (
        session_id, connector_type, connector_id, created_at, last_active_at,
        message_count, preview, summary, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        connector_type = excluded.connector_type,
        connector_id = excluded.connector_id,
        created_at = excluded.created_at,
        last_active_at = excluded.last_active_at,
        message_count = excluded.message_count,
        preview = excluded.preview,
        summary = excluded.summary,
        updated_at = excluded.updated_at
    `);
    const deleteMessages = this.db.prepare("DELETE FROM messages WHERE session_id = ?");
    const insertMessage = this.db.prepare(`
      INSERT INTO messages (
        session_id, message_index, role, tool_name, is_error, content, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const deleteSearch = this.db.prepare("DELETE FROM session_search WHERE session_id = ?");
    const insertSearch = this.db.prepare("INSERT INTO session_search (session_id, content) VALUES (?, ?)");

    const tx = this.db.transaction(() => {
      upsertSession.run(
        session.id,
        session.connectorType,
        session.connectorId,
        session.createdAt,
        session.lastActiveAt,
        normalized.length,
        preview,
        summary,
        now,
      );
      deleteMessages.run(session.id);
      deleteSearch.run(session.id);

      normalized.forEach((message, index) => {
        insertMessage.run(
          session.id,
          index,
          message.role,
          message.toolName ?? null,
          message.isError ? 1 : 0,
          message.content,
          message.timestamp,
        );
      });

      insertSearch.run(session.id, searchDoc);
    });

    tx();
  }

  async getHistory(sessionId: string): Promise<ArchivedMessage[]> {
    if (!this.db) return [];

    const rows = this.db.prepare(`
      SELECT role, tool_name, is_error, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY message_index ASC
    `).all(sessionId) as Array<{
      role: string;
      tool_name: string | null;
      is_error: number;
      content: string;
      timestamp: number;
    }>;

    return rows.map((row) => ({
      role: row.role,
      toolName: row.tool_name ?? undefined,
      isError: row.is_error === 1,
      content: row.content,
      timestamp: row.timestamp,
    }));
  }

  async getSessionRecord(sessionId: string): Promise<ArchivedSessionRecord | null> {
    if (!this.db) return null;

    const row = this.db.prepare(`
      SELECT session_id, connector_type, connector_id, created_at, last_active_at,
             message_count, preview, summary
      FROM sessions
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId) as {
      session_id: string;
      connector_type: string;
      connector_id: string;
      created_at: number;
      last_active_at: number;
      message_count: number;
      preview: string;
      summary: string;
    } | null;

    if (!row) return null;

    return {
      sessionId: row.session_id,
      connectorType: row.connector_type,
      connectorId: row.connector_id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      messageCount: row.message_count,
      preview: row.preview,
      summary: row.summary,
    };
  }

  async listRecent(limit = 20): Promise<ArchivedSessionRecord[]> {
    if (!this.db) return [];

    const rows = this.db.prepare(`
      SELECT session_id, connector_type, connector_id, created_at, last_active_at,
             message_count, preview, summary
      FROM sessions
      ORDER BY last_active_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      session_id: string;
      connector_type: string;
      connector_id: string;
      created_at: number;
      last_active_at: number;
      message_count: number;
      preview: string;
      summary: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      connectorType: row.connector_type,
      connectorId: row.connector_id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      messageCount: row.message_count,
      preview: row.preview,
      summary: row.summary,
    }));
  }

  async search(query: string, limit = 10): Promise<ArchivedSessionSearchResult[]> {
    if (!this.db) return [];

    const sanitized = sanitizeFtsQuery(query);
    if (!sanitized) return [];

    try {
      const rows = this.db.prepare(`
        SELECT
          s.session_id,
          s.connector_type,
          s.connector_id,
          s.created_at,
          s.last_active_at,
          s.message_count,
          s.preview,
          s.summary,
          snippet(session_search, 1, '[', ']', '…', 14) AS snippet,
          bm25(session_search) AS rank
        FROM session_search
        JOIN sessions s ON s.session_id = session_search.session_id
        WHERE session_search MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, limit) as Array<{
        session_id: string;
        connector_type: string;
        connector_id: string;
        created_at: number;
        last_active_at: number;
        message_count: number;
        preview: string;
        summary: string;
        snippet: string | null;
        rank: number;
      }>;

      return rows.map((row) => ({
        sessionId: row.session_id,
        connectorType: row.connector_type,
        connectorId: row.connector_id,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
        messageCount: row.message_count,
        preview: row.preview,
        summary: row.summary,
        snippet: row.snippet ?? row.preview,
        score: row.rank,
      }));
    } catch {
      return [];
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
