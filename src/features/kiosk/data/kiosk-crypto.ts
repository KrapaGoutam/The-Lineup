import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { normalizePairingCode } from "../domain/kiosk-device";

// 32-character unambiguous charset avoiding O/0, I/1, L
const PAIRING_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
