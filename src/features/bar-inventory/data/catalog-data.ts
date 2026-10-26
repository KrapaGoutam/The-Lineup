import "server-only";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { createClient } from "@/lib/supabase/server";

import type {
  CatalogSnapshot,
  CategoryView,
  ProductView,
  SubcategoryView,
  UnitType,
  VendorView,
} from "../domain/inventory-types";

// PostgREST caps a response at 1,000 rows; the catalog cap is 5,000 products.
const PAGE = 1000;
const MAX_PAGES = 6;

type Audit = {
  version: number;
  updated_at: string;
  updated_by: string | null;
  created_by: string;
};

type VendorRow = Audit & {
  id: string;
  name: string;
  is_system: boolean;
  active: boolean;
  notes: string | null;
};
type CategoryRow = Audit & { id: string; name: string; active: boolean };
type SubcategoryRow = CategoryRow & { category_id: string };
type ProductRow = Audit & {
  id: string;
  vendor_id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  size: string | null;
  unit_type: UnitType;
  unit_label: string | null;
  sku: string | null;
  notes: string | null;
  active: boolean;
};

const AUDIT = "version, updated_at, updated_by, created_by";
const VENDOR_COLUMNS = `id, name, is_system, active, notes, ${AUDIT}`;
const CATEGORY_COLUMNS = `id, name, active, ${AUDIT}`;
const SUBCATEGORY_COLUMNS = `id, category_id, name, active, ${AUDIT}`;
const PRODUCT_COLUMNS = `id, vendor_id, name, category_id, subcategory_id, size, unit_type, unit_label, sku, notes, active, ${AUDIT}`;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function readAll<T>(
  supabase: Supabase,
  table: string,
  columns: string,
  organizationId: string,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
      .overrideTypes<T[], { merge: false }>();
    if (error || !data) {
      console.error(`getCatalogSnapshot: ${table}`, error);
      return null;
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * The authoritative catalog read for one manager. RLS (not this function)
 * decides what comes back: staff and other tenants get nothing. Makes sure
 * the system "Unassigned" vendor exists first (idempotent).
 */
export async function getCatalogSnapshot(
  organizationId: string,
): Promise<CatalogSnapshot | null> {
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;
  const supabase = await createClient();

  const boot = await supabase.rpc("inventory_bootstrap", {
    p_organization_id: organizationId,
    p_location_id: location.id,
  });
  if (boot.error) {
    console.error("getCatalogSnapshot: inventory_bootstrap", boot.error);
    return null;
  }

  const [vendors, categories, subcategories, products, roster] =
    await Promise.all([
      readAll<VendorRow>(
        supabase,
        "inventory_vendors",
        VENDOR_COLUMNS,
        organizationId,
      ),
      readAll<CategoryRow>(
        supabase,
        "inventory_categories",
        CATEGORY_COLUMNS,
        organizationId,
      ),
      readAll<SubcategoryRow>(
        supabase,
        "inventory_subcategories",
        SUBCATEGORY_COLUMNS,
        organizationId,
      ),
      readAll<ProductRow>(
        supabase,
        "inventory_products",
        PRODUCT_COLUMNS,
        organizationId,
      ),
      getOrganizationRoster(organizationId),
    ]);
  if (!vendors || !categories || !subcategories || !products) return null;

  const names = new Map(roster.map((member) => [member.id, member.name]));
  const audit = (row: Audit) => ({
    version: row.version,
    updatedAt: row.updated_at,
    updatedByName: names.get(row.updated_by ?? row.created_by) ?? null,
  });

  return {
    vendors: vendors.map(
      (row): VendorView => ({
        id: row.id,
        name: row.name,
        isSystem: row.is_system,
        active: row.active,
        notes: row.notes,
        ...audit(row),
      }),
    ),
    categories: categories.map(
      (row): CategoryView => ({
        id: row.id,
        name: row.name,
        active: row.active,
        ...audit(row),
      }),
    ),
    subcategories: subcategories.map(
      (row): SubcategoryView => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        active: row.active,
        ...audit(row),
      }),
    ),
    products: products.map(
      (row): ProductView => ({
        id: row.id,
        vendorId: row.vendor_id,
        name: row.name,
        categoryId: row.category_id,
        subcategoryId: row.subcategory_id,
        size: row.size,
        unitType: row.unit_type,
        unitLabel: row.unit_label,
        sku: row.sku,
        notes: row.notes,
        active: row.active,
        ...audit(row),
      }),
    ),
    loadedAt: new Date().toISOString(),
  };
}
