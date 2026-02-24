import type { DangerLevel } from "../agent/types.js";

/**
 * Patterns that are always dangerous regardless of what the agent claims.
 * Checked against the first command segment (before any pipes) and the full command.
 */
const ALWAYS_DANGEROUS_PATTERNS: RegExp[] = [
  // Destructive file operations
  /\brm\s+(-[a-zA-Z]*r|-[a-zA-Z]*f|--recursive|--force)/i,
  /\brm\b.*\s+\//,                   // rm targeting root paths
  /\bmkfs\b/,
  /\bdd\b\s+/,
  /\bshred\b/,
  // Privilege escalation
  /\bsudo\b/,
  /\bsu\s+/,
  /\bdoas\b/,
  // System control
  /\bshutdown\b/,
  /\breboot\b/,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/,
  /\blaunchctl\s+(load|unload|remove|kill)/,
  // Process killing
  /\bkill\s/,
  /\bkillall\b/,
  /\bpkill\b/,
  // Permission/ownership changes
  /\bchmod\b/,
  /\bchown\b/,
  // Pipe to shell (remote code execution patterns)
  /\|\s*(ba)?sh\b/,
  /\|\s*zsh\b/,
  /\|\s*source\b/,
  /\bcurl\b.*\|\s*/,
  /\bwget\b.*\|\s*/,
  // Disk/partition operations
  /\bfdisk\b/,
  /\bparted\b/,
  /\bmount\b/,
  /\bumount\b/,
  // Network danger
  /\biptables\b/,
  /\bnft\b/,
];

/**
 * Patterns for commands that are always safe.
 * Matched against the base command (first word, no path prefix).
 */
const ALWAYS_SAFE_COMMANDS = new Set([
  "ls", "ll", "la",
  "pwd",
  "echo",
  "cat", "head", "tail", "less", "more",
  "wc", "sort", "uniq", "tr", "cut", "paste",
  "date", "cal",
  "whoami", "id", "hostname", "uname",
  "which", "where", "type", "command",
  "file", "stat",
  "tree",
  "du", "df",
  "env", "printenv",
  "true", "false",
  "test", "[",
  "basename", "dirname", "realpath", "readlink",
  "md5", "md5sum", "shasum", "sha256sum",
  "diff", "cmp",
  "jq", "yq",
  "man", "help", "info",
]);

/** Git subcommands that are read-only and safe */
const SAFE_GIT_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "tag",
  "remote", "stash list", "config --list", "config --get",
  "ls-files", "ls-tree", "cat-file", "rev-parse",
  "describe", "shortlog", "blame", "reflog",
]);

/**
 * Classify an exec command using pattern matching.
 * The engine overrides the agent's self-declared level when patterns match.
 *
 * Priority:
 * 1. ALWAYS_DANGEROUS_PATTERNS → "dangerous" (overrides agent)
 * 2. ALWAYS_SAFE heuristics → "safe" (overrides agent)
 * 3. Otherwise → trust the agent's declaration
 */
export function classifyExecCommand(
  command: string,
  agentDeclared: DangerLevel = "dangerous",
): DangerLevel {
  const trimmed = command.trim();

  // Check dangerous patterns first (highest priority)
  for (const pattern of ALWAYS_DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) return "dangerous";
  }

  // Extract base command (first word, strip path)
  const firstWord = trimmed.split(/[\s;|&]/)[0];
  const baseCmd = firstWord.split("/").pop() ?? firstWord;

  // Check if it's a simple safe command (no pipes, no semicolons, no &&)
  const isSimple = !/[|;&]/.test(trimmed) || /^\s*\S+(\s+-[a-zA-Z0-9]+)*(\s+\S+)*\s*$/.test(trimmed);

  if (isSimple && ALWAYS_SAFE_COMMANDS.has(baseCmd)) {
    return "safe";
  }

  // Git: check subcommand
  if (baseCmd === "git") {
    const gitArgs = trimmed.replace(/^\s*\S+\s*/, ""); // strip "git "
    const subcommand = gitArgs.split(/\s/)[0];
    if (SAFE_GIT_SUBCOMMANDS.has(subcommand)) return "safe";
  }

  // Trust the agent's declaration
  return agentDeclared;
}
