"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import {
  STORAGE_AREA_KINDS,
  STORAGE_AREA_KIND_LABELS,
  type StorageAreaKind,
  type StorageAreaView,
} from "../../domain/inventory-types";
import type { RunCatalogCommand } from "../catalog-dialogs";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: StorageAreaView | null;
  run: RunCatalogCommand;
};

export function StorageAreaDialog({ open, onOpenChange, area, run }: Props) {
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={area ? "Edit Storage Area" : "New Storage Area"}
      description="Define physical coolers, bars, or dry storage zones for this branch."
    >
      {open ? (
        <StorageAreaForm
          key={area?.id ?? "new"}
          area={area}
          run={run}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function StorageAreaForm({
  area,
  run,
  onClose,
}: {
  area: StorageAreaView | null;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const [name, setName] = useState(area?.name ?? "");
  const [kind, setKind] = useState<StorageAreaKind>(area?.kind ?? "cooler");
  const [displayOrder, setDisplayOrder] = useState(area?.displayOrder ?? 1);
  // The version the editor SAW when this form opened. A later refresh of the
  // snapshot must not silently re-base a save on someone else's newer change.
  const [openedVersion] = useState(area?.version ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a storage area name.");
      return;
    }
    if (trimmed.length > 120) {
      setError("Area name can be at most 120 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await run({
        type: "storageAreaUpsert",
        id: area?.id ?? null,
        name: trimmed,
        kind,
        displayOrder,
        // Editing never changes whether an area is archived (Restore is its own action).
        active: area?.active ?? true,
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
      <div className="grid gap-2">
        <Label htmlFor="area-name">Area Name</Label>
        <Input
          id="area-name"
          placeholder="e.g. Walk-In Cooler 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="area-kind">Storage Kind</Label>
        <Select
          id="area-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as StorageAreaKind)}
        >
          {STORAGE_AREA_KINDS.map((k) => (
            <option key={k} value={k}>
              {STORAGE_AREA_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="area-order">Display Order</Label>
        <Input
          id="area-order"
          type="number"
          min={0}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
        />
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
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : area ? "Save Changes" : "Create Area"}
        </Button>
      </div>
    </form>
  );
}
