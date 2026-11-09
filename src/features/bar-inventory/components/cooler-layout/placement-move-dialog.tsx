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
  product: ProductView | null;
  existingPlacement: StoragePlacementView | null;
  defaultAreaId?: string | null;
  defaultShelfId?: string | null;
  areas: readonly StorageAreaView[];
  shelves: readonly StorageShelfView[];
  run: RunCatalogCommand;
};

export function PlacementMoveDialog({
  open,
  onOpenChange,
  product,
  existingPlacement,
  defaultAreaId,
  defaultShelfId,
  areas,
  shelves,
  run,
}: Props) {
  if (!product) return null;

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={existingPlacement ? "Move Placement" : "Place Product on Shelf"}
      description={`Assign physical cooler or shelf position for ${product.name} (${product.size ?? "Standard"}).`}
    >
      {open ? (
        <PlacementMoveForm
          key={existingPlacement?.id ?? product.id}
          product={product}
          existingPlacement={existingPlacement}
          defaultAreaId={defaultAreaId}
          defaultShelfId={defaultShelfId}
          areas={areas}
          shelves={shelves}
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
  areas,
  shelves,
  run,
  onClose,
}: {
  product: ProductView;
  existingPlacement: StoragePlacementView | null;
  defaultAreaId?: string | null;
  defaultShelfId?: string | null;
  areas: readonly StorageAreaView[];
  shelves: readonly StorageShelfView[];
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const initialAreaId =
    existingPlacement?.storageAreaId ?? defaultAreaId ?? areas[0]?.id ?? "";
  const [selectedAreaId, setSelectedAreaId] = useState(initialAreaId);

  const initialShelfId =
    existingPlacement?.shelfId ??
    defaultShelfId ??
    shelves.find((s) => s.storageAreaId === initialAreaId)?.id ??
    "";
  const [selectedShelfId, setSelectedShelfId] = useState(initialShelfId);

  const [slotLabel, setSlotLabel] = useState(
    existingPlacement?.slotLabel ?? "",
  );
  const [slotNumber, setSlotNumber] = useState<number | "">(
    existingPlacement?.slotNumber ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter shelves for selected storage area
  const areaShelves = useMemo(() => {
    return shelves.filter((s) => s.storageAreaId === selectedAreaId);
  }, [shelves, selectedAreaId]);

  // Keep shelf synced if area changes and shelf is not in new area
  function handleAreaChange(areaId: string) {
    setSelectedAreaId(areaId);
    const firstShelf = shelves.find((s) => s.storageAreaId === areaId);
    setSelectedShelfId(firstShelf?.id ?? "");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
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
        productId: product.id,
        slotNumber: slotNumber === "" ? null : Number(slotNumber),
        slotLabel: slotLabel.trim() || null,
        displayOrder: existingPlacement?.displayOrder ?? 0,
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
      <div className="bg-muted/50 rounded-md border p-3 text-sm">
        <div className="text-foreground font-medium">{product.name}</div>
        <div className="text-muted-foreground text-xs">
          {product.size ? `${product.size} · ` : ""}
          Option A: Physical placement only; does not alter stock counts.
        </div>
      </div>

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
        <Button type="submit" disabled={saving || areaShelves.length === 0}>
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
