import type { ToolLoopConfig } from "./types.js";

const DEFAULT_WARN_THRESHOLD = 10;
const DEFAULT_BLOCK_THRESHOLD = 20;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 30;
const DEFAULT_WINDOW_SIZE = 30;

export type LoopLevel = "ok" | "warn" | "block" | "circuit_breaker";

export interface LoopCheckResult {
  level: LoopLevel;
  message?: string;
}

interface CallRecord {
  /** Hash of tool name + sorted args */
  callHash: string;
  /** Hash of result content (set after execution) */
  resultHash?: string;
  name: string;
}

/** Deterministic hash of a string using djb2 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/** Create a deterministic hash from tool name and sorted arguments */
function hashCall(name: string, args: Record<string, unknown>): string {
  const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
  return hashString(`${name}:${sortedArgs}`);
}

/**
 * Sliding-window detector for repetitive tool call patterns.
 *
 * Tracks recent tool calls and detects when the agent is stuck in a loop
 * (same tool + same args + same result). Uses a 3-tier response:
 * - warn: emit a warning but continue
 * - block: prevent the tool call
 * - circuit_breaker: hard-stop the agent loop
 */
export class ToolLoopDetector {
  private history: CallRecord[] = [];
  private readonly warnThreshold: number;
  private readonly blockThreshold: number;
  private readonly circuitBreakerThreshold: number;
  private readonly windowSize: number;

  constructor(config?: ToolLoopConfig) {
    this.warnThreshold = config?.warnThreshold ?? DEFAULT_WARN_THRESHOLD;
    this.blockThreshold = config?.blockThreshold ?? DEFAULT_BLOCK_THRESHOLD;
    this.circuitBreakerThreshold =
      config?.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.windowSize = config?.windowSize ?? DEFAULT_WINDOW_SIZE;
  }

  /**
   * Check before executing a tool call. Returns the detection level.
   * This counts how many times the same call hash appears in the window.
   */
  checkBeforeExecution(name: string, args: Record<string, unknown>): LoopCheckResult {
    const callHash = hashCall(name, args);

    // Count identical calls (same tool + same args) in the window
    const identicalCount = this.history.filter((r) => r.callHash === callHash).length;

    // Count identical calls that also produced the same result (no progress)
    const noProgressCount = this.history.filter(
      (r) => r.callHash === callHash && r.resultHash !== undefined,
    ).length;

    // Use the no-progress count for thresholds (if we have result data),
    // fall back to identical count otherwise
    const count = noProgressCount > 0 ? noProgressCount : identicalCount;

    if (count >= this.circuitBreakerThreshold) {
      return {
        level: "circuit_breaker",
        message: `Tool "${name}" called ${count} times with identical args and no progress — stopping agent`,
      };
    }

    if (count >= this.blockThreshold) {
      return {
        level: "block",
        message: `Tool "${name}" called ${count} times with identical args — call blocked`,
      };
    }

    return { level: "ok" };
  }

  /**
   * Record a tool call result and check for warnings.
   * Called after execution to track the result hash.
   */
  recordResult(
    name: string,
    args: Record<string, unknown>,
    resultContent: string,
  ): LoopCheckResult {
    const callHash = hashCall(name, args);
    const resultHash = hashString(resultContent);

    // Add to history
    this.history.push({ callHash, resultHash, name });

    // Trim window
    if (this.history.length > this.windowSize) {
      this.history = this.history.slice(-this.windowSize);
    }

    // Count calls with same hash AND same result (true no-progress)
    const noProgressCount = this.history.filter(
      (r) => r.callHash === callHash && r.resultHash === resultHash,
    ).length;

    if (noProgressCount >= this.warnThreshold && noProgressCount < this.blockThreshold) {
      return {
        level: "warn",
        message: `Tool "${name}" called ${noProgressCount} times with identical args and results — possible loop`,
      };
    }

    return { level: "ok" };
  }

  /** Reset the detection window */
  reset(): void {
    this.history = [];
  }

  /** Get the current history length (for testing) */
  get historyLength(): number {
    return this.history.length;
  }
}
