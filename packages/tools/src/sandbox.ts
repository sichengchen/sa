/**
 * OS-level sandbox for exec commands.
 *
 * Best-effort defense-in-depth: wraps exec commands with platform-specific
 * sandboxing when available. Falls back to no-op with a warning on
 * unsupported platforms.
 */

import { existsSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface SandboxOptions {
  fence: string[];
  deny: string[];
}

export interface Sandbox {
  available(): boolean;
  name(): string;
  wrap(command: string[], opts: SandboxOptions): string[];
  cleanup?(): void;
}

function generateSeatbeltProfile(opts: SandboxOptions): string {
  const lines: string[] = [
    "(version 1)",
    "(deny default)",
    "(allow process-exec)",
    "(allow process-fork)",
    "(allow signal)",
    "(allow sysctl-read)",
    "(allow network*)",
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
    '(allow file-read* (subpath "/private/tmp"))',
    '(allow file-write* (subpath "/private/tmp"))',
    '(allow file-read* (subpath "/opt/homebrew"))',
    '(allow file-read* (subpath "/usr/local"))',
  ];

  for (const denyPath of opts.deny) {
    const expanded = expandHome(denyPath);
    lines.push(`(deny file-read* (subpath "${escapeSbPath(expanded)}"))`);
    lines.push(`(deny file-write* (subpath "${escapeSbPath(expanded)}"))`);
  }

  for (const fencePath of opts.fence) {
    const expanded = expandHome(fencePath);
    lines.push(`(allow file-read* (subpath "${escapeSbPath(expanded)}"))`);
    lines.push(`(allow file-write* (subpath "${escapeSbPath(expanded)}"))`);
  }

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
    this.tempDir = mkdtempSync(join(tmpdir(), "aria-sandbox-"));
    this.profilePath = join(this.tempDir, "profile.sb");
    writeFileSync(this.profilePath, profile);
    return ["sandbox-exec", "-f", this.profilePath, "--", ...command];
  }

  cleanup(): void {
    if (this.profilePath) {
      try {
        unlinkSync(this.profilePath);
      } catch {}
    }
    if (this.tempDir) {
      try {
        unlinkSync(this.tempDir);
      } catch {}
    }
    this.profilePath = undefined;
    this.tempDir = undefined;
  }
}

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
      console.warn(
        "[aria] OS sandbox unavailable on this platform. Relying on application-level exec fence.",
      );
      noopWarned = true;
    }
    return command;
  }
}

export function detectSandbox(): Sandbox {
  if (process.platform === "darwin") {
    const seatbelt = new SeatbeltSandbox();
    if (seatbelt.available()) return seatbelt;
  }
  return new NoopSandbox();
}
