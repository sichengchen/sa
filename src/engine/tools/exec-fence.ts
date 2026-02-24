/**
 * Exec working directory fence — restricts where the exec tool can operate.
 */

import { homedir } from "node:os";
import { resolve, normalize } from "node:path";
import type { SecurityBlock } from "../agent/security-types.js";

const HOME = homedir();

export interface ExecFenceConfig {
  /** Allowed working directories. Paths starting with ~ are expanded. */
  fence?: string[];
  /** Always-denied paths. Commands referencing these are blocked unconditionally. */
  alwaysDeny?: string[];
}

/** Default fence: common dev directories */
export const DEFAULT_FENCE = ["~/projects", "/tmp"];

/** Default always-deny: credential and config directories */
export const DEFAULT_ALWAYS_DENY = [
  "~/.sa",
  "~/.ssh",
  "~/.gnupg",
  "~/.aws",
  "~/.config/gcloud",
  "~/.config/1password",
];

/** Expand ~ to home directory and normalize */
function expandPath(p: string): string {
  if (p.startsWith("~/")) return normalize(resolve(HOME, p.slice(2)));
  if (p === "~") return HOME;
  return normalize(resolve(p));
}

/** Extract absolute paths from a command string */
function extractAbsolutePaths(command: string): string[] {
  const paths: string[] = [];
  // Match /path/to/thing or ~/path/to/thing
  const regex = /(?:~\/|\/)[^\s;|&<>"'`]+/g;
  let match;
  while ((match = regex.exec(command)) !== null) {
    paths.push(match[0]);
  }
  return paths;
}

/** Check if a path is within any of the allowed directories */
function isPathWithinFence(targetPath: string, fencePaths: string[]): boolean {
  const normalized = expandPath(targetPath);
  for (const f of fencePaths) {
    const fenceDir = expandPath(f);
    if (normalized === fenceDir || normalized.startsWith(fenceDir + "/")) {
      return true;
    }
  }
  return false;
}

/** Check if a path matches any always-deny pattern */
function isPathDenied(targetPath: string, denyPaths: string[]): boolean {
  const normalized = expandPath(targetPath);
  for (const d of denyPaths) {
    const denyDir = expandPath(d);
    if (normalized === denyDir || normalized.startsWith(denyDir + "/")) {
      return true;
    }
  }
  return false;
}

/** Check if a path is within any of the session override directories */
function isPathWithinOverrides(targetPath: string, overrides?: Set<string>): boolean {
  if (!overrides?.size) return false;
  const normalized = expandPath(targetPath);
  for (const o of overrides) {
    if (normalized === o || normalized.startsWith(o + "/")) {
      return true;
    }
  }
  return false;
}

/**
 * Validate exec command paths against the fence.
 *
 * Returns `{ ok: true }` if allowed, or a `SecurityBlock` if blocked.
 */
export function validateExecPaths(
  command: string,
  workdir: string | undefined,
  config?: ExecFenceConfig,
  overrides?: Set<string>,
): { ok: true } | SecurityBlock {
  const fence = config?.fence ?? DEFAULT_FENCE;
  const alwaysDeny = config?.alwaysDeny ?? DEFAULT_ALWAYS_DENY;

  // Validate workdir is within fence (if specified)
  if (workdir) {
    // Check always-deny first
    if (isPathDenied(workdir, alwaysDeny)) {
      return {
        layer: "exec_fence",
        detail: `Working directory is in a denied location: ${workdir}`,
        resource: workdir,
      };
    }

    if (!isPathWithinFence(workdir, fence) && !isPathWithinOverrides(workdir, overrides)) {
      return {
        layer: "exec_fence",
        detail: `Working directory is outside the fence: ${workdir}`,
        resource: workdir,
      };
    }
  }

  // Extract and validate absolute paths from command
  const paths = extractAbsolutePaths(command);
  for (const p of paths) {
    const expanded = expandPath(p);

    // Always-deny paths are unconditional (even with overrides)
    // Exception: ~/.sa is ALWAYS denied, no override
    const saHome = expandPath("~/.sa");
    if (expanded === saHome || expanded.startsWith(saHome + "/")) {
      return {
        layer: "exec_fence",
        detail: `Access to SA home directory is always denied: ${p}`,
        resource: p,
      };
    }

    if (isPathDenied(p, alwaysDeny)) {
      return {
        layer: "exec_fence",
        detail: `Path is in a denied location: ${p}`,
        resource: p,
      };
    }

    // Check if path is within fence or overrides
    if (!isPathWithinFence(p, fence) && !isPathWithinOverrides(p, overrides)) {
      return {
        layer: "exec_fence",
        detail: `Path is outside the fence: ${p}`,
        resource: p,
      };
    }
  }

  return { ok: true };
}
