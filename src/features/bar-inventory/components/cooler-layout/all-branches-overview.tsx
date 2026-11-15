"use client";

import { useMemo } from "react";
import { Boxes, Lock, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import {
  STORAGE_AREA_KIND_LABELS,
  type BranchStorageOverview,
  type BranchStorageView,
  type ProductView,
} from "../../domain/inventory-types";
import { evaluateStock, formatQuantity } from "../../domain/stock-rules";
import { StatusBadge } from "../table-kit/status-badge";

type Props = {
  overview: BranchStorageOverview;
  /** Org-wide catalog (identical in every branch); stock is per branch. */
  products: readonly ProductView[];
  /** Opens the editable single-branch layout for the branch the viewer is in. */
  onEditCurrentBranch: () => void;
};

/**
 * READ-ONLY layout of every branch the viewer may manage, one section per
 * branch. Each tile shows THAT branch's own stock row, so the same product in
 * two branches never shows a blended quantity. Editing is intentionally not
 * offered here: every write needs one verified branch context, which only the
 * single-branch layout has.
 */
export function AllBranchesOverview({
  overview,
  products,
  onEditCurrentBranch,
}: Props) {
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  if (overview.branches.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No branches with Bar Inventory are available to you.
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="all-branches-overview">
      <p className="text-muted-foreground bg-muted/30 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Read-only overview of the {overview.branches.length}{" "}
          {overview.branches.length === 1 ? "branch" : "branches"} you can
          manage. Quantities are each branch&apos;s own; they are never added
          together. To count or edit stock, work in that branch&apos;s own
          layout.
        </span>
      </p>
      {overview.branches.map((branch) => (
        <BranchSection
          key={branch.locationId}
          branch={branch}
          isCurrent={branch.locationId === overview.activeLocationId}
          productById={productById}
          onEditCurrentBranch={onEditCurrentBranch}
        />
      ))}
    </div>
  );
}

function BranchSection({
  branch,
  isCurrent,
  productById,
  onEditCurrentBranch,
}: {
  branch: BranchStorageView;
  isCurrent: boolean;
  productById: ReadonlyMap<string, ProductView>;
  onEditCurrentBranch: () => void;
}) {
  const stockByProduct = useMemo(
    () => new Map(branch.stock.map((s) => [s.productId, s])),
    [branch.stock],
  );
  const activeAreas = branch.areas.filter((a) => a.active);

  return (
    <section
      aria-labelledby={`branch-${branch.locationId}`}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3
          id={`branch-${branch.locationId}`}
          className="flex items-center gap-2 text-base font-semibold"
        >
          <MapPin className="text-primary size-4" aria-hidden="true" />
          {branch.locationName}
          {isCurrent ? <Badge tone="neutral">Current branch</Badge> : null}
        </h3>
        {isCurrent ? (
          <Button variant="outline" size="sm" onClick={onEditCurrentBranch}>
            Edit this branch&apos;s layout
          </Button>
        ) : null}
      </div>

      {activeAreas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No storage areas set up at this branch yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeAreas.map((area) => {
            const shelves = branch.shelves
              .filter((s) => s.storageAreaId === area.id)
              .sort((a, b) => a.displayOrder - b.displayOrder);
            return (
              <Card key={area.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold">{area.name}</h4>
                    <Badge tone="neutral" className="text-xs">
                      {STORAGE_AREA_KIND_LABELS[area.kind]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {shelves.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No shelves.</p>
                  ) : (
                    shelves.map((shelf) => {
                      const items = branch.placements
                        .filter((p) => p.shelfId === shelf.id)
                        .sort((a, b) => a.displayOrder - b.displayOrder);
                      return (
                        <div key={shelf.id} className="rounded-md border p-2">
                          <div className="text-xs font-medium">
                            {shelf.name}
                            {shelf.sectionName ? ` · ${shelf.sectionName}` : ""}
                          </div>
                          {items.length === 0 ? (
                            <p className="text-muted-foreground mt-1 text-xs">
                              Empty
                            </p>
                          ) : (
                            <ul className="mt-1.5 space-y-1">
                              {items.map((placement) => {
                                const product = productById.get(
                                  placement.productId,
                                );
                                if (!product) return null;
                                const stock = stockByProduct.get(product.id);
                                const status = stock
                                  ? evaluateStock({
                                      onHand: stock.onHand,
                                      backup: stock.backup,
                                      cutoff: stock.cutoff,
                                      warning: stock.warning,
                                      par: stock.par,
                                    }).status
                                  : "no_cutoff";
                                return (
                                  <li
                                    key={placement.id}
                                    className="flex items-center justify-between gap-2 text-xs"
                                  >
                                    <span className="min-w-0 truncate">
                                      <Boxes
                                        className="text-muted-foreground mr-1 inline size-3"
                                        aria-hidden="true"
                                      />
                                      {product.name}
                                      {product.size ? ` · ${product.size}` : ""}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1.5">
                                      <span className="font-semibold">
                                        {formatQuantity(stock?.onHand ?? 0)} on
                                        hand
                                      </span>
                                      <StatusBadge status={status} />
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
