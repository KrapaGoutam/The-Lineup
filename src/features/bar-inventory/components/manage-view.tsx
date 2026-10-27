"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBusinessDate } from "@/lib/date-time";

import type { CatalogCommand } from "../domain/catalog-commands";
import {
  unitDisplay,
  type CatalogSnapshot,
  type CategoryView,
  type ProductView,
  type SubcategoryView,
  type VendorView,
} from "../domain/inventory-types";
import {
  CategoryDialog,
  ProductDialog,
  SubcategoryDialog,
  VendorDialog,
  type RunCatalogCommand,
} from "./catalog-dialogs";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { ImportView, type ImportApi } from "./import-view";

type Section = "products" | "vendors" | "categories" | "import";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "vendors", label: "Vendors" },
  { id: "categories", label: "Categories" },
  { id: "import", label: "Import" },
];

const statusText = (active: boolean) => (active ? "Active" : "Archived");

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="success">Active</Badge>
  ) : (
    <Badge tone="neutral">Archived</Badge>
  );
}

function ShowArchived({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4"
      />
      Show archived
    </label>
  );
}

type ProductRow = {
  id: string;
  name: string;
  vendor: string;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  unit: string;
  sku: string | null;
  notes: string | null;
  status: string;
  updatedAt: string;
  updatedBy: string | null;
  product: ProductView;
};

type VendorRow = {
  id: string;
  name: string;
  status: string;
  items: number;
  updatedAt: string;
  updatedBy: string | null;
  vendor: VendorView;
};

type CategoryRow = {
  id: string;
  /** The category's own name (also set on its subcategory rows). */
  category: string;
  subcategory: string | null;
  status: string;
  items: number;
  updatedAt: string;
  updatedBy: string | null;
  categoryRef: CategoryView;
  subRef: SubcategoryView | null;
};

export function ManageView({
  snapshot,
  run,
  restaurantSlug,
  timeZone,
  imports,
  onImported,
}: {
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
  restaurantSlug: string;
  timeZone: string;
  imports: ImportApi;
  onImported: () => void;
}) {
  const [section, setSection] = useState<Section>("products");
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [productDialog, setProductDialog] = useState<{
    product: ProductView | null;
  } | null>(null);
  const [vendorDialog, setVendorDialog] = useState<{
    vendor: VendorView | null;
  } | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{
    category: CategoryView | null;
  } | null>(null);
  const [subDialog, setSubDialog] = useState<{
    sub: SubcategoryView | null;
    categoryId: string | null;
  } | null>(null);

  async function act(command: CatalogCommand) {
    setNotice(null);
    const result = await run(command);
    if (!result.ok) setNotice(result.error);
  }

  const productRows = useMemo<ProductRow[]>(() => {
    const vendors = new Map(snapshot.vendors.map((v) => [v.id, v.name]));
    const categories = new Map(snapshot.categories.map((c) => [c.id, c.name]));
    const subs = new Map(snapshot.subcategories.map((s) => [s.id, s.name]));
    return snapshot.products
      .filter((p) => showArchived || p.active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        vendor: vendors.get(p.vendorId) ?? "—",
        category: p.categoryId ? (categories.get(p.categoryId) ?? null) : null,
        subcategory: p.subcategoryId
          ? (subs.get(p.subcategoryId) ?? null)
          : null,
        size: p.size,
        unit: unitDisplay(p.unitType, p.unitLabel),
        sku: p.sku,
        notes: p.notes,
        status: statusText(p.active),
        updatedAt: p.updatedAt,
        updatedBy: p.updatedByName,
        product: p,
      }));
  }, [snapshot, showArchived]);

  const vendorRows = useMemo<VendorRow[]>(() => {
    const counts = new Map<string, number>();
    for (const p of snapshot.products) {
      if (p.active) counts.set(p.vendorId, (counts.get(p.vendorId) ?? 0) + 1);
    }
    return snapshot.vendors
      .filter((v) => showArchived || v.active)
      .map((v) => ({
        id: v.id,
        name: v.name,
        status: statusText(v.active),
        items: counts.get(v.id) ?? 0,
        updatedAt: v.updatedAt,
        updatedBy: v.updatedByName,
        vendor: v,
      }));
  }, [snapshot, showArchived]);

  const categoryRows = useMemo<CategoryRow[]>(() => {
    const rows: CategoryRow[] = [];
    for (const category of snapshot.categories) {
      if (!showArchived && !category.active) continue;
      rows.push({
        id: category.id,
        category: category.name,
        subcategory: null,
        status: statusText(category.active),
        items: snapshot.products.filter(
          (p) => p.active && p.categoryId === category.id,
        ).length,
        updatedAt: category.updatedAt,
        updatedBy: category.updatedByName,
        categoryRef: category,
        subRef: null,
      });
      for (const sub of snapshot.subcategories) {
        if (sub.categoryId !== category.id || (!showArchived && !sub.active))
          continue;
        rows.push({
          id: sub.id,
          category: category.name,
          subcategory: sub.name,
          status: statusText(sub.active),
          items: snapshot.products.filter(
            (p) => p.active && p.subcategoryId === sub.id,
          ).length,
          updatedAt: sub.updatedAt,
          updatedBy: sub.updatedByName,
          categoryRef: category,
          subRef: sub,
        });
      }
    }
    return rows;
  }, [snapshot, showArchived]);

  const when = (iso: string) => formatBusinessDate(iso, timeZone);

  const productColumns = useMemo<TableColumn<ProductRow>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        sortable: true,
        searchable: true,
        get: (r) => r.name,
        render: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        id: "vendor",
        label: "Vendor",
        type: "select",
        sortable: true,
        searchable: true,
        get: (r) => r.vendor,
        render: (r) => r.vendor,
      },
      {
        id: "category",
        label: "Category",
        type: "select",
        sortable: true,
        get: (r) => r.category,
        render: (r) => r.category ?? "—",
      },
      {
        id: "subcategory",
        label: "Subcategory",
        type: "select",
        sortable: true,
        get: (r) => r.subcategory,
        render: (r) => r.subcategory ?? "—",
      },
      {
        id: "size",
        label: "Size",
        type: "select",
        sortable: true,
        get: (r) => r.size,
        render: (r) => r.size ?? "—",
      },
      {
        id: "unit",
        label: "Unit",
        type: "select",
        sortable: true,
        get: (r) => r.unit,
        render: (r) => r.unit,
      },
      {
        id: "sku",
        label: "SKU",
        type: "text",
        sortable: true,
        searchable: true,
        get: (r) => r.sku,
        render: (r) => r.sku ?? "—",
      },
      {
        id: "notes",
        label: "Notes",
        type: "text",
        tabletHidden: true,
        get: (r) => r.notes,
        render: (r) => r.notes ?? "—",
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        sortable: true,
        get: (r) => r.status,
        render: (r) => <StatusBadge active={r.product.active} />,
      },
      {
        id: "updated",
        label: "Updated",
        type: "date",
        sortable: true,
        tabletHidden: true,
        get: (r) => r.updatedAt,
        render: (r) => when(r.updatedAt),
      },
      {
        id: "updatedBy",
        label: "Updated by",
        type: "select",
        sortable: true,
        tabletHidden: true,
        get: (r) => r.updatedBy,
        render: (r) => r.updatedBy ?? "—",
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeZone],
  );

  const vendorColumns = useMemo<TableColumn<VendorRow>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        sortable: true,
        searchable: true,
        get: (r) => r.name,
        render: (r) => (
          <span className="font-medium">
            {r.name}
            {r.vendor.isSystem ? (
              <Badge tone="accent" className="ml-2">
                System
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        sortable: true,
        get: (r) => r.status,
        render: (r) => <StatusBadge active={r.vendor.active} />,
      },
      {
        id: "items",
        label: "Items",
        type: "number",
        sortable: true,
        align: "right",
        get: (r) => r.items,
        render: (r) => r.items,
      },
      {
        id: "updated",
        label: "Last updated",
        type: "date",
        sortable: true,
        get: (r) => r.updatedAt,
        render: (r) => when(r.updatedAt),
      },
      {
        id: "updatedBy",
        label: "Updated by",
        type: "select",
        sortable: true,
        get: (r) => r.updatedBy,
        render: (r) => r.updatedBy ?? "—",
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeZone],
  );

  const categoryColumns = useMemo<TableColumn<CategoryRow>[]>(
    () => [
      {
        id: "category",
        label: "Category",
        type: "select",
        sortable: true,
        searchable: true,
        get: (r) => r.category,
        render: (r) => (
          <span className={r.subRef ? "text-muted-foreground" : "font-medium"}>
            {r.category}
          </span>
        ),
      },
      {
        id: "subcategory",
        label: "Subcategory",
        type: "select",
        sortable: true,
        searchable: true,
        get: (r) => r.subcategory,
        render: (r) => (r.subcategory ? `↳ ${r.subcategory}` : "—"),
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        sortable: true,
        get: (r) => r.status,
        render: (r) => (
          <StatusBadge
            active={r.subRef ? r.subRef.active : r.categoryRef.active}
          />
        ),
      },
      {
        id: "items",
        label: "Items",
        type: "number",
        sortable: true,
        align: "right",
        get: (r) => r.items,
        render: (r) => r.items,
      },
      {
        id: "updated",
        label: "Updated",
        type: "date",
        sortable: true,
        get: (r) => r.updatedAt,
        render: (r) => when(r.updatedAt),
      },
      {
        id: "updatedBy",
        label: "Updated by",
        type: "select",
        sortable: true,
        get: (r) => r.updatedBy,
        render: (r) => r.updatedBy ?? "—",
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeZone],
  );

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Manage"
          className="border-border bg-muted/30 flex w-full max-w-full gap-1 overflow-x-auto rounded-lg border p-1 sm:w-fit"
        >
          {SECTIONS.map(({ id, label }) => (
            <Button
              key={id}
              role="tab"
              aria-selected={section === id}
              variant={section === id ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0"
              onClick={() => setSection(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <ShowArchived checked={showArchived} onChange={setShowArchived} />
      </div>

      {notice ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      ) : null}

      {section === "products" ? (
        <section aria-label="Products" className="flex min-w-0 flex-col gap-3">
          <div className="flex justify-end">
            <Button onClick={() => setProductDialog({ product: null })}>
              Add product
            </Button>
          </div>
          <FilterableTable<ProductRow>
            tableKey="prod"
            restaurantSlug={restaurantSlug}
            label="Products"
            rows={productRows}
            columns={productColumns}
            getRowId={(r) => r.id}
            timeZone={timeZone}
            defaultSort={[{ id: "name", dir: "asc" }]}
            emptyMessage={
              showArchived
                ? "No products yet."
                : "No active products yet. Add your first product (a spreadsheet import arrives in a later step)."
            }
            emptyAction={
              <Button onClick={() => setProductDialog({ product: null })}>
                Add product
              </Button>
            }
            rowActions={(row) => (
              <div className="flex gap-1">
                {row.product.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${row.name}`}
                    onClick={() => setProductDialog({ product: row.product })}
                  >
                    Edit
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${row.product.active ? "Archive" : "Reactivate"} ${row.name}`}
                  onClick={() =>
                    void act({
                      type: "productSetActive",
                      id: row.product.id,
                      active: !row.product.active,
                      expectedVersion: row.product.version,
                    })
                  }
                >
                  {row.product.active ? "Archive" : "Reactivate"}
                </Button>
              </div>
            )}
          />
        </section>
      ) : null}

      {section === "vendors" ? (
        <section aria-label="Vendors" className="flex min-w-0 flex-col gap-3">
          <div className="flex justify-end">
            <Button onClick={() => setVendorDialog({ vendor: null })}>
              Add vendor
            </Button>
          </div>
          <FilterableTable<VendorRow>
            tableKey="vend"
            restaurantSlug={restaurantSlug}
            label="Vendors"
            rows={vendorRows}
            columns={vendorColumns}
            getRowId={(r) => r.id}
            timeZone={timeZone}
            defaultSort={[{ id: "name", dir: "asc" }]}
            emptyMessage="No vendors yet."
            emptyAction={
              <Button onClick={() => setVendorDialog({ vendor: null })}>
                Add vendor
              </Button>
            }
            rowActions={(row) =>
              row.vendor.isSystem ? (
                <span className="text-muted-foreground text-xs">Read-only</span>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Rename ${row.name}`}
                    onClick={() => setVendorDialog({ vendor: row.vendor })}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${row.vendor.active ? "Deactivate" : "Reactivate"} ${row.name}`}
                    onClick={() =>
                      void act({
                        type: "vendorSetActive",
                        id: row.vendor.id,
                        active: !row.vendor.active,
                        expectedVersion: row.vendor.version,
                      })
                    }
                  >
                    {row.vendor.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              )
            }
          />
        </section>
      ) : null}

      {section === "import" ? (
        <ImportView api={imports} timeZone={timeZone} onImported={onImported} />
      ) : null}

      {section === "categories" ? (
        <section
          aria-label="Categories"
          className="flex min-w-0 flex-col gap-3"
        >
          <div className="flex justify-end">
            <Button onClick={() => setCategoryDialog({ category: null })}>
              Add category
            </Button>
          </div>
          <FilterableTable<CategoryRow>
            tableKey="cat"
            restaurantSlug={restaurantSlug}
            label="Categories"
            rows={categoryRows}
            columns={categoryColumns}
            getRowId={(r) => r.id}
            timeZone={timeZone}
            emptyMessage="No categories yet. Categories and subcategories are optional; they help you filter products."
            emptyAction={
              <Button onClick={() => setCategoryDialog({ category: null })}>
                Add category
              </Button>
            }
            rowActions={(row) =>
              row.subRef ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${row.subRef.name} under ${row.category}`}
                    onClick={() =>
                      setSubDialog({
                        sub: row.subRef,
                        categoryId: row.subRef!.categoryId,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${row.subRef.active ? "Archive" : "Reactivate"} ${row.subRef.name}`}
                    onClick={() =>
                      void act({
                        type: "subcategorySetActive",
                        id: row.subRef!.id,
                        active: !row.subRef!.active,
                        expectedVersion: row.subRef!.version,
                      })
                    }
                  >
                    {row.subRef.active ? "Archive" : "Reactivate"}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Rename ${row.category}`}
                    onClick={() =>
                      setCategoryDialog({ category: row.categoryRef })
                    }
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Add subcategory to ${row.category}`}
                    disabled={!row.categoryRef.active}
                    onClick={() =>
                      setSubDialog({
                        sub: null,
                        categoryId: row.categoryRef.id,
                      })
                    }
                  >
                    Add subcategory
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${row.categoryRef.active ? "Archive" : "Reactivate"} ${row.category}`}
                    onClick={() =>
                      void act({
                        type: "categorySetActive",
                        id: row.categoryRef.id,
                        active: !row.categoryRef.active,
                        expectedVersion: row.categoryRef.version,
                      })
                    }
                  >
                    {row.categoryRef.active ? "Archive" : "Reactivate"}
                  </Button>
                </div>
              )
            }
          />
        </section>
      ) : null}

      <ProductDialog
        open={productDialog !== null}
        product={productDialog?.product ?? null}
        snapshot={snapshot}
        run={run}
        onClose={() => setProductDialog(null)}
      />
      <VendorDialog
        open={vendorDialog !== null}
        vendor={vendorDialog?.vendor ?? null}
        run={run}
        onClose={() => setVendorDialog(null)}
      />
      <CategoryDialog
        open={categoryDialog !== null}
        category={categoryDialog?.category ?? null}
        run={run}
        onClose={() => setCategoryDialog(null)}
      />
      <SubcategoryDialog
        open={subDialog !== null}
        subcategory={subDialog?.sub ?? null}
        defaultCategoryId={subDialog?.categoryId ?? null}
        categories={snapshot.categories}
        run={run}
        onClose={() => setSubDialog(null)}
      />
    </div>
  );
}
