"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  unitDisplay,
  type CatalogSnapshot,
  type CategoryView,
  type ProductView,
  type SubcategoryView,
  type VendorView,
} from "../domain/inventory-types";
import type { CatalogCommand } from "../domain/catalog-commands";
import {
  CategoryDialog,
  ProductDialog,
  SubcategoryDialog,
  VendorDialog,
  type RunCatalogCommand,
} from "./catalog-dialogs";

type Section = "products" | "vendors" | "categories";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "vendors", label: "Vendors" },
  { id: "categories", label: "Categories" },
];

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="success">Active</Badge>
  ) : (
    <Badge tone="neutral">Archived</Badge>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold whitespace-nowrap"
    >
      {children}
    </th>
  );
}

const Td = ({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) => (
  <td className={`px-3 py-2 align-middle text-sm ${className}`}>{children}</td>
);

function TableShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border relative w-full max-w-full min-w-0 overflow-x-auto rounded-xl border">
      <table
        aria-label={label}
        className="w-full min-w-[40rem] border-collapse"
      >
        {children}
      </table>
    </div>
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

export function ManageView({
  snapshot,
  run,
}: {
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
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

  const vendorName = useMemo(
    () => new Map(snapshot.vendors.map((vendor) => [vendor.id, vendor.name])),
    [snapshot.vendors],
  );
  const categoryName = useMemo(
    () => new Map(snapshot.categories.map((c) => [c.id, c.name])),
    [snapshot.categories],
  );
  const subName = useMemo(
    () => new Map(snapshot.subcategories.map((s) => [s.id, s.name])),
    [snapshot.subcategories],
  );
  const itemCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of snapshot.products) {
      if (!product.active) continue;
      counts.set(product.vendorId, (counts.get(product.vendorId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.products]);

  async function act(command: CatalogCommand) {
    setNotice(null);
    const result = await run(command);
    if (!result.ok) setNotice(result.error);
  }

  const products = snapshot.products.filter((p) => showArchived || p.active);
  const vendors = snapshot.vendors.filter((v) => showArchived || v.active);
  const categories = snapshot.categories.filter(
    (c) => showArchived || c.active,
  );

  const empty = (text: string, action: string, onAction: () => void) => (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <p className="text-muted-foreground text-sm">{text}</p>
        <Button onClick={onAction}>{action}</Button>
      </CardContent>
    </Card>
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
          {products.length === 0 ? (
            empty(
              showArchived
                ? "No products yet."
                : "No active products yet. Add your first product (a spreadsheet import arrives in a later step).",
              "Add product",
              () => setProductDialog({ product: null }),
            )
          ) : (
            <TableShell label="Products">
              <thead className="bg-muted/40">
                <tr>
                  <Th>Name</Th>
                  <Th>Vendor</Th>
                  <Th>Category</Th>
                  <Th>Size</Th>
                  <Th>Unit</Th>
                  <Th>SKU</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-border border-t">
                    <Td className="font-medium">{product.name}</Td>
                    <Td>{vendorName.get(product.vendorId) ?? "—"}</Td>
                    <Td>
                      {product.categoryId
                        ? [
                            categoryName.get(product.categoryId),
                            product.subcategoryId
                              ? subName.get(product.subcategoryId)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" › ")
                        : "—"}
                    </Td>
                    <Td>{product.size ?? "—"}</Td>
                    <Td>{unitDisplay(product.unitType, product.unitLabel)}</Td>
                    <Td>{product.sku ?? "—"}</Td>
                    <Td>
                      <StatusBadge active={product.active} />
                    </Td>
                    <Td className="text-muted-foreground whitespace-nowrap">
                      {formatWhen(product.updatedAt)}
                      {product.updatedByName
                        ? ` · ${product.updatedByName}`
                        : ""}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex gap-1">
                        {product.active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${product.name}`}
                            onClick={() => setProductDialog({ product })}
                          >
                            Edit
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${product.active ? "Archive" : "Reactivate"} ${product.name}`}
                          onClick={() =>
                            void act({
                              type: "productSetActive",
                              id: product.id,
                              active: !product.active,
                              expectedVersion: product.version,
                            })
                          }
                        >
                          {product.active ? "Archive" : "Reactivate"}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>
      ) : null}

      {section === "vendors" ? (
        <section aria-label="Vendors" className="flex min-w-0 flex-col gap-3">
          <div className="flex justify-end">
            <Button onClick={() => setVendorDialog({ vendor: null })}>
              Add vendor
            </Button>
          </div>
          <TableShell label="Vendors">
            <thead className="bg-muted/40">
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Items</Th>
                <Th>Last updated</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-border border-t">
                  <Td className="font-medium">
                    {vendor.name}
                    {vendor.isSystem ? (
                      <Badge tone="accent" className="ml-2">
                        System
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>
                    <StatusBadge active={vendor.active} />
                  </Td>
                  <Td>{itemCount.get(vendor.id) ?? 0}</Td>
                  <Td className="text-muted-foreground whitespace-nowrap">
                    {formatWhen(vendor.updatedAt)}
                    {vendor.updatedByName ? ` · ${vendor.updatedByName}` : ""}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {vendor.isSystem ? (
                      <span className="text-muted-foreground text-xs">
                        Read-only
                      </span>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${vendor.name}`}
                          onClick={() => setVendorDialog({ vendor })}
                        >
                          Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${vendor.active ? "Deactivate" : "Reactivate"} ${vendor.name}`}
                          onClick={() =>
                            void act({
                              type: "vendorSetActive",
                              id: vendor.id,
                              active: !vendor.active,
                              expectedVersion: vendor.version,
                            })
                          }
                        >
                          {vendor.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </section>
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
          {categories.length === 0 ? (
            empty(
              "No categories yet. Categories and subcategories are optional; they help you filter products.",
              "Add category",
              () => setCategoryDialog({ category: null }),
            )
          ) : (
            <TableShell label="Categories">
              <thead className="bg-muted/40">
                <tr>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Items</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {categories.flatMap((category) => {
                  const subs = snapshot.subcategories.filter(
                    (sub) =>
                      sub.categoryId === category.id &&
                      (showArchived || sub.active),
                  );
                  const count = snapshot.products.filter(
                    (p) => p.active && p.categoryId === category.id,
                  ).length;
                  return [
                    <tr key={category.id} className="border-border border-t">
                      <Td className="font-medium">{category.name}</Td>
                      <Td>
                        <StatusBadge active={category.active} />
                      </Td>
                      <Td>{count}</Td>
                      <Td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Rename ${category.name}`}
                            onClick={() => setCategoryDialog({ category })}
                          >
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Add subcategory to ${category.name}`}
                            disabled={!category.active}
                            onClick={() =>
                              setSubDialog({
                                sub: null,
                                categoryId: category.id,
                              })
                            }
                          >
                            Add subcategory
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${category.active ? "Archive" : "Reactivate"} ${category.name}`}
                            onClick={() =>
                              void act({
                                type: "categorySetActive",
                                id: category.id,
                                active: !category.active,
                                expectedVersion: category.version,
                              })
                            }
                          >
                            {category.active ? "Archive" : "Reactivate"}
                          </Button>
                        </div>
                      </Td>
                    </tr>,
                    ...subs.map((sub) => (
                      <tr
                        key={sub.id}
                        className="border-border bg-muted/20 border-t"
                      >
                        <Td className="pl-8">↳ {sub.name}</Td>
                        <Td>
                          <StatusBadge active={sub.active} />
                        </Td>
                        <Td>
                          {
                            snapshot.products.filter(
                              (p) => p.active && p.subcategoryId === sub.id,
                            ).length
                          }
                        </Td>
                        <Td className="whitespace-nowrap">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${sub.name} under ${category.name}`}
                              onClick={() =>
                                setSubDialog({
                                  sub,
                                  categoryId: sub.categoryId,
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`${sub.active ? "Archive" : "Reactivate"} ${sub.name}`}
                              onClick={() =>
                                void act({
                                  type: "subcategorySetActive",
                                  id: sub.id,
                                  active: !sub.active,
                                  expectedVersion: sub.version,
                                })
                              }
                            >
                              {sub.active ? "Archive" : "Reactivate"}
                            </Button>
                          </div>
                        </Td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </TableShell>
          )}
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
