"use client";

import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { CatalogSnapshot } from "../domain/inventory-types";
import {
  draftableVendors,
  draftTotals,
  formatDraftTime,
  lineLabel,
  type OrderDraftLine,
  type OrderDraftView,
} from "../domain/order-draft-view";
import type { OrderDraftApi } from "../hooks/use-order-drafts";
import { formatQuantity } from "./editable-cell";
import { OrderDraftEditor, type DraftGuard } from "./order-draft-editor";
import { EmptyState, TableSkeleton } from "./table-kit/empty-state";

/**
 * Bar Inventory → Order Drafts. Prepare what you actually plan to order from
 * each vendor, next to what the system suggested. One active draft per
 * vendor; the Dashboard's Order soon opens the same drafts.
 */
export function OrderDraftsView({
  snapshot,
  drafts,
  loading,
  loadError,
  api,
  selectedDraftId,
  onSelectDraft,
  onGuard,
  navigate,
  viewerName,
  timeZone,
}: {
  snapshot: CatalogSnapshot;
  /** Null until the first read finishes. */
  drafts: OrderDraftView[] | null;
  loading: boolean;
  loadError: string | null;
  api: OrderDraftApi;
  selectedDraftId: string | null;
  onSelectDraft: (id: string | null) => void;
  onGuard: (guard: DraftGuard | null) => void;
  /** Runs `go` now, or after the person settles unsaved edits. */
  navigate: (go: () => void) => void;
  viewerName: string;
  timeZone: string;
}) {
  const uid = useId();
  const [vendorId, setVendorId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const products = useMemo(
    () => new Map(snapshot.products.map((p) => [p.id, p])),
    [snapshot.products],
  );
  // A draft shows the item's current name and size; the stored label is the
  // fallback for an item that no longer exists in the catalog.
  const displayName = (line: OrderDraftLine) => {
    const product = products.get(line.productId);
    return lineLabel(
      product ? { name: product.name, size: product.size } : line,
    );
  };

  if (drafts === null) {
    return loadError ? (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p role="alert" className="text-destructive text-sm">
            {loadError}
          </p>
          <Button variant="secondary" onClick={() => void api.reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    ) : (
      <div>
        <p className="sr-only" role="status">
          Loading order drafts…
        </p>
        <TableSkeleton />
      </div>
    );
  }

  const choices = draftableVendors(snapshot.vendors, drafts);
  const selected =
    drafts.find((d) => d.id === selectedDraftId) ?? drafts[0] ?? null;
  const chosenVendor = choices.some((v) => v.id === vendorId)
    ? vendorId
    : (choices[0]?.id ?? "");

  const create = async () => {
    if (creating || !chosenVendor) return;
    setCreating(true);
    setCreateError(null);
    const result = await api.open(chosenVendor);
    setCreating(false);
    if (result.ok) {
      setVendorId("");
      if (result.draftId) onSelectDraft(result.draftId);
    } else {
      setCreateError(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="order-drafts">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Order Drafts</h2>
        <p className="text-muted-foreground text-sm">
          Plan what you will order from each vendor. The suggested quantity
          comes from your stock and par and never changes when you type your
          own.
        </p>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {loadError} Showing the last order drafts we loaded.
        </p>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1 sm:max-w-xs">
              <Label htmlFor={`${uid}-vendor`}>Start a draft for</Label>
              <Select
                id={`${uid}-vendor`}
                value={chosenVendor}
                onChange={(event) => setVendorId(event.target.value)}
                disabled={choices.length === 0}
              >
                {choices.length === 0 ? (
                  <option value="">No vendor without a draft</option>
                ) : (
                  choices.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <Button
              onClick={() => void create()}
              aria-disabled={creating || !chosenVendor}
              className={creating || !chosenVendor ? "opacity-60" : undefined}
            >
              {creating ? "Creating…" : "Create Order Draft"}
            </Button>
            {loading ? (
              <span role="status" className="text-muted-foreground text-xs">
                Refreshing…
              </span>
            ) : null}
          </div>
          {createError ? (
            <p role="alert" className="text-destructive text-sm">
              {createError}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Items under Unassigned can&apos;t be ordered: assign a vendor in
            Manage first.
          </p>
        </CardContent>
      </Card>

      {drafts.length === 0 ? (
        <EmptyState message="No order drafts yet. Start one above, or use Create Order Draft on a vendor in Dashboard → Order soon." />
      ) : (
        <>
          <nav aria-label="Active order drafts">
            <ul className="flex flex-wrap gap-2" data-testid="draft-list">
              {drafts.map((draft) => {
                const totals = draftTotals(draft);
                const current = draft.id === selected?.id;
                return (
                  <li key={draft.id}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => {
                        if (!current) navigate(() => onSelectDraft(draft.id));
                      }}
                      className={cn(
                        "focus-visible:ring-ring flex min-h-11 flex-col items-start rounded-xl border px-3 py-2 text-left outline-none focus-visible:ring-2",
                        current
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-card hover:bg-muted/40",
                      )}
                    >
                      <span className="text-sm font-semibold">
                        {draft.vendorName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {draft.lines.length}{" "}
                        {draft.lines.length === 1 ? "line" : "lines"} · planned{" "}
                        {formatQuantity(totals.plannedTotal)} · updated{" "}
                        {formatDraftTime(draft.updatedAt, timeZone)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {selected ? (
            <OrderDraftEditor
              key={selected.id}
              draft={selected}
              displayName={displayName}
              viewerName={viewerName}
              timeZone={timeZone}
              api={api}
              onGuard={onGuard}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
