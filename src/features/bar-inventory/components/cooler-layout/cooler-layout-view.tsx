"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  Edit2,
  FolderPlus,
  Layers,
  MapPin,
  MoveRight,
  Plus,
  Search,
  Trash2,
  Warehouse,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import {
  STORAGE_AREA_KIND_LABELS,
  type CatalogSnapshot,
  type ProductView,
  type StorageAreaView,
  type StoragePlacementView,
  type StorageShelfView,
} from "../../domain/inventory-types";
import { evaluateStock, type StockStatus } from "../../domain/stock-rules";
import { StatusBadge } from "../table-kit/status-badge";
import type { RunCatalogCommand } from "../catalog-dialogs";
import { StorageAreaDialog } from "./storage-area-dialog";
import { StorageShelfDialog } from "./storage-shelf-dialog";
import { PlacementMoveDialog } from "./placement-move-dialog";

type Props = {
  snapshot: CatalogSnapshot;
  locationId?: string | null;
  run: RunCatalogCommand;
  timeZone: string;
  onSelectProduct: (productId: string) => void;
};

export function CoolerLayoutView({
  snapshot,
  locationId,
  run,
  onSelectProduct,
}: Props) {
  const [selectedAreaId, setSelectedAreaId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<StorageAreaView | null>(null);

  const [shelfDialogOpen, setShelfDialogOpen] = useState(false);
  const [editingShelf, setEditingShelf] = useState<StorageShelfView | null>(
    null,
  );

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingProduct, setMovingProduct] = useState<ProductView | null>(null);
  const [movingPlacement, setMovingPlacement] =
    useState<StoragePlacementView | null>(null);
  const [defaultShelfForMove, setDefaultShelfForMove] = useState<string | null>(
    null,
  );

  // Active storage areas, shelves, placements (filtered to location if applicable)
  const allAreas = useMemo(() => {
    const list = snapshot.storageAreas ?? [];
    return list.filter((a) => !locationId || a.locationId === locationId);
  }, [snapshot.storageAreas, locationId]);

  const activeAreas = useMemo(() => {
    return allAreas.filter((a) => a.active);
  }, [allAreas]);

  const allShelves = useMemo(() => {
    const list = snapshot.storageShelves ?? [];
    return list.filter((s) => !locationId || s.locationId === locationId);
  }, [snapshot.storageShelves, locationId]);

  const allPlacements = useMemo(() => {
    const list = snapshot.storagePlacements ?? [];
    return list.filter((p) => !locationId || p.locationId === locationId);
  }, [snapshot.storagePlacements, locationId]);

  // Map products by ID
  const productMap = useMemo(() => {
    return new Map(snapshot.products.map((p) => [p.id, p]));
  }, [snapshot.products]);

  // Map stock by product ID
  const stockMap = useMemo(() => {
    return new Map(snapshot.stock.map((s) => [s.productId, s]));
  }, [snapshot.stock]);

  // Map vendor by ID
  const vendorMap = useMemo(() => {
    return new Map(snapshot.vendors.map((v) => [v.id, v.name]));
  }, [snapshot.vendors]);

  // Map category by ID
  const categoryMap = useMemo(() => {
    return new Map(snapshot.categories.map((c) => [c.id, c.name]));
  }, [snapshot.categories]);

  // Placements grouped by shelfId
  const placementsByShelf = useMemo(() => {
    const map = new Map<string, StoragePlacementView[]>();
    for (const p of allPlacements) {
      const arr = map.get(p.shelfId) ?? [];
      arr.push(p);
      map.set(p.shelfId, arr);
    }
    // Sort each shelf's placements by displayOrder, then slotNumber
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return (a.slotNumber ?? 9999) - (b.slotNumber ?? 9999);
      });
    }
    return map;
  }, [allPlacements]);

  // Shelves grouped by storageAreaId
  const shelvesByArea = useMemo(() => {
    const map = new Map<string, StorageShelfView[]>();
    for (const s of allShelves) {
      const arr = map.get(s.storageAreaId) ?? [];
      arr.push(s);
      map.set(s.storageAreaId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return map;
  }, [allShelves]);

  // Find unassigned products (active products with no placement at this location)
  const unassignedProducts = useMemo(() => {
    const placedProductIds = new Set(allPlacements.map((p) => p.productId));
    return snapshot.products.filter(
      (p) => p.active && !placedProductIds.has(p.id),
    );
  }, [snapshot.products, allPlacements]);

  // Filtered unassigned products by search
  const filteredUnassigned = useMemo(() => {
    if (!searchQuery.trim()) return unassignedProducts;
    const q = searchQuery.toLowerCase().trim();
    return unassignedProducts.filter((p) => {
      const vendor = vendorMap.get(p.vendorId)?.toLowerCase() ?? "";
      const cat =
        (p.categoryId ? categoryMap.get(p.categoryId) : "")?.toLowerCase() ??
        "";
      return (
        p.name.toLowerCase().includes(q) ||
        vendor.includes(q) ||
        cat.includes(q) ||
        (p.size && p.size.toLowerCase().includes(q))
      );
    });
  }, [unassignedProducts, searchQuery, vendorMap, categoryMap]);

  // Helpers
  function getProductStatus(productId: string): {
    status: StockStatus;
    onHand: number;
    backup: number;
    total: number;
  } {
    const stock = stockMap.get(productId);
    if (!stock) {
      return { status: "no_cutoff", onHand: 0, backup: 0, total: 0 };
    }
    const evaluated = evaluateStock({
      onHand: stock.onHand,
      backup: stock.backup,
      cutoff: stock.cutoff,
      warning: stock.warning,
      par: stock.par,
    });
    return {
      status: evaluated.status,
      onHand: stock.onHand,
      backup: stock.backup,
      total: stock.onHand + stock.backup,
    };
  }

  function handleOpenAddArea() {
    setEditingArea(null);
    setAreaDialogOpen(true);
  }

  function handleOpenEditArea(area: StorageAreaView) {
    setEditingArea(area);
    setAreaDialogOpen(true);
  }

  async function handleArchiveArea(areaId: string) {
    if (
      !window.confirm(
        "Are you sure you want to archive this storage area? Its shelves and placements will be preserved in history.",
      )
    ) {
      return;
    }
    await run({ type: "storageAreaArchive", id: areaId });
    if (selectedAreaId === areaId) setSelectedAreaId("all");
  }

  function handleOpenAddShelf(areaId?: string) {
    setEditingShelf(null);
    setShelfDialogOpen(true);
    if (areaId) setSelectedAreaId(areaId);
  }

  function handleOpenEditShelf(shelf: StorageShelfView) {
    setEditingShelf(shelf);
    setShelfDialogOpen(true);
  }

  async function handleDeleteShelf(shelfId: string) {
    if (
      !window.confirm(
        "Delete this shelf? Any product placements on this shelf will be returned to Unassigned Storage.",
      )
    ) {
      return;
    }
    await run({ type: "storageShelfDelete", id: shelfId });
  }

  function handlePlaceProductOnShelf(shelf: StorageShelfView) {
    setMovingPlacement(null);
    setMovingProduct(null);
    setDefaultShelfForMove(shelf.id);
    setSelectedAreaId(shelf.storageAreaId);
    // Open move dialog with unassigned product choice or first unassigned
    if (unassignedProducts.length > 0) {
      setMovingProduct(unassignedProducts[0]);
      setMoveDialogOpen(true);
    } else {
      alert(
        "All catalog products are already placed! Create new products or move existing ones.",
      );
    }
  }

  function handleMovePlacement(placement: StoragePlacementView) {
    const product = productMap.get(placement.productId);
    if (!product) return;
    setMovingProduct(product);
    setMovingPlacement(placement);
    setDefaultShelfForMove(placement.shelfId);
    setMoveDialogOpen(true);
  }

  async function handleRemovePlacement(placementId: string) {
    if (
      !window.confirm(
        "Remove this product from the shelf? (Authoritative stock is unaffected; product becomes unassigned).",
      )
    ) {
      return;
    }
    await run({ type: "storagePlacementDelete", id: placementId });
  }

  function handleAssignUnassigned(product: ProductView) {
    setMovingProduct(product);
    setMovingPlacement(null);
    setDefaultShelfForMove(null);
    setMoveDialogOpen(true);
  }

  const activeArea = activeAreas.find((a) => a.id === selectedAreaId);

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-muted/30 text-muted-foreground flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium">
            <MapPin className="text-primary size-3.5" />
            <span>
              Branch: {locationId ? "Current Location" : "All Locations"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Warehouse className="text-muted-foreground size-4" />
            <Select
              id="cooler-area-select"
              aria-label="Select storage area"
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              className="w-[200px] sm:w-[240px]"
            >
              <option value="all">All Storage Areas</option>
              {activeAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({STORAGE_AREA_KIND_LABELS[a.kind]})
                </option>
              ))}
              <option value="unassigned">
                Unassigned Storage ({unassignedProducts.length})
              </option>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              placeholder="Filter products or slots…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAddArea}
            className="gap-1.5"
          >
            <FolderPlus className="size-4" />
            <span>Add Area</span>
          </Button>

          {activeAreas.length > 0 && (
            <Button
              size="sm"
              onClick={() => handleOpenAddShelf(activeArea?.id)}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              <span>Add Shelf</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Main Content Views */}

      {/* 2A. ALL STORAGE AREAS OVERVIEW */}
      {selectedAreaId === "all" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeAreas.map((area) => {
              const shelves = shelvesByArea.get(area.id) ?? [];
              const placements = allPlacements.filter(
                (p) => p.storageAreaId === area.id,
              );
              return (
                <Card
                  key={area.id}
                  className="hover:border-primary/50 flex flex-col transition hover:shadow-sm"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold">{area.name}</h3>
                      <Badge tone="neutral" className="text-xs">
                        {STORAGE_AREA_KIND_LABELS[area.kind]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between pt-0">
                    <div className="text-muted-foreground space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Layers className="size-3.5" />
                        <span>
                          {shelves.length}{" "}
                          {shelves.length === 1 ? "shelf" : "shelves"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Boxes className="size-3.5" />
                        <span>
                          {placements.length} placed{" "}
                          {placements.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditArea(area)}
                        className="text-muted-foreground h-8 px-2 text-xs"
                      >
                        <Edit2 className="mr-1 size-3" />
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedAreaId(area.id)}
                        className="h-8 gap-1 px-3 text-xs"
                      >
                        <span>View Rack</span>
                        <MoveRight className="size-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Unassigned Storage Card */}
            <Card className="bg-muted/20 hover:border-primary/50 flex flex-col border-dashed">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    Unassigned Storage
                  </h3>
                  <Badge tone="neutral" className="text-xs">
                    {unassignedProducts.length} items
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between pt-0">
                <p className="text-muted-foreground text-xs">
                  Catalog products currently with no physical placement in this
                  branch.
                </p>
                <div className="mt-4 flex items-center justify-end border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAreaId("unassigned")}
                    className="h-8 gap-1 px-3 text-xs"
                  >
                    <span>Manage Unassigned</span>
                    <MoveRight className="size-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {activeAreas.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Warehouse className="text-muted-foreground mx-auto size-10" />
              <h3 className="mt-3 text-sm font-semibold">
                No storage areas defined
              </h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Get started by creating your first cooler, freezer, or back bar.
              </p>
              <Button
                size="sm"
                onClick={handleOpenAddArea}
                className="mt-4 gap-1.5"
              >
                <FolderPlus className="size-4" />
                <span>Create Storage Area</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2B. SPECIFIC STORAGE AREA 2D SHELF LAYOUT */}
      {selectedAreaId !== "all" &&
        selectedAreaId !== "unassigned" &&
        activeArea && (
          <div className="space-y-6">
            {/* Area Banner */}
            <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {activeArea.name}
                  </h2>
                  <Badge tone="neutral">
                    {STORAGE_AREA_KIND_LABELS[activeArea.kind]}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Physical rack layout. Products placed here retain
                  authoritative stock at the branch level (Option A).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEditArea(activeArea)}
                  className="gap-1.5 text-xs"
                >
                  <Edit2 className="size-3.5" />
                  <span>Edit Area</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchiveArea(activeArea.id)}
                  className="text-destructive hover:text-destructive gap-1.5 text-xs"
                >
                  <Trash2 className="size-3.5" />
                  <span>Archive</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleOpenAddShelf(activeArea.id)}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="size-3.5" />
                  <span>Add Shelf</span>
                </Button>
              </div>
            </div>

            {/* Shelves List (Rendered Top-to-Bottom as 2D Racks) */}
            <div className="space-y-6">
              {(shelvesByArea.get(activeArea.id) ?? []).map((shelf) => {
                const placements = placementsByShelf.get(shelf.id) ?? [];
                const query = searchQuery.toLowerCase().trim();

                return (
                  <div
                    key={shelf.id}
                    className="border-muted/80 bg-muted/10 rounded-lg border-2 p-4 shadow-sm"
                  >
                    {/* Shelf Header */}
                    <div className="border-muted flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded text-xs font-semibold">
                          {shelf.displayOrder}
                        </div>
                        <h3 className="text-foreground text-sm font-semibold">
                          {shelf.name}
                        </h3>
                        {shelf.sectionName && (
                          <Badge tone="neutral" className="text-xs">
                            {shelf.sectionName}
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-xs">
                          ({placements.length}{" "}
                          {placements.length === 1 ? "slot" : "slots"})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePlaceProductOnShelf(shelf)}
                          className="h-7 px-2 text-xs"
                        >
                          <Plus className="mr-1 size-3" />
                          Place Item
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditShelf(shelf)}
                          className="text-muted-foreground h-7 px-2 text-xs"
                        >
                          <Edit2 className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteShelf(shelf.id)}
                          className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Horizontal Slots Rack */}
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {placements.map((placement) => {
                        const product = productMap.get(placement.productId);
                        if (!product) return null;

                        const vendor = vendorMap.get(product.vendorId) ?? "—";
                        const category = product.categoryId
                          ? (categoryMap.get(product.categoryId) ?? "—")
                          : "—";
                        const stockInfo = getProductStatus(product.id);

                        const matches =
                          !query ||
                          product.name.toLowerCase().includes(query) ||
                          vendor.toLowerCase().includes(query) ||
                          category.toLowerCase().includes(query) ||
                          (placement.slotLabel &&
                            placement.slotLabel.toLowerCase().includes(query));

                        return (
                          <div
                            key={placement.id}
                            className={`group bg-card hover:border-primary/70 relative flex flex-col justify-between rounded-md border p-3 shadow-xs transition hover:shadow-sm ${
                              matches ? "" : "opacity-35"
                            }`}
                          >
                            {/* Slot Position Badge */}
                            <div className="flex items-center justify-between gap-1 pb-1.5">
                              <Badge
                                tone="neutral"
                                className="font-mono text-[11px] font-bold"
                              >
                                {placement.slotLabel ||
                                  (placement.slotNumber
                                    ? `#${placement.slotNumber}`
                                    : `Slot ${placement.displayOrder}`)}
                              </Badge>
                              <StatusBadge status={stockInfo.status} />
                            </div>

                            {/* Product Details (Click to open ItemSheet) */}
                            <button
                              type="button"
                              onClick={() => onSelectProduct(product.id)}
                              className="py-1 text-left hover:underline focus:outline-hidden"
                              title="Click to view and edit product counts and details"
                            >
                              <div className="text-foreground line-clamp-2 text-xs font-medium">
                                {product.name}
                              </div>
                              <div className="text-muted-foreground mt-0.5 text-[11px]">
                                {product.size ? `${product.size} · ` : ""}
                                {vendor}
                              </div>
                            </button>

                            {/* Stock Count Display & Actions */}
                            <div className="border-muted/50 mt-2 flex items-center justify-between border-t pt-2 text-[11px]">
                              <div className="text-foreground font-semibold">
                                {stockInfo.onHand} on hand
                                {stockInfo.backup > 0
                                  ? ` · ${stockInfo.backup} bkp`
                                  : ""}
                              </div>
                              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMovePlacement(placement)}
                                  className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                                  title="Move / Reassign position"
                                >
                                  <Edit2 className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleRemovePlacement(placement.id)
                                  }
                                  className="text-destructive/80 hover:text-destructive h-6 w-6 p-0"
                                  title="Remove from shelf (returns to Unassigned)"
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Place Item Button Tile on Shelf */}
                      <button
                        type="button"
                        onClick={() => handlePlaceProductOnShelf(shelf)}
                        className="border-muted-foreground/20 text-muted-foreground hover:border-primary/60 hover:bg-muted/30 hover:text-primary flex min-h-[120px] flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center text-xs transition"
                      >
                        <Plus className="mb-1 size-5" />
                        <span>Place Product</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {(shelvesByArea.get(activeArea.id) ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <Layers className="text-muted-foreground mx-auto size-10" />
                  <h3 className="mt-3 text-sm font-semibold">
                    No shelves in this area
                  </h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Add top, middle, or bottom shelves to organize your
                    products.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleOpenAddShelf(activeArea.id)}
                    className="mt-4 gap-1.5"
                  >
                    <Plus className="size-4" />
                    <span>Add First Shelf</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

      {/* 2C. UNASSIGNED STORAGE VIEW */}
      {selectedAreaId === "unassigned" && (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border p-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Unassigned Storage
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              These catalog products currently have no physical placement in
              this restaurant branch. Place them into a cooler or shelf to
              organize your floor.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredUnassigned.map((product) => {
              const vendor = vendorMap.get(product.vendorId) ?? "—";
              const category = product.categoryId
                ? (categoryMap.get(product.categoryId) ?? "—")
                : "—";
              const stockInfo = getProductStatus(product.id);

              return (
                <div
                  key={product.id}
                  className="bg-card hover:border-primary/50 flex flex-col justify-between rounded-md border p-4 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-2">
                      <Badge tone="neutral" className="text-xs">
                        {category}
                      </Badge>
                      <StatusBadge status={stockInfo.status} />
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectProduct(product.id)}
                      className="text-foreground text-left text-sm font-medium hover:underline"
                    >
                      {product.name}
                    </button>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {product.size ? `${product.size} · ` : ""}
                      {vendor}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-foreground text-xs font-semibold">
                      {stockInfo.onHand} on hand
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAssignUnassigned(product)}
                      disabled={activeAreas.length === 0}
                      className="h-8 gap-1 text-xs"
                    >
                      <Plus className="size-3" />
                      <span>Place on Shelf</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredUnassigned.length === 0 && (
            <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              {searchQuery
                ? "No unassigned products match your filter."
                : "All catalog products have physical placements!"}
            </div>
          )}
        </div>
      )}

      {/* 3. Dialogs */}
      <StorageAreaDialog
        open={areaDialogOpen}
        onOpenChange={setAreaDialogOpen}
        area={editingArea}
        run={run}
      />

      <StorageShelfDialog
        open={shelfDialogOpen}
        onOpenChange={setShelfDialogOpen}
        shelf={editingShelf}
        defaultAreaId={
          selectedAreaId !== "all" && selectedAreaId !== "unassigned"
            ? selectedAreaId
            : activeAreas[0]?.id
        }
        areas={activeAreas}
        run={run}
      />

      <PlacementMoveDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        product={movingProduct}
        existingPlacement={movingPlacement}
        defaultAreaId={
          selectedAreaId !== "all" && selectedAreaId !== "unassigned"
            ? selectedAreaId
            : activeAreas[0]?.id
        }
        defaultShelfId={defaultShelfForMove}
        areas={activeAreas}
        shelves={allShelves}
        run={run}
      />
    </div>
  );
}
