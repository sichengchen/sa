/**
 * Shared types for the coding agent subprocess infrastructure.
 *
 * Used by both the claude_code and codex native tools.
 */

/** Configuration for spawning a coding agent subprocess */
export interface AgentSubprocessConfig {
  /** CLI executable name: "claude" or "codex" */
  cli: string;
  /** CLI arguments */
  args: string[];
  /** Extra environment variables (e.g. API keys) */
  env?: Record<string, string>;
  /** Working directory for the subprocess */
  workdir?: string;
  /** Timeout in milliseconds (default: 300_000 = 5min foreground, 1_800_000 = 30min background) */
  timeout?: number;
  /** Run in background — return handle immediately, poll for results */
  background?: boolean;
}

/** Result from a completed coding agent subprocess */
export interface AgentSubprocessResult {
  /** Exit status category */
  status: "success" | "error" | "timeout" | "cancelled";
  /** Raw process exit code */
  exitCode: number;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
  /** Files modified (parsed from output if available) */
  filesModified?: string[];
  /** Extracted one-line summary */
  summary?: string;
  /** Elapsed time in milliseconds */
  duration: number;
}

/** Auth/installation status for a coding agent CLI */
export interface AgentAuthStatus {
  /** Whether the CLI binary is installed and accessible */
  installed: boolean;
  /** CLI version string if installed */
  version?: string;
  /** Whether the CLI is authenticated (has valid credentials) */
  authenticated: boolean;
  /** Auth method detected */
  authMethod?: "oauth" | "api_key" | "none";
}

/** Handle for a background subprocess */
export interface AgentSubprocessHandle {
  /** Unique handle ID */
  id: string;
  /** CLI name */
  cli: string;
  /** Whether the subprocess is still running */
  running: boolean;
  /** Subprocess PID */
  pid?: number;
  /** Start time (Date.now()) */
  startedAt: number;
  /** Result (populated when subprocess completes) */
  result?: AgentSubprocessResult;
  /** Abort the subprocess */
  abort(): void;
}
