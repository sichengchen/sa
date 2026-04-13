import type { DangerLevel } from "@aria/agent-aria";

/**
 * Patterns that are always dangerous regardless of what the agent claims.
 * Checked against the first command segment (before any pipes) and the full command.
 */
const ALWAYS_DANGEROUS_PATTERNS: RegExp[] = [
  // Destructive file operations
  /\brm\s+(-[a-zA-Z]*r|-[a-zA-Z]*f|--recursive|--force)/i,
  /\brm\b.*\s+\//, // rm targeting root paths
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
  // Pipe to shell (remote code execution patterns) — all shell variants
  /\|\s*(ba|da|k|z|c|tc|fi)?sh\b/,
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
 * Shell indirection / metaprogramming — always dangerous.
 * These catch patterns where the command invokes another command dynamically.
 */
const SHELL_INDIRECTION: RegExp[] = [
  /\$\(/, // command substitution $(...)
  /`[^`]+`/, // backtick substitution
  /\beval\b/, // dynamic execution
  /\bsource\b/, // source scripts
  /\bexec\b\s/, // process replacement
  /\bxargs\b.*\b(ba|da|k|z|c|tc|fi)?sh\b/, // xargs piping to shell
  /\bfind\b.*-exec/, // find -exec
  /\bawk\b.*\bsystem\b/, // awk system()
  /\bperl\b.*-e/, // inline Perl
  /\bpython3?\b.*-c/, // inline Python
  /\bruby\b.*-e/, // inline Ruby
  /\bnode\b.*-e/, // inline Node
  /\bphp\b.*-r/, // inline PHP
];

/**
 * Patterns for commands that are always safe.
 * Matched against the base command (first word, no path prefix).
 */
const ALWAYS_SAFE_COMMANDS = new Set([
  "ls",
  "ll",
  "la",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "wc",
  "sort",
  "uniq",
  "tr",
  "cut",
  "paste",
  "date",
  "cal",
  "whoami",
  "id",
  "hostname",
  "uname",
  "which",
  "where",
  "type",
  "command",
  "file",
  "stat",
  "tree",
  "du",
  "df",
  "env",
  "printenv",
  "true",
  "false",
  "test",
  "[",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "md5",
  "md5sum",
  "shasum",
  "sha256sum",
  "diff",
  "cmp",
  "comm",
  "column",
  "jq",
  "yq",
  "man",
  "help",
  "info",
  "grep",
  "rg",
  "ag",
  "ack",
  "sed",
  "awk",
  "find",
  "curl",
  "wget",
  "http",
]);

/** Git subcommands that are read-only and safe */
const SAFE_GIT_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "branch",
  "tag",
  "remote",
  "stash list",
  "config --list",
  "config --get",
  "ls-files",
  "ls-tree",
  "cat-file",
  "rev-parse",
  "describe",
  "shortlog",
  "blame",
  "reflog",
]);

/** Git subcommands that are always dangerous */
const DANGEROUS_GIT_SUBCOMMANDS = new Set(["push", "reset", "clean", "checkout .", "restore ."]);

/**
 * Classify an exec command using pattern matching.
 * The engine overrides the agent's self-declared level when patterns match.
 *
 * Priority:
 * 1. ALWAYS_DANGEROUS_PATTERNS → "dangerous" (overrides agent)
 * 2. SHELL_INDIRECTION → "dangerous" (overrides agent)
 * 3. ALWAYS_SAFE heuristics → "safe" (overrides agent)
 * 4. Otherwise → "dangerous" (default-deny)
 */
export function classifyExecCommand(
  command: string,
  _agentDeclared: DangerLevel = "dangerous",
): DangerLevel {
  const trimmed = command.trim();

  // Check dangerous patterns first (highest priority)
  for (const pattern of ALWAYS_DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) return "dangerous";
  }

  // Check shell indirection patterns
  for (const pattern of SHELL_INDIRECTION) {
    if (pattern.test(trimmed)) return "dangerous";
  }

  // Extract base command (first word, strip path)
  const firstWord = trimmed.split(/[\s;|&]/)[0];
  const baseCmd = firstWord.split("/").pop() ?? firstWord;

  // Check if it's a simple safe command (no pipes, no semicolons, no &&)
  const isSimple =
    !/[|;&]/.test(trimmed) || /^\s*\S+(\s+-[a-zA-Z0-9]+)*(\s+\S+)*\s*$/.test(trimmed);

  if (isSimple && ALWAYS_SAFE_COMMANDS.has(baseCmd)) {
    return "safe";
  }

  // Git: check subcommand
  if (baseCmd === "git") {
    const gitArgs = trimmed.replace(/^\s*\S+\s*/, ""); // strip "git "
    const subcommand = gitArgs.split(/\s/)[0];

    // Check dangerous git subcommands first
    if (DANGEROUS_GIT_SUBCOMMANDS.has(subcommand)) return "dangerous";
    // Check two-word dangerous patterns
    const twoWordGit = gitArgs.split(/\s/).slice(0, 2).join(" ");
    if (DANGEROUS_GIT_SUBCOMMANDS.has(twoWordGit)) return "dangerous";
    // Check for git config --global (can set core.sshCommand, hooks, etc.)
    if (/^config\s+--global\b/.test(gitArgs)) return "dangerous";

    if (SAFE_GIT_SUBCOMMANDS.has(subcommand)) return "safe";
  }

  // Default: dangerous (default-deny policy)
  return "dangerous";
}
