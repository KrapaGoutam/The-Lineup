import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { normalizePairingCode } from "../domain/kiosk-device";

// 32-character unambiguous charset avoiding O/0, I/1, L
const PAIRING_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Retrieves the dedicated session secret key.
 * Enforces fail-closed validation: in deployed environments, missing or
 * insufficient secret (< 32 chars) throws immediately.
 */
export function getKioskSessionSecret(): string {
  const secret = process.env.KIOSK_SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === "test") {
      return "test-session-secret-must-be-at-least-32-chars-long";
    }
    throw new Error(
      "KIOSK_SESSION_SECRET must be configured with at least 32 characters.",
    );
  }
  return secret.trim();
}

/**
 * Generates a high-entropy, human-friendly 6-character pairing code.
 */
export function generatePairingCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += PAIRING_CHARSET[bytes[i] % PAIRING_CHARSET.length];
  }
  return code;
}

/**
 * Cryptographically hashes pairing code with SHA-256 for database storage and comparison.
 */
export function hashPairingCode(code: string): string {
  const normalized = normalizePairingCode(code);
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generates a 256-bit cryptographically secure random bearer token for paired devices.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Cryptographically hashes device token with SHA-256 for database storage and comparison.
 */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Generates a 256-bit cryptographically secure random opaque session token.
 */
export function generateSessionToken(): string {
  return `kiosk_sess_${randomBytes(32).toString("hex")}`;
}

/**
 * Cryptographically hashes an opaque session token with SHA-256 for database lookup.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Signs an opaque session token with HMAC-SHA256 using the session secret.
 * Returns `${token}.${signature}`.
 */
export function signSessionToken(token: string): string {
  const secret = getKioskSessionSecret();
  const signature = createHmac("sha256", secret)
    .update(`kiosk-session:${token.trim()}`)
    .digest("base64url");
  return `${token.trim()}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token.
 * Returns the raw token if valid; returns null if tampered or malformed.
 */
export function verifySessionToken(signedToken: string): string | null {
  try {
    const parts = signedToken.split(".");
    if (parts.length !== 2) return null;
    const [token, signature] = parts;
    const secret = getKioskSessionSecret();
    const expectedSignature = createHmac("sha256", secret)
      .update(`kiosk-session:${token}`)
      .digest("base64url");

    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Derives a 32-byte encryption key from the session secret using SHA-256.
 */
function deriveEncryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a sensitive string (e.g. Supabase employee access token) using AES-256-GCM.
 * Output format: `ivHex:authTagHex:encryptedHex`.
 */
export function encryptAccessToken(
  accessToken: string,
  secret: string = getKioskSessionSecret(),
): string {
  const key = deriveEncryptionKey(secret);
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM encrypted access token string.
 * Returns null if decryption or authentication fails.
 */
export function decryptAccessToken(
  ciphertext: string,
  secret: string = getKioskSessionSecret(),
): string | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key = deriveEncryptionKey(secret);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const encryptedData = Buffer.from(dataHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
