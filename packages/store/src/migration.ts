import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const SQLITE_COMPANION_SUFFIXES = ["-wal", "-shm"] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(sourcePath: string, targetPath: string): Promise<string | undefined> {
  if (!(await fileExists(sourcePath))) {
    return undefined;
  }

  await copyFile(sourcePath, targetPath);
  return targetPath;
}

export interface AriaStoreMigrationBackup {
  sourcePath: string;
  backupDir: string;
  createdAt: number;
  files: {
    main: string;
    wal?: string;
    shm?: string;
  };
  rollbackInstructions: string[];
}

export async function createAriaStoreMigrationBackup(
  sourcePath: string,
  backupRoot: string,
): Promise<AriaStoreMigrationBackup> {
  const createdAt = Date.now();
  const backupDir = join(backupRoot, `${basename(sourcePath)}.${createdAt}.${randomUUID()}`);

  await mkdir(backupDir, { recursive: true });

  const main = join(backupDir, basename(sourcePath));
  await copyFile(sourcePath, main);

  const [wal, shm] = await Promise.all(
    SQLITE_COMPANION_SUFFIXES.map((suffix) =>
      copyIfPresent(`${sourcePath}${suffix}`, join(backupDir, `${basename(sourcePath)}${suffix}`)),
    ),
  );

  return {
    sourcePath,
    backupDir,
    createdAt,
    files: {
      main,
      ...(wal ? { wal } : {}),
      ...(shm ? { shm } : {}),
    },
    rollbackInstructions: [
      `Stop Aria processes using ${sourcePath}.`,
      `Restore ${main} back to ${sourcePath}.`,
      ...(wal ? [`Restore ${wal} back to ${sourcePath}-wal.`] : []),
      ...(shm ? [`Restore ${shm} back to ${sourcePath}-shm.`] : []),
      "Restart Aria after the restore completes.",
    ],
  };
}

export async function restoreAriaStoreMigrationBackup(
  backup: Pick<AriaStoreMigrationBackup, "sourcePath" | "files">,
): Promise<void> {
  await mkdir(dirname(backup.sourcePath), { recursive: true });
  await copyFile(backup.files.main, backup.sourcePath);

  await Promise.all(
    SQLITE_COMPANION_SUFFIXES.map(async (suffix) => {
      const key = suffix === "-wal" ? "wal" : "shm";
      const backupFile = backup.files[key];
      const targetFile = `${backup.sourcePath}${suffix}`;

      if (backupFile) {
        await copyFile(backupFile, targetFile);
        return;
      }

      await rm(targetFile, { force: true });
    }),
  );
}
