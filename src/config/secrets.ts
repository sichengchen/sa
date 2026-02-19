import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import type { SecretsFile } from "./types.js";

const SALT_FILE = ".salt";
const SECRETS_FILE = "secrets.enc";

/** Read or generate the machine salt (32 bytes, stored as hex). */
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

/** Derive a 32-byte encryption key from hostname + salt using scrypt. */
function deriveKey(salt: Buffer): Buffer {
  return scryptSync(hostname(), salt, 32) as Buffer;
}

/** Encrypt a SecretsFile and return the JSON string to be stored on disk. */
function encrypt(secrets: SecretsFile, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(secrets);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

/** Decrypt the stored JSON string and return a SecretsFile. */
function decrypt(raw: string, key: Buffer): SecretsFile {
  const { iv, authTag, data } = JSON.parse(raw);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf-8"));
}

/** Load and decrypt secrets from ~/.sa/secrets.enc. Returns null if missing or corrupted. */
export async function loadSecrets(homeDir: string): Promise<SecretsFile | null> {
  const secretsPath = join(homeDir, SECRETS_FILE);
  if (!existsSync(secretsPath)) return null;
  try {
    const salt = await getSalt(homeDir);
    const key = deriveKey(salt);
    const raw = await readFile(secretsPath, "utf-8");
    return decrypt(raw, key);
  } catch {
    console.warn(
      "[sa] Warning: secrets.enc could not be decrypted — falling back to environment variables"
    );
    return null;
  }
}

/** Encrypt and save secrets to ~/.sa/secrets.enc (chmod 600). */
export async function saveSecrets(
  homeDir: string,
  secrets: SecretsFile
): Promise<void> {
  const salt = await getSalt(homeDir);
  const key = deriveKey(salt);
  const encrypted = encrypt(secrets, key);
  const secretsPath = join(homeDir, SECRETS_FILE);
  await writeFile(secretsPath, encrypted);
  await chmod(secretsPath, 0o600);
}
