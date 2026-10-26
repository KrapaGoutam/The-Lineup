"use server";

import { z } from "zod";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

import { getCatalogSnapshot } from "../data/catalog-data";
import {
  catalogCommandSchema,
  type CatalogCommand,
} from "../domain/catalog-commands";
import {
  isInventoryManager,
  type CatalogConflict,
  type CatalogSnapshot,
} from "../domain/inventory-types";

export type InventoryActionResult =
  | { ok: true; data: CatalogSnapshot }
  | {
      ok: false;
      error: string;
      conflict?: CatalogConflict;
      sessionInvalid?: true;
    };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type Supabase = Awaited<ReturnType<typeof createClient>>;
type RpcError = { message?: string; code?: string; details?: string | null };

/** Every failure the database raises is already a plain-language sentence. */
function friendly(message: string | undefined): string {
  return message && message.length < 200
    ? message
    : "That didn't work. Please try again.";
}

/** PT409 stale and 23505 duplicate carry a JSON `details` the UI can act on. */
function conflictFrom(error: RpcError): CatalogConflict | undefined {
  if ((error.code !== "PT409" && error.code !== "23505") || !error.details) {
    return undefined;
  }
  try {
    const detail = JSON.parse(error.details) as Record<string, unknown>;
    if (detail.kind === "stale") {
      return {
        kind: "stale",
        entity: String(detail.entity ?? ""),
        id: String(detail.id ?? ""),
        currentVersion: Number(detail.current_version ?? 0),
        updatedBy:
          typeof detail.updated_by === "string" ? detail.updated_by : null,
        updatedAt:
          typeof detail.updated_at === "string" ? detail.updated_at : null,
      };
    }
    if (detail.kind === "duplicate") {
      return {
        kind: "duplicate",
        entity: String(detail.entity ?? ""),
        field: String(detail.field ?? ""),
        existingId:
          typeof detail.existing_id === "string" ? detail.existing_id : null,
        existingLabel:
          typeof detail.existing_label === "string"
            ? detail.existing_label
            : null,
      };
    }
  } catch {
    // Not JSON: fall through to the plain message.
  }
  return undefined;
}

type CommandArgs = { p_organization_id: string; p_location_id: string };

async function runCommand(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
  command: CatalogCommand,
): Promise<RpcError | null> {
  const base: CommandArgs = {
    p_organization_id: organizationId,
    p_location_id: locationId,
  };
  // PostgREST needs every named argument: always send explicit nulls.
  switch (command.type) {
    case "vendorCreate":
      return (
        await supabase.rpc("inventory_vendor_create", {
          ...base,
          p_name: command.name,
          p_notes: command.notes,
        })
      ).error;
    case "vendorUpdate":
      return (
        await supabase.rpc("inventory_vendor_update", {
          ...base,
          p_vendor_id: command.id,
          p_name: command.name,
          p_notes: command.notes,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "vendorSetActive":
      return (
        await supabase.rpc("inventory_vendor_set_active", {
          ...base,
          p_vendor_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "categoryCreate":
      return (
        await supabase.rpc("inventory_category_create", {
          ...base,
          p_name: command.name,
        })
      ).error;
    case "categoryUpdate":
      return (
        await supabase.rpc("inventory_category_update", {
          ...base,
          p_category_id: command.id,
          p_name: command.name,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "categorySetActive":
      return (
        await supabase.rpc("inventory_category_set_active", {
          ...base,
          p_category_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "subcategoryCreate":
      return (
        await supabase.rpc("inventory_subcategory_create", {
          ...base,
          p_category_id: command.categoryId,
          p_name: command.name,
        })
      ).error;
    case "subcategoryUpdate":
      return (
        await supabase.rpc("inventory_subcategory_update", {
          ...base,
          p_subcategory_id: command.id,
          p_name: command.name,
          p_category_id: command.categoryId,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "subcategorySetActive":
      return (
        await supabase.rpc("inventory_subcategory_set_active", {
          ...base,
          p_subcategory_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    case "productCreate": {
      const i = command.input;
      return (
        await supabase.rpc("inventory_product_create", {
          ...base,
          p_vendor_id: i.vendorId,
          p_name: i.name,
          p_category_id: i.categoryId,
          p_subcategory_id: i.subcategoryId,
          p_size: i.size,
          p_unit_type: i.unitType,
          p_unit_label: i.unitLabel,
          p_sku: i.sku,
          p_notes: i.notes,
        })
      ).error;
    }
    case "productUpdate": {
      const i = command.input;
      return (
        await supabase.rpc("inventory_product_update", {
          ...base,
          p_product_id: command.id,
          p_vendor_id: i.vendorId,
          p_name: i.name,
          p_category_id: i.categoryId,
          p_subcategory_id: i.subcategoryId,
          p_size: i.size,
          p_unit_type: i.unitType,
          p_unit_label: i.unitLabel,
          p_sku: i.sku,
          p_notes: i.notes,
          p_expected_version: command.expectedVersion,
        })
      ).error;
    }
    case "productSetActive":
      return (
        await supabase.rpc("inventory_product_set_active", {
          ...base,
          p_product_id: command.id,
          p_active: command.active,
          p_expected_version: command.expectedVersion,
        })
      ).error;
  }
}

async function resolveManager(restaurantSlug: string) {
  const user = await getCurrentUser(restaurantSlug);
  if (!user) {
    return {
      ok: false as const,
      error: "You need to sign in to use Bar Inventory.",
    };
  }
  if (!isInventoryManager(user.designation)) {
    return {
      ok: false as const,
      error: "Bar Inventory is not available for your role.",
    };
  }
  return { ok: true as const, organizationId: user.organizationId };
}

/**
 * Authoritative read. Called on mount, on window focus and after conflicts so
 * a stale screen always recovers from the database (notify-and-refetch).
 */
export async function getCatalogSnapshotAction(input: {
  restaurantSlug: string;
}): Promise<InventoryActionResult> {
  const parsed = z.object({ restaurantSlug: slugSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveManager(parsed.data.restaurantSlug);
  if (!caller.ok) return caller;

  const snapshot = await getCatalogSnapshot(caller.organizationId);
  if (!snapshot)
    return { ok: false, error: "Bar Inventory could not be loaded." };
  return { ok: true, data: snapshot };
}

/**
 * One validated write, then the authoritative snapshot. The client never
 * treats its own optimistic state as truth.
 */
export async function runCatalogCommandAction(input: {
  restaurantSlug: string;
  command: CatalogCommand;
}): Promise<InventoryActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, command: catalogCommandSchema })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That request is invalid.",
    };
  }

  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const caller = await resolveManager(parsed.data.restaurantSlug);
  if (!caller.ok) return caller;

  const location = await getPrimaryLocation(caller.organizationId);
  if (!location) return { ok: false, error: "No location is set up yet." };

  const failure = await runCommand(
    supabase,
    caller.organizationId,
    location.id,
    parsed.data.command,
  );
  if (failure) {
    return {
      ok: false,
      error: friendly(failure.message),
      conflict: conflictFrom(failure),
    };
  }

  const snapshot = await getCatalogSnapshot(caller.organizationId);
  if (!snapshot)
    return { ok: false, error: "Bar Inventory could not be loaded." };
  return { ok: true, data: snapshot };
}
