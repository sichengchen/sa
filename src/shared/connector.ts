import type { EngineEvent, ConnectorType } from "./types.js";

/** Generic Connector interface — all frontends (TUI, Telegram, Discord) implement this */
export interface Connector {
  /** Unique Connector instance identifier */
  readonly id: string;
  /** Connector type */
  readonly type: ConnectorType;

  /** Connect to the Engine via tRPC */
  connect(engineUrl: string, token: string): Promise<void>;
  /** Graceful disconnect */
  disconnect(): Promise<void>;

  /** Subscribe to Engine events for the active session */
  onEngineEvent(handler: (event: EngineEvent) => void): void;
  /** Send a user message to the Engine */
  sendMessage(text: string): Promise<void>;
  /** Respond to a tool-approval request */
  handleApproval(toolCallId: string, approved: boolean): Promise<void>;
}
