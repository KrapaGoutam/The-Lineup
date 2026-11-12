import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  normalizePairingCode,
  type KioskActiveContext,
  type KioskDevice,
  type KioskPairingResult,
} from "../domain/kiosk-device";
import {
  generateDeviceToken,
  generatePairingCode,
  hashDeviceToken,
  hashPairingCode,
} from "./kiosk-crypto";

export type KioskResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code?: string };

/**
 * Lists all registered kiosk devices for a location (active and revoked).
 */
export async function listKioskDevicesForLocation(
  supabase: SupabaseClient<Database>,
  locationId: string,
): Promise<KioskResult<readonly KioskDevice[]>> {
  try {
    const { data, error } = await supabase
      .from("kiosk_devices")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listKioskDevicesForLocation error", error);
      return {
        ok: false,
        error: error.message || "Failed to load kiosk devices.",
      };
    }

    const devices: KioskDevice[] = (data || []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      locationId: row.location_id,
      name: row.name,
      status: row.status as "active" | "revoked",
      credentialVersion: row.credential_version,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
      revokedBy: row.revoked_by,
      revocationReason: row.revocation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { ok: true, data: devices };
  } catch (err: unknown) {
    console.error("listKioskDevicesForLocation unexpected error", err);
    return { ok: false, error: "Unexpected error loading kiosk devices." };
  }
}

/**
 * Generates a short-lived one-time pairing code for adding a physical station kiosk tablet.
 */
export async function createKioskPairingCode(
  supabase: SupabaseClient<Database>,
  params: { readonly locationId: string; readonly deviceName: string },
): Promise<KioskResult<KioskPairingResult>> {
  try {
    const rawCode = generatePairingCode();
    const codeHash = hashPairingCode(rawCode);

    const { data, error } = await supabase.rpc("kiosk_generate_pairing_code", {
      p_location_id: params.locationId,
      p_device_name: params.deviceName.trim(),
      p_code_hash: codeHash,
    });

    if (error) {
      console.error("createKioskPairingCode error", error);
      if (error.code === "42501") {
        return {
          ok: false,
          error: "Unauthorized to register kiosk devices.",
          code: "UNAUTHORIZED",
        };
      }
      return {
        ok: false,
        error: error.message || "Failed to generate pairing code.",
      };
    }

    const raw = (data ?? {}) as Record<string, unknown>;
    const pairingId = String(raw.pairingId ?? raw.pairing_id ?? "");
    const locationId = String(
      raw.locationId ?? raw.location_id ?? params.locationId,
    );
    const organizationId = String(
      raw.organizationId ?? raw.organization_id ?? "",
    );
    const deviceName = String(
      raw.deviceName ?? raw.device_name ?? params.deviceName,
    );
    const expiresAt = String(
      raw.expiresAt ??
        raw.expires_at ??
        new Date(Date.now() + 15 * 60_000).toISOString(),
    );

    return {
      ok: true,
      data: {
        pairingId,
        locationId,
        organizationId,
        deviceName,
        pairingCode: rawCode,
        expiresAt,
      },
    };
  } catch (err: unknown) {
    console.error("createKioskPairingCode unexpected error", err);
    return { ok: false, error: "Unexpected error generating pairing code." };
  }
}

/**
 * Atomically consumes a pairing code and provisions the kiosk device record.
 * Returns the generated device bearer token to be stored in an HttpOnly cookie.
 */
export async function consumeKioskPairingCode(
  supabase: SupabaseClient<Database>,
  params: {
    readonly pairingCode: string;
    readonly clientIdentifier?: string;
  },
): Promise<
  KioskResult<{ readonly token: string; readonly context: KioskActiveContext }>
> {
  try {
    const normalized = normalizePairingCode(params.pairingCode);
    const codeHash = hashPairingCode(normalized);
    const token = generateDeviceToken();
    const tokenHash = hashDeviceToken(token);
    const clientIdentifier = params.clientIdentifier ?? "tablet-pairing-client";

    const { data, error } = await supabase.rpc("kiosk_consume_pairing_code", {
      p_code_hash: codeHash,
      p_device_token_hash: tokenHash,
      p_client_identifier: clientIdentifier,
    });

    if (error) {
      console.error("consumeKioskPairingCode error", error);
      // Atomic attempt accounting on failed consumption
      try {
        await supabase.rpc("kiosk_record_pairing_failure", {
          p_code_hash: codeHash,
          p_client_identifier: clientIdentifier,
        });
      } catch (recErr: unknown) {
        console.error("kiosk_record_pairing_failure error", recErr);
      }

      if (error.code === "P0002") {
        return {
          ok: false,
          error: "Pairing code not recognized. Check the code and try again.",
          code: "NOT_FOUND",
        };
      }
      if (error.code === "22023") {
        return {
          ok: false,
          error: error.message || "Pairing code expired or already used.",
          code: "INVALID_CODE",
        };
      }
      return {
        ok: false,
        error: error.message || "Failed to pair device.",
        code: "PAIRING_FAILED",
      };
    }

    const raw = (data ?? {}) as Record<string, unknown>;
    if (raw.success === false) {
      const errorMsg = String(raw.error || "Failed to pair device.");
      const errorCode = String(raw.code || "PAIRING_FAILED");
      return {
        ok: false,
        error: errorMsg,
        code: errorCode,
      };
    }

    const deviceId = String(raw.deviceId ?? raw.device_id ?? raw.id ?? "");
    const deviceName = String(
      raw.deviceName ?? raw.device_name ?? raw.name ?? "",
    );
    const organizationId = String(
      raw.organizationId ?? raw.organization_id ?? "",
    );
    const organizationName = String(
      raw.organizationName ?? raw.organization_name ?? "",
    );
    const organizationSlug = String(
      raw.organizationSlug ?? raw.organization_slug ?? "",
    );
    const locationId = String(raw.locationId ?? raw.location_id ?? "");
    const locationName = String(raw.locationName ?? raw.location_name ?? "");
    const timeZone = String(raw.timeZone ?? raw.time_zone ?? "UTC");

    return {
      ok: true,
      data: {
        token,
        context: {
          deviceId,
          deviceName,
          organizationId,
          organizationName,
          organizationSlug,
          locationId,
          locationName,
          timeZone,
          status: "active",
        },
      },
    };
  } catch (err: unknown) {
    console.error("consumeKioskPairingCode unexpected error", err);
    return { ok: false, error: "Unexpected error pairing device." };
  }
}

/**
 * Looks up active kiosk device context from a bearer token.
 */
export async function getKioskDeviceByToken(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<KioskResult<KioskActiveContext | null>> {
  try {
    if (!token || token.length < 32) return { ok: true, data: null };
    const tokenHash = hashDeviceToken(token);

    const { data: device, error } = await supabase
      .from("kiosk_devices")
      .select(
        `
        id,
        name,
        status,
        organization_id,
        location_id,
        organizations ( id, name, slug ),
        locations ( id, name, time_zone, active, archived_at )
      `,
      )
      .eq("device_token_hash", tokenHash)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.error("getKioskDeviceByToken error", error);
      return { ok: false, error: error.message || "Failed to look up device." };
    }

    if (!device) return { ok: true, data: null };

    const loc = device.locations as unknown as {
      id: string;
      name: string;
      time_zone: string;
      active: boolean;
      archived_at: string | null;
    } | null;

    const org = device.organizations as unknown as {
      id: string;
      name: string;
      slug: string;
    } | null;

    if (!loc || !org || !loc.active || loc.archived_at) {
      return { ok: true, data: null };
    }

    // Fire and forget last_seen_at update
    supabase
      .from("kiosk_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id)
      .then(() => {});

    return {
      ok: true,
      data: {
        deviceId: device.id,
        deviceName: device.name,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        locationId: loc.id,
        locationName: loc.name,
        timeZone: loc.time_zone,
        status: "active",
      },
    };
  } catch (err: unknown) {
    console.error("getKioskDeviceByToken unexpected error", err);
    return { ok: false, error: "Unexpected error verifying device." };
  }
}

/**
 * Renames a kiosk device (Manager only).
 */
export async function renameKioskDevice(
  supabase: SupabaseClient<Database>,
  params: { readonly deviceId: string; readonly name: string },
): Promise<KioskResult<{ readonly deviceId: string; readonly name: string }>> {
  try {
    const { data, error } = await supabase.rpc("kiosk_rename_device", {
      p_device_id: params.deviceId,
      p_name: params.name.trim(),
    });

    if (error) {
      console.error("renameKioskDevice error", error);
      if (error.code === "42501") {
        return {
          ok: false,
          error: "Unauthorized to manage this device.",
          code: "UNAUTHORIZED",
        };
      }
      return { ok: false, error: error.message || "Failed to rename device." };
    }

    const raw = (data ?? {}) as Record<string, unknown>;
    const deviceId = String(
      raw.deviceId ?? raw.device_id ?? raw.id ?? params.deviceId,
    );
    const name = String(raw.name ?? params.name);
    return { ok: true, data: { deviceId, name } };
  } catch (err: unknown) {
    console.error("renameKioskDevice unexpected error", err);
    return { ok: false, error: "Unexpected error renaming device." };
  }
}

/**
 * Reassigns a kiosk device to a new location in the organization (Manager only).
 */
export async function reassignKioskDevice(
  supabase: SupabaseClient<Database>,
  params: { readonly deviceId: string; readonly newLocationId: string },
): Promise<
  KioskResult<{ readonly deviceId: string; readonly locationId: string }>
> {
  try {
    const { data, error } = await supabase.rpc("kiosk_reassign_device", {
      p_device_id: params.deviceId,
      p_new_location_id: params.newLocationId,
    });

    if (error) {
      console.error("reassignKioskDevice error", error);
      if (error.code === "42501") {
        return {
          ok: false,
          error: "Unauthorized to reassign this device.",
          code: "UNAUTHORIZED",
        };
      }
      return {
        ok: false,
        error: error.message || "Failed to reassign device.",
      };
    }

    const raw = (data ?? {}) as Record<string, unknown>;
    const deviceId = String(
      raw.deviceId ?? raw.device_id ?? raw.id ?? params.deviceId,
    );
    const locationId = String(
      raw.locationId ?? raw.location_id ?? params.newLocationId,
    );
    return { ok: true, data: { deviceId, locationId } };
  } catch (err: unknown) {
    console.error("reassignKioskDevice unexpected error", err);
    return { ok: false, error: "Unexpected error reassigning device." };
  }
}

/**
 * Revokes a kiosk device's active credentials (Manager only).
 */
export async function revokeKioskDevice(
  supabase: SupabaseClient<Database>,
  params: { readonly deviceId: string; readonly reason?: string },
): Promise<
  KioskResult<{ readonly deviceId: string; readonly status: "revoked" }>
> {
  try {
    const { data, error } = await supabase.rpc("kiosk_revoke_device", {
      p_device_id: params.deviceId,
      p_reason: params.reason?.trim() || undefined,
    });

    if (error) {
      console.error("revokeKioskDevice error", error);
      if (error.code === "42501") {
        return {
          ok: false,
          error: "Unauthorized to revoke this device.",
          code: "UNAUTHORIZED",
        };
      }
      return { ok: false, error: error.message || "Failed to revoke device." };
    }

    const raw = (data ?? {}) as Record<string, unknown>;
    const deviceId = String(
      raw.deviceId ?? raw.device_id ?? raw.id ?? params.deviceId,
    );
    return { ok: true, data: { deviceId, status: "revoked" } };
  } catch (err: unknown) {
    console.error("revokeKioskDevice unexpected error", err);
    return { ok: false, error: "Unexpected error revoking device." };
  }
}
