"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type {
  StorageAreaView,
  StorageShelfView,
} from "../../domain/inventory-types";
import type { RunCatalogCommand } from "../catalog-dialogs";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shelf: StorageShelfView | null;
  defaultAreaId?: string | null;
  areas: readonly StorageAreaView[];
  run: RunCatalogCommand;
};

export function StorageShelfDialog({
  open,
  onOpenChange,
  shelf,
  defaultAreaId,
  areas,
  run,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={shelf ? "Edit Shelf" : "New Shelf"}
      description="Configure a physical shelf or rack section within this storage area."
    >
      {open ? (
        <StorageShelfForm
          key={shelf?.id ?? "new"}
          shelf={shelf}
          defaultAreaId={defaultAreaId}
          areas={areas}
          run={run}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function StorageShelfForm({
  shelf,
  defaultAreaId,
  areas,
  run,
  onClose,
}: {
  shelf: StorageShelfView | null;
  defaultAreaId?: string | null;
  areas: readonly StorageAreaView[];
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const [storageAreaId, setStorageAreaId] = useState(
    shelf?.storageAreaId ?? defaultAreaId ?? areas[0]?.id ?? "",
  );
  const [name, setName] = useState(shelf?.name ?? "");
  const [sectionName, setSectionName] = useState(shelf?.sectionName ?? "");
  const [displayOrder, setDisplayOrder] = useState(shelf?.displayOrder ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!storageAreaId) {
      setError("Select a storage area.");
      return;
    }
    if (!trimmedName) {
      setError("Enter a shelf name.");
      return;
    }
    if (trimmedName.length > 120) {
      setError("Shelf name can be at most 120 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await run({
        type: "storageShelfUpsert",
        id: shelf?.id ?? null,
        storageAreaId,
        name: trimmedName,
        sectionName: sectionName.trim() || null,
        displayOrder,
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
        <Label htmlFor="shelf-area">Storage Area</Label>
        <Select
          id="shelf-area"
          value={storageAreaId}
          onChange={(e) => setStorageAreaId(e.target.value)}
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
        <Label htmlFor="shelf-name">Shelf Name</Label>
        <Input
          id="shelf-name"
          placeholder="e.g. Top Shelf, Shelf 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="shelf-section">
          Section / Zone (Optional grouping)
        </Label>
        <Input
          id="shelf-section"
          placeholder="e.g. Spirits, Mixers, Left Window"
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="shelf-order">Display Order (Top to Bottom)</Label>
        <Input
          id="shelf-order"
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
          {saving ? "Saving…" : shelf ? "Save Changes" : "Create Shelf"}
        </Button>
      </div>
    </form>
  );
}
