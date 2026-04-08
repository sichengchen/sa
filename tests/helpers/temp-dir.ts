import { beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Shared temp directory lifecycle for tests.
 * Creates a unique dir before each test, removes it after.
 *
 * Usage:
 *   describe("MyFeature", () => {
 *     withTempDir((getDir) => {
 *       test("writes a file", async () => {
 *         const dir = getDir();
 *       });
 *     });
 *   });
 */
export function withTempDir(fn: (getDir: () => string) => void): void {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aria-test-"));
  });

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  fn(() => dir);
}
