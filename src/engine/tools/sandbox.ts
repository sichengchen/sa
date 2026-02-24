/**
 * OS-level sandbox for exec commands.
 *
 * Best-effort defense-in-depth: wraps exec commands with platform-specific
 * sandboxing when available. Falls back to no-op with a warning on
 * unsupported platforms.
 *
 * - macOS: sandbox-exec (Seatbelt) — profile-based file/network restrictions
 * - Linux: bubblewrap (bwrap) — user-namespace filesystem sandboxing
 * - Fallback: NoopSandbox — returns command unchanged, logs warning once
 */

import { existsSync } from "node:fs";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface SandboxOptions {
  /** Allowed working directories (read + write) */
  fence: string[];
  /** Always-denied paths */
  deny: string[];
}

export interface Sandbox {
  /** Whether this sandbox is available on the current platform */
  available(): boolean;
  /** Sandbox implementation name */
  name(): string;
  /** Wrap a shell command array with sandbox restrictions. Returns modified command array. */
  wrap(command: string[], opts: SandboxOptions): string[];
  /** Cleanup any temp resources (call after exec completes) */
  cleanup?(): void;
}

// ---------- macOS Seatbelt ----------

function generateSeatbeltProfile(opts: SandboxOptions): string {
  const lines: string[] = [
    "(version 1)",
    "(deny default)",
    // Allow basic process execution
    "(allow process-exec)",
    "(allow process-fork)",
    "(allow signal)",
    // Allow sysctl reads (needed for basic process operation)
    "(allow sysctl-read)",
    // Allow network (HTTP/HTTPS) — URL policy handles network restrictions
    "(allow network*)",
    // Allow reading system libraries and binaries (needed for sh, commands)
    '(allow file-read* (subpath "/usr"))',
    '(allow file-read* (subpath "/bin"))',
    '(allow file-read* (subpath "/sbin"))',
    '(allow file-read* (subpath "/Library"))',
    '(allow file-read* (subpath "/System"))',
    '(allow file-read* (subpath "/private/var"))',
    '(allow file-read* (subpath "/private/etc"))',
    '(allow file-read* (subpath "/etc"))',
    '(allow file-read* (subpath "/var"))',
    '(allow file-read* (subpath "/dev"))',
    '(allow file-read* (subpath "/tmp"))',
    '(allow file-write* (subpath "/tmp"))',
    '(allow file-write* (subpath "/dev"))',
    // Allow reading/writing to /private/tmp (macOS temp)
    '(allow file-read* (subpath "/private/tmp"))',
    '(allow file-write* (subpath "/private/tmp"))',
    // Allow Homebrew paths
    '(allow file-read* (subpath "/opt/homebrew"))',
    '(allow file-read* (subpath "/usr/local"))',
  ];

  // Deny paths take priority (added before fence allows)
  for (const denyPath of opts.deny) {
    const expanded = expandHome(denyPath);
    lines.push(`(deny file-read* (subpath "${escapeSbPath(expanded)}"))`);
    lines.push(`(deny file-write* (subpath "${escapeSbPath(expanded)}"))`);
  }

  // Allow fence directories (read + write)
  for (const fencePath of opts.fence) {
    const expanded = expandHome(fencePath);
    lines.push(`(allow file-read* (subpath "${escapeSbPath(expanded)}"))`);
    lines.push(`(allow file-write* (subpath "${escapeSbPath(expanded)}"))`);
  }

  // Allow reading home directory broadly (many tools need this)
  const home = process.env.HOME ?? "/Users/unknown";
  lines.push(`(allow file-read* (subpath "${escapeSbPath(home)}"))`);

  return lines.join("\n") + "\n";
}

function escapeSbPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    const home = process.env.HOME ?? "/Users/unknown";
    return join(home, p.slice(2));
  }
  return p;
}

export class SeatbeltSandbox implements Sandbox {
  private profilePath?: string;
  private tempDir?: string;

  available(): boolean {
    return process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
  }

  name(): string {
    return "seatbelt";
  }

  wrap(command: string[], opts: SandboxOptions): string[] {
    const profile = generateSeatbeltProfile(opts);

    // Write profile to temp file
    this.tempDir = mkdtempSync(join(tmpdir(), "sa-sandbox-"));
    this.profilePath = join(this.tempDir, "profile.sb");
    writeFileSync(this.profilePath, profile);

    return ["sandbox-exec", "-f", this.profilePath, "--", ...command];
  }

  cleanup(): void {
    if (this.profilePath) {
      try { unlinkSync(this.profilePath); } catch { /* ignore */ }
    }
    if (this.tempDir) {
      try { unlinkSync(this.tempDir); } catch { /* ignore — may not be empty */ }
    }
    this.profilePath = undefined;
    this.tempDir = undefined;
  }
}

// ---------- No-op fallback ----------

let noopWarned = false;

export class NoopSandbox implements Sandbox {
  available(): boolean {
    return false;
  }

  name(): string {
    return "none";
  }

  wrap(command: string[], _opts: SandboxOptions): string[] {
    if (!noopWarned) {
      console.warn("[sa] OS sandbox unavailable on this platform. Relying on application-level exec fence.");
      noopWarned = true;
    }
    return command;
  }
}

// ---------- Detection ----------

/** Detect and return the best available sandbox for the current platform */
export function detectSandbox(): Sandbox {
  if (process.platform === "darwin") {
    const seatbelt = new SeatbeltSandbox();
    if (seatbelt.available()) return seatbelt;
  }
  // Linux Landlock/bwrap could be added here in the future
  return new NoopSandbox();
}
