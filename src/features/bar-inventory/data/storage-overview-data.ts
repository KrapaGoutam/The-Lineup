import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import type {
  BranchStorageOverview,
  StorageAreaView,
  StoragePlacementView,
  StorageShelfView,
  StockView,
} from "../domain/inventory-types";
import {
  readAll,
  STOCK_COLUMNS,
  STORAGE_AREA_COLUMNS,
  STORAGE_PLACEMENT_COLUMNS,
  STORAGE_SHELF_COLUMNS,
  type StockRow,
  type StorageAreaRow,
  type StoragePlacementRow,
  type StorageShelfRow,
} from "./catalog-data";

type LocationRow = {
  id: string;
  name: string;
  active: boolean;
  archived_at: string | null;
};

type AuthorizedArgs =
  Database["public"]["Functions"]["inventory_location_authorized"]["Args"];

/**
 * Read-only storage layout + stock for EVERY branch the caller may manage.
 *
 * This is deliberately NOT `getCatalogSnapshot(org, null)`: that function (and
 * every write path) is bound to exactly one server-verified branch. Here each
 * candidate branch is individually proven with the database's own authority
 * check (live session + manager level at that branch) and the Bar Inventory
 * module gate, and only the branches that pass are ever queried. Row Level
 * Security applies again underneath, so an unauthorized branch's rows cannot
 * reach this function even if a branch id were forged.
 *
 * Stock is returned per branch (`stock` is keyed by that branch's own row), so
 * the same product in two branches never mixes quantities.
 */
export async function getBranchStorageOverview(
  organizationId: string,
  activeLocationId: string,
  /**
   * Whether Bar Inventory is enabled for a branch. Supplied by the Server Action
   * (only Server Actions may import the module-enforcement entry).
   */
  moduleAllowed: (locationId: string) => Promise<boolean>,
): Promise<BranchStorageOverview | null> {
  const supabase = await createClient();

  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, name, active, archived_at")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .overrideTypes<LocationRow[], { merge: false }>();
  if (locError || !locations) {
    console.error("getBranchStorageOverview: locations", locError);
    return null;
  }

  // 1. Per-branch authority: the database decides, never a client-supplied id.
  const verdicts = await Promise.all(
    locations.map(async (location) => {
      const args = {
        p_organization_id: organizationId,
        p_location_id: location.id,
      } satisfies AuthorizedArgs;
      const authorized = await supabase.rpc(
        "inventory_location_authorized",
        args,
      );
      if (authorized.error || authorized.data !== true) return null;
      // 2. Module gate per branch (a disabled branch is not listed at all).
      return (await moduleAllowed(location.id)) ? location : null;
    }),
  );
  const allowed = verdicts.filter((l): l is LocationRow => l !== null);
  if (allowed.length === 0) {
    return { branches: [], activeLocationId };
  }
  const ids = allowed.map((l) => l.id);

  const [areas, shelves, placements, stock] = await Promise.all([
    readAll<StorageAreaRow>(
      supabase,
      "inventory_storage_areas",
      STORAGE_AREA_COLUMNS,
      organizationId,
      { orderBy: "display_order", locationIds: ids },
    ),
    readAll<StorageShelfRow>(
      supabase,
      "inventory_storage_shelves",
      STORAGE_SHELF_COLUMNS,
      organizationId,
      { orderBy: "display_order", locationIds: ids },
    ),
    readAll<StoragePlacementRow>(
      supabase,
      "inventory_storage_placements",
      STORAGE_PLACEMENT_COLUMNS,
      organizationId,
      { orderBy: "display_order", locationIds: ids },
    ),
    readAll<StockRow & { location_id: string }>(
      supabase,
      "inventory_stock",
      `location_id, ${STOCK_COLUMNS}`,
      organizationId,
      { orderBy: "product_id", locationIds: ids },
    ),
  ]);
  if (!areas || !shelves || !placements || !stock) return null;

  const allowedIds = new Set(ids);
  const branches = allowed.map((location) => {
    const mine = <T extends { location_id: string }>(rows: T[]) =>
      rows.filter(
        (r) => r.location_id === location.id && allowedIds.has(r.location_id),
      );
    return {
      locationId: location.id,
      locationName: location.name,
      areas: mine(areas).map(
        (row): StorageAreaView => ({
          id: row.id,
          locationId: row.location_id,
          name: row.name,
          kind: row.kind,
          displayOrder: row.display_order,
          active: row.active,
          version: row.version,
          updatedAt: row.updated_at,
          updatedByName: null,
        }),
      ),
      shelves: mine(shelves).map(
        (row): StorageShelfView => ({
          id: row.id,
          locationId: row.location_id,
          storageAreaId: row.storage_area_id,
          name: row.name,
          sectionName: row.section_name,
          displayOrder: row.display_order,
          version: row.version,
          updatedAt: row.updated_at,
          updatedByName: null,
        }),
      ),
      placements: mine(placements).map(
        (row): StoragePlacementView => ({
          id: row.id,
          locationId: row.location_id,
          storageAreaId: row.storage_area_id,
          shelfId: row.shelf_id,
          productId: row.product_id,
          slotNumber: row.slot_number,
          slotLabel: row.slot_label,
          displayOrder: row.display_order,
          version: row.version,
          updatedAt: row.updated_at,
          updatedByName: null,
        }),
      ),
      stock: mine(stock).map(
        (row): StockView => ({
          productId: row.product_id,
          onHand: Number(row.on_hand),
          backup: Number(row.backup),
          cutoff: row.cutoff === null ? null : Number(row.cutoff),
          warning: row.warning === null ? null : Number(row.warning),
          par: row.par === null ? null : Number(row.par),
          version: row.version,
          updatedAt: row.updated_at,
          updatedByName: null,
          lastAdjustedAt: row.last_adjusted_at,
        }),
      ),
    };
  });

  return { branches, activeLocationId };
}
