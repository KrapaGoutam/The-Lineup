export type KioskDeviceStatus = "active" | "revoked";

export interface KioskDevice {
  readonly id: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly name: string;
  readonly status: KioskDeviceStatus;
  readonly credentialVersion: number;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  readonly revocationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KioskPairingResult {
  readonly pairingId: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly deviceName: string;
  readonly pairingCode: string;
  readonly expiresAt: string;
}

export interface KioskActiveContext {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly timeZone: string;
  readonly status: KioskDeviceStatus;
}

/**
 * Normalizes pairing code by stripping hyphens/whitespace and converting to uppercase.
 */
export function normalizePairingCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Validates that the input looks like a valid 6-character alphanumeric pairing code.
 */
export function isValidPairingCodeFormat(code: string): boolean {
  const normalized = normalizePairingCode(code);
  return /^[A-Z0-9]{6}$/.test(normalized);
}

/**
 * Formats pairing code with a center hyphen for readability: "K9X-2M4".
 */
export function formatPairingCode(code: string): string {
  const normalized = normalizePairingCode(code);
  if (normalized.length !== 6) return code;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}
