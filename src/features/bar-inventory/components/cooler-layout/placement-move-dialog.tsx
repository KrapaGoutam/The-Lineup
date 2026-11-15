"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type {
  ProductView,
  StorageAreaView,
  StoragePlacementView,
  StorageShelfView,
} from "../../domain/inventory-types";
import type { RunCatalogCommand } from "../catalog-dialogs";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The product being placed or moved; null lets the person choose one. */
  product: ProductView | null;
  existingPlacement: StoragePlacementView | null;
  defaultAreaId?: string | null;
  defaultShelfId?: string | null;
  defaultSlotNumber?: number | null;
  areas: readonly StorageAreaView[];
  shelves: readonly StorageShelfView[];
  /** Every placement at this branch, to keep a product off a shelf it is already on. */
  placements: readonly StoragePlacementView[];
  /** Active catalog products (for the picker when `product` is null). */
  products: readonly ProductView[];
  run: RunCatalogCommand;
};

export function PlacementMoveDialog({
  open,
  onOpenChange,
  product,
  existingPlacement,
  defaultAreaId,
  defaultShelfId,
  defaultSlotNumber,
  areas,
  shelves,
  placements,
  products,
  run,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={existingPlacement ? "Move Placement" : "Place Product on Shelf"}
      description="Choose where this product physically sits. This is organization only: it never changes the stock count."
    >
      {open ? (
        <PlacementMoveForm
          key={
            existingPlacement?.id ??
            product?.id ??
            `${defaultShelfId ?? ""}-${defaultSlotNumber ?? "pick"}`
          }
          product={product}
          existingPlacement={existingPlacement}
          defaultAreaId={defaultAreaId}
          defaultShelfId={defaultShelfId}
          defaultSlotNumber={defaultSlotNumber}
          areas={areas}
          shelves={shelves}
          placements={placements}
          products={products}
          run={run}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function PlacementMoveForm({
  product,
  existingPlacement,
  defaultAreaId,
  defaultShelfId,
  defaultSlotNumber,
  areas,
  shelves,
  placements,
  products,
  run,
  onClose,
}: {
  product: ProductView | null;
  existingPlacement: StoragePlacementView | null;
  defaultAreaId?: string | null;
  defaultShelfId?: string | null;
  defaultSlotNumber?: number | null;
  areas: readonly StorageAreaView[];
  shelves: readonly StorageShelfView[];
  placements: readonly StoragePlacementView[];
  products: readonly ProductView[];
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const initialAreaId =
    existingPlacement?.storageAreaId ??
    (defaultShelfId
      ? shelves.find((s) => s.id === defaultShelfId)?.storageAreaId
      : null) ??
    defaultAreaId ??
    areas[0]?.id ??
    "";
  const [selectedAreaId, setSelectedAreaId] = useState(initialAreaId);

  const initialShelfId =
    existingPlacement?.shelfId ??
    defaultShelfId ??
    shelves.find((s) => s.storageAreaId === initialAreaId)?.id ??
    "";
  const [selectedShelfId, setSelectedShelfId] = useState(initialShelfId);
  const [productId, setProductId] = useState(product?.id ?? "");

  const initialSlotNumber =
    existingPlacement?.slotNumber ??
    (defaultSlotNumber !== undefined && defaultSlotNumber !== null
      ? defaultSlotNumber
      : "");
  const [slotNumber, setSlotNumber] = useState<number | "">(initialSlotNumber);
  const [slotLabel, setSlotLabel] = useState(
    existingPlacement?.slotLabel ??
      (defaultSlotNumber !== undefined && defaultSlotNumber !== null
        ? `Slot ${defaultSlotNumber}`
        : ""),
  );
  // The version the editor SAW; a refresh while the dialog is open must not rebase the save.
  const [openedVersion] = useState(existingPlacement?.version ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const areaShelves = useMemo(
    () => shelves.filter((s) => s.storageAreaId === selectedAreaId),
    [shelves, selectedAreaId],
  );

  // Picker choices: active products not already placed on the chosen shelf.
  const pickable = useMemo(() => {
    const onShelf = new Set(
      placements
        .filter((p) => p.shelfId === selectedShelfId)
        .map((p) => p.productId),
    );
    return products
      .filter((p) => p.active && !onShelf.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, placements, selectedShelfId]);

  const chosen = product ?? products.find((p) => p.id === productId) ?? null;

  function handleAreaChange(areaId: string) {
    setSelectedAreaId(areaId);
    const firstShelf = shelves.find((s) => s.storageAreaId === areaId);
    setSelectedShelfId(firstShelf?.id ?? "");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setError("Choose a product to place.");
      return;
    }
    if (!selectedAreaId) {
      setError("Select a storage area.");
      return;
    }
    if (!selectedShelfId) {
      setError("Select a shelf within the storage area.");
      return;
    }
    if (slotLabel.trim().length > 30) {
      setError("Slot label cannot exceed 30 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await run({
        type: "storagePlacementSet",
        id: existingPlacement?.id ?? null,
        storageAreaId: selectedAreaId,
        shelfId: selectedShelfId,
        productId: chosen.id,
        slotNumber: slotNumber === "" ? null : Number(slotNumber),
        slotLabel: slotLabel.trim() || null,
        displayOrder: existingPlacement?.displayOrder ?? 0,
        expectedVersion: openedVersion,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      {product ? (
        <div className="bg-muted/50 rounded-md border p-3 text-sm">
          <div className="text-foreground font-medium">{product.name}</div>
          <div className="text-muted-foreground text-xs">
            {product.size ? `${product.size} · ` : ""}
            Physical placement only; it does not alter stock counts.
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="place-product">Product</Label>
          <Select
            id="place-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            <option value="">Choose a product…</option>
            {pickable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.size ? ` (${p.size})` : ""}
              </option>
            ))}
          </Select>
          <p className="text-muted-foreground text-xs">
            A product can sit in more than one place. Placement never changes
            its stock count.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="place-area">Storage Area</Label>
        <Select
          id="place-area"
          value={selectedAreaId}
          onChange={(e) => handleAreaChange(e.target.value)}
          disabled={areas.length === 0}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="place-shelf">Shelf / Section</Label>
        <Select
          id="place-shelf"
          value={selectedShelfId}
          onChange={(e) => setSelectedShelfId(e.target.value)}
          disabled={areaShelves.length === 0}
        >
          {areaShelves.length === 0 ? (
            <option value="">No shelves in this area</option>
          ) : (
            areaShelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.sectionName ? ` (${s.sectionName})` : ""}
              </option>
            ))
          )}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="place-label">Slot Label (e.g. L1, R2)</Label>
          <Input
            id="place-label"
            placeholder="e.g. L1, Front"
            value={slotLabel}
            onChange={(e) => setSlotLabel(e.target.value)}
            maxLength={30}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="place-num">Slot Number</Label>
          <Input
            id="place-num"
            type="number"
            min={0}
            placeholder="e.g. 1, 2"
            value={slotNumber}
            onChange={(e) =>
              setSlotNumber(
                e.target.value === "" ? "" : parseInt(e.target.value) || 0,
              )
            }
          />
        </div>
      </div>

      {error && (
        <p className="text-destructive text-sm font-medium" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving || areaShelves.length === 0 || !chosen}
        >
          {saving
            ? "Saving…"
            : existingPlacement
              ? "Update Placement"
              : "Place Product"}
        </Button>
      </div>
    </form>
  );
}
