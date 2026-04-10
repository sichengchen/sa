import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { toRelativeIfInside } from "../../../src/engine/path-boundary.js";

const DEFAULT_EXCLUDES = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".nuxt/",
  ".cache/",
  "coverage/",
  ".git/",
  ".env",
  ".env.*",
  "__pycache__/",
  "*.log",
];

const MAX_FILES = 50_000;

export interface CheckpointConfig {
  enabled?: boolean;
  maxSnapshots?: number;
}

export interface CheckpointEntry {
  hash: string;
  shortHash: string;
  timestamp: string;
  reason: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

function safeDecode(bytes?: Uint8Array): string {
  if (!bytes) return "";
  return new TextDecoder().decode(bytes).trim();
}

function parseShortStat(text: string): { filesChanged: number; insertions: number; deletions: number } {
  const files = Number(text.match(/(\d+)\s+file/)?.[1] ?? 0);
  const insertions = Number(text.match(/(\d+)\s+insertion/)?.[1] ?? 0);
  const deletions = Number(text.match(/(\d+)\s+deletion/)?.[1] ?? 0);
  return { filesChanged: files, insertions, deletions };
}

function countFiles(rootDir: string): number {
  let count = 0;
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      count++;
      if (count > MAX_FILES) {
        return count;
      }
      if (entry.isDirectory()) {
        pending.push(resolve(current, entry.name));
      }
    }
  }
  return count;
}

function checkpointReason(reason: string): string {
  return reason.replace(/\s+/g, " ").trim().slice(0, 200) || "auto";
}

export function shouldCheckpointExec(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return (
    /\brm\b/.test(normalized) ||
    /\bmv\b/.test(normalized) ||
    /\bsed\s+-i\b/.test(normalized) ||
    /\btruncate\b/.test(normalized) ||
    /\bshred\b/.test(normalized) ||
    />/.test(normalized) ||
    /\bgit\s+(reset|clean|checkout|restore)\b/.test(normalized)
  );
}

export class CheckpointManager {
  private readonly baseDir: string;
  private readonly enabled: boolean;
  private readonly maxSnapshots: number;
  private readonly checkpointedDirs = new Set<string>();
  private gitAvailable: boolean | null = null;

  constructor(homeDir: string, config: CheckpointConfig = {}) {
    this.baseDir = resolve(homeDir, "checkpoints");
    this.enabled = config.enabled ?? false;
    this.maxSnapshots = Math.max(1, config.maxSnapshots ?? 50);
  }

  newTurn(): void {
    this.checkpointedDirs.clear();
  }

  private getShadowRepo(workingDir: string): string {
    const digest = createHash("sha256").update(resolve(workingDir)).digest("hex").slice(0, 16);
    return resolve(this.baseDir, digest);
  }

  private buildGitEnv(shadowRepo: string, workingDir: string): Record<string, string> {
    const env = { ...process.env } as Record<string, string>;
    env.GIT_DIR = shadowRepo;
    env.GIT_WORK_TREE = resolve(workingDir);
    delete env.GIT_INDEX_FILE;
    delete env.GIT_NAMESPACE;
    delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
    return env;
  }

  private runGit(args: string[], shadowRepo: string, workingDir: string): { ok: boolean; stdout: string; stderr: string; code: number } {
    const proc = Bun.spawnSync(["git", ...args], {
      cwd: resolve(workingDir),
      env: this.buildGitEnv(shadowRepo, workingDir),
      stdout: "pipe",
      stderr: "pipe",
    });

    return {
      ok: proc.exitCode === 0,
      stdout: safeDecode(proc.stdout),
      stderr: safeDecode(proc.stderr),
      code: proc.exitCode,
    };
  }

  private async ensureRepo(shadowRepo: string, workingDir: string): Promise<void> {
    if (existsSync(resolve(shadowRepo, "HEAD"))) {
      return;
    }

    await mkdir(shadowRepo, { recursive: true });
    const init = this.runGit(["init"], shadowRepo, workingDir);
    if (!init.ok) {
      throw new Error(init.stderr || "git init failed");
    }
    this.runGit(["config", "user.email", "aria@local"], shadowRepo, workingDir);
    this.runGit(["config", "user.name", "Aria Checkpoint"], shadowRepo, workingDir);
    await mkdir(resolve(shadowRepo, "info"), { recursive: true });
    await writeFile(resolve(shadowRepo, "info", "exclude"), DEFAULT_EXCLUDES.join("\n") + "\n");
    await writeFile(resolve(shadowRepo, "ARIA_WORKDIR"), `${resolve(workingDir)}\n`);
  }

  private async takeSnapshot(workingDir: string, reason: string): Promise<boolean> {
    if (this.gitAvailable === null) {
      this.gitAvailable = Bun.which("git") !== null;
    }
    if (!this.gitAvailable) {
      return false;
    }

    const absDir = resolve(workingDir);
    if (absDir === "/" || absDir === resolve(process.env.HOME ?? "~")) {
      return false;
    }
    if (countFiles(absDir) > MAX_FILES) {
      return false;
    }

    const shadowRepo = this.getShadowRepo(absDir);
    await this.ensureRepo(shadowRepo, absDir);

    this.runGit(["add", "-A"], shadowRepo, absDir);
    const diff = this.runGit(["diff", "--cached", "--quiet"], shadowRepo, absDir);
    if (diff.code === 0) {
      return false;
    }

    const commit = this.runGit(["commit", "-m", checkpointReason(reason)], shadowRepo, absDir);
    if (!commit.ok) {
      throw new Error(commit.stderr || "git commit failed");
    }

    const log = this.runGit(["rev-list", "--max-count", String(this.maxSnapshots), "HEAD"], shadowRepo, absDir);
    if (log.ok) {
      const keep = log.stdout.split("\n").filter(Boolean);
      const all = this.runGit(["rev-list", "--all"], shadowRepo, absDir);
      if (all.ok) {
        const remove = all.stdout.split("\n").filter((hash) => hash && !keep.includes(hash));
        for (const hash of remove) {
          this.runGit(["update-ref", "-d", `refs/archive/${hash}`], shadowRepo, absDir);
        }
      }
    }

    return true;
  }

  async ensureCheckpoint(workingDir: string, reason = "auto"): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    const absDir = resolve(workingDir);
    if (this.checkpointedDirs.has(absDir)) {
      return false;
    }
    this.checkpointedDirs.add(absDir);
    try {
      return await this.takeSnapshot(absDir, reason);
    } catch {
      return false;
    }
  }

  async listCheckpoints(workingDir: string): Promise<CheckpointEntry[]> {
    const absDir = resolve(workingDir);
    const shadowRepo = this.getShadowRepo(absDir);
    if (!existsSync(resolve(shadowRepo, "HEAD"))) {
      return [];
    }

    const log = this.runGit(["log", "--format=%H|%h|%aI|%s", "-n", String(this.maxSnapshots)], shadowRepo, absDir);
    if (!log.ok || !log.stdout) {
      return [];
    }

    const entries: CheckpointEntry[] = [];
    for (const line of log.stdout.split("\n")) {
      const [hash, shortHash, timestamp, reason] = line.split("|");
      if (!hash || !shortHash || !timestamp || reason === undefined) continue;
      const stat = this.runGit(["diff", "--shortstat", `${hash}~1`, hash], shadowRepo, absDir);
      const parsed = parseShortStat(stat.stdout);
      entries.push({
        hash,
        shortHash,
        timestamp,
        reason,
        ...parsed,
      });
    }
    return entries;
  }

  async diff(workingDir: string, commitHash: string): Promise<{ success: boolean; diff?: string; error?: string }> {
    const absDir = resolve(workingDir);
    const shadowRepo = this.getShadowRepo(absDir);
    if (!existsSync(resolve(shadowRepo, "HEAD"))) {
      return { success: false, error: "No checkpoints exist for this directory." };
    }

    const diff = this.runGit(["diff", commitHash, "--"], shadowRepo, absDir);
    if (!diff.ok && !diff.stdout) {
      return { success: false, error: diff.stderr || "Failed to diff checkpoint." };
    }
    return { success: true, diff: diff.stdout || "(no changes)" };
  }

  async restore(
    workingDir: string,
    commitHash: string,
    filePath?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const absDir = resolve(workingDir);
    const shadowRepo = this.getShadowRepo(absDir);
    if (!existsSync(resolve(shadowRepo, "HEAD"))) {
      return { success: false, error: "No checkpoints exist for this directory." };
    }

    try {
      await this.takeSnapshot(absDir, "pre-rollback snapshot");
    } catch {
      // Non-fatal; keep going.
    }

    const args = filePath
      ? (() => {
          const relativePath = relativeToDir(absDir, resolve(absDir, filePath));
          if (!relativePath) {
            return null;
          }
          return ["checkout", commitHash, "--", relativePath];
        })()
      : ["checkout", commitHash, "--", "."];
    if (!args) {
      return { success: false, error: "filePath escapes the working directory." };
    }
    const restore = this.runGit(args, shadowRepo, absDir);
    if (!restore.ok) {
      return { success: false, error: restore.stderr || "Restore failed." };
    }
    return { success: true };
  }
}

function relativeToDir(baseDir: string, targetPath: string): string | null {
  return toRelativeIfInside(baseDir, targetPath);
}

export function checkpointWorkdirForArgs(toolName: string, args: Record<string, unknown>, fallbackWorkingDir: string): string | null {
  if (toolName === "write" || toolName === "edit") {
    const filePath = args.file_path;
    if (typeof filePath === "string" && filePath.trim()) {
      return dirname(resolve(filePath));
    }
  }

  if (toolName === "skill_manage") {
    return fallbackWorkingDir;
  }

  if (toolName === "exec") {
    const command = args.command;
    if (typeof command === "string" && shouldCheckpointExec(command)) {
      const workdir = typeof args.workdir === "string" && args.workdir.trim()
        ? args.workdir
        : fallbackWorkingDir;
      return resolve(workdir);
    }
  }

  return null;
}
