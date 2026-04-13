import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname, userInfo } from "node:os";
import type { SecretsFile } from "./types.js";

const SALT_FILE = ".salt";
const SECRETS_FILE = "secrets.enc";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

async function getSalt(homeDir: string): Promise<Buffer> {
  const saltPath = join(homeDir, SALT_FILE);
  if (existsSync(saltPath)) {
    const hex = (await readFile(saltPath, "utf-8")).trim();
    return Buffer.from(hex, "hex");
  }
  const salt = randomBytes(32);
  await writeFile(saltPath, salt.toString("hex") + "\n");
  await chmod(saltPath, 0o600);
  return salt;
}

function machineFingerprint(): string {
  const info = userInfo();
  return `${hostname()}:${info.username}:${info.homedir}`;
}

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(machineFingerprint(), salt, 32, SCRYPT_PARAMS) as Buffer;
}

function encrypt(secrets: SecretsFile, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(secrets);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

function decrypt(raw: string, key: Buffer): SecretsFile {
  const { iv, authTag, data } = JSON.parse(raw);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf-8"));
}

export async function loadSecrets(homeDir: string): Promise<SecretsFile | null> {
  const secretsPath = join(homeDir, SECRETS_FILE);
  if (!existsSync(secretsPath)) return null;

  const salt = await getSalt(homeDir);
  const raw = await readFile(secretsPath, "utf-8");

  try {
    const key = deriveKey(salt);
    return decrypt(raw, key);
  } catch {
    console.warn(
      "[aria] Warning: secrets.enc could not be decrypted (file may be corrupted, from a different machine, or from an unsupported legacy runtime) - recreate secrets or use environment variables",
    );
    return null;
  }
}

export async function saveSecrets(homeDir: string, secrets: SecretsFile): Promise<void> {
  const salt = await getSalt(homeDir);
  const key = deriveKey(salt);
  const encrypted = encrypt(secrets, key);
  const secretsPath = join(homeDir, SECRETS_FILE);
  await writeFile(secretsPath, encrypted);
  await chmod(secretsPath, 0o600);
}

export const _internal = { deriveKey, encrypt, decrypt, machineFingerprint };
