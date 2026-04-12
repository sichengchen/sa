import { isAbsolute, relative, resolve } from "node:path";

export function isPathInside(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function toRelativeIfInside(baseDir: string, targetPath: string): string | null {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  if (!isPathInside(base, target)) {
    return null;
  }
  const rel = relative(base, target);
  return rel === "" ? "." : rel;
}
