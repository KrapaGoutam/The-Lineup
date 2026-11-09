"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Boxes,
  Edit2,
  FolderPlus,
  Layers,
  MapPin,
  MoveRight,
  Plus,
  RotateCcw,
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
  type BranchStorageOverview,
  type CatalogSnapshot,
  type ProductView,
  type StorageAreaView,
  type StoragePlacementView,
  type StorageShelfView,
} from "../../domain/inventory-types";
import {
  evaluateStock,
  formatQuantity,
  type StockStatus,
} from "../../domain/stock-rules";
import { StatusBadge } from "../table-kit/status-badge";
import type { RunCatalogCommand } from "../catalog-dialogs";
import { AllBranchesOverview } from "./all-branches-overview";
import { StorageAreaDialog } from "./storage-area-dialog";
import { StorageShelfDialog } from "./storage-shelf-dialog";
import { PlacementMoveDialog } from "./placement-move-dialog";

type OverviewResult =
  | { ok: true; data: BranchStorageOverview }
  | { ok: false; error: string };

type Props = {
  snapshot: CatalogSnapshot;
  /** The server-verified branch this layout edits. */
  locationId?: string | null;
  /** That branch's display name (never a guess: the label shows what is edited). */
  locationName?: string | null;
  run: RunCatalogCommand;
  timeZone: string;
  onSelectProduct: (productId: string) => void;
  /**
   * Loads the read-only "All authorized branches" overview. When absent the
   * control is not offered at all (there is no fake all-branches mode).
   */
  loadBranchOverview?: () => Promise<OverviewResult>;
};

const ALL_AREAS = "all";
const UNASSIGNED = "unassigned";
const ARCHIVED = "archived";

export function CoolerLayoutView({
  snapshot,
  locationId,
  locationName,
  run,
  onSelectProduct,
  loadBranchOverview,
}: Props) {
  const [branchScope, setBranchScope] = useState<"current" | "all">("current");
  const [selectedAreaId, setSelectedAreaId] = useState<string>(ALL_AREAS);
  const [searchQuery, setSearchQuery] = useState("");

  // The all-branches overview (read-only), loaded on demand.
  const [overview, setOverview] = useState<{
    state: "idle" | "loading" | "ready" | "error";
    data: BranchStorageOverview | null;
    error: string | null;
  }>({ state: "idle", data: null, error: null });
  const [overviewNonce, setOverviewNonce] = useState(0);

  useEffect(() => {
    if (branchScope !== "all" || !loadBranchOverview) return;
    let cancelled = false;
    loadBranchOverview()
      .then((result) => {
        if (cancelled) return;
        setOverview(
          result.ok
            ? { state: "ready", data: result.data, error: null }
            : { state: "error", data: null, error: result.error },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setOverview({
          state: "error",
          data: null,
          error: "Branch layouts could not be loaded.",
        });
      });
    return () => {
      cancelled = true;
    };
    // loadBranchOverview is a stable controller callback; reload on demand only.
  }, [branchScope, overviewNonce, loadBranchOverview]);

  // Dialog states. Ids (not row copies) are held so the dialogs always see the
  // CURRENT row after a refresh; each dialog captures its own opened version.
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [shelfDialogOpen, setShelfDialogOpen] = useState(false);
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingProductId, setMovingProductId] = useState<string | null>(null);
  const [movingPlacementId, setMovingPlacementId] = useState<string | null>(
    null,
  );
  const [defaultShelfForMove, setDefaultShelfForMove] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const allAreas = useMemo(
    () =>
      (snapshot.storageAreas ?? []).filter(
        (a) => !locationId || a.locationId === locationId,
      ),
    [snapshot.storageAreas, locationId],
  );
  const activeAreas = useMemo(
    () => allAreas.filter((a) => a.active),
    [allAreas],
  );
  const archivedAreas = useMemo(
    () => allAreas.filter((a) => !a.active),
    [allAreas],
  );
  const allShelves = useMemo(
    () =>
      (snapshot.storageShelves ?? []).filter(
        (s) => !locationId || s.locationId === locationId,
      ),
    [snapshot.storageShelves, locationId],
  );
  const allPlacements = useMemo(
    () =>
      (snapshot.storagePlacements ?? []).filter(
        (p) => !locationId || p.locationId === locationId,
      ),
    [snapshot.storagePlacements, locationId],
  );

  const productMap = useMemo(
    () => new Map(snapshot.products.map((p) => [p.id, p])),
    [snapshot.products],
  );
  const stockMap = useMemo(
    () => new Map(snapshot.stock.map((s) => [s.productId, s])),
    [snapshot.stock],
  );
  const vendorMap = useMemo(
    () => new Map(snapshot.vendors.map((v) => [v.id, v.name])),
    [snapshot.vendors],
  );
  const categoryMap = useMemo(
    () => new Map(snapshot.categories.map((c) => [c.id, c.name])),
    [snapshot.categories],
  );
  const areaById = useMemo(
    () => new Map(allAreas.map((a) => [a.id, a])),
    [allAreas],
  );
  const activeProducts = useMemo(
    () => snapshot.products.filter((p) => p.active),
    [snapshot.products],
  );

  const placementsByShelf = useMemo(() => {
    const map = new Map<string, StoragePlacementView[]>();
    for (const p of allPlacements) {
      const arr = map.get(p.shelfId) ?? [];
      arr.push(p);
      map.set(p.shelfId, arr);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          a.displayOrder - b.displayOrder ||
          (a.slotNumber ?? 9999) - (b.slotNumber ?? 9999),
      );
    }
    return map;
  }, [allPlacements]);

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

  // Three distinct states (a product must never vanish from every view):
  //  - placed in an ACTIVE area            -> shown in that area's rack
  //  - placed ONLY in an archived area     -> "In archived storage" (recoverable)
  //  - no placement anywhere               -> "Unassigned"
  const { unassignedProducts, archivedOnlyProducts } = useMemo(() => {
    const activeIds = new Set(activeAreas.map((a) => a.id));
    const inActive = new Set<string>();
    const inArchived = new Map<string, Set<string>>();
    for (const p of allPlacements) {
      if (activeIds.has(p.storageAreaId)) inActive.add(p.productId);
      else {
        const set = inArchived.get(p.productId) ?? new Set<string>();
        set.add(p.storageAreaId);
        inArchived.set(p.productId, set);
      }
    }
    const unassigned: ProductView[] = [];
    const archivedOnly: { product: ProductView; areaIds: string[] }[] = [];
    for (const product of activeProducts) {
      if (inActive.has(product.id)) continue;
      const archived = inArchived.get(product.id);
      if (archived) archivedOnly.push({ product, areaIds: [...archived] });
      else unassigned.push(product);
    }
    return {
      unassignedProducts: unassigned,
      archivedOnlyProducts: archivedOnly,
    };
  }, [allPlacements, activeAreas, activeProducts]);

  const matchesSearch = (product: ProductView, extra?: string | null) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const vendor = vendorMap.get(product.vendorId)?.toLowerCase() ?? "";
    const cat = (
      product.categoryId ? (categoryMap.get(product.categoryId) ?? "") : ""
    ).toLowerCase();
    return (
      product.name.toLowerCase().includes(q) ||
      vendor.includes(q) ||
      cat.includes(q) ||
      (product.size?.toLowerCase().includes(q) ?? false) ||
      (extra?.toLowerCase().includes(q) ?? false)
    );
  };

  const filteredUnassigned = unassignedProducts.filter((p) => matchesSearch(p));
  const filteredArchivedOnly = archivedOnlyProducts.filter(({ product }) =>
    matchesSearch(product),
  );

  function getProductStatus(productId: string): {
    status: StockStatus;
    onHand: number;
    backup: number;
  } {
    const stock = stockMap.get(productId);
    if (!stock) return { status: "no_cutoff", onHand: 0, backup: 0 };
    return {
      status: evaluateStock({
        onHand: stock.onHand,
        backup: stock.backup,
        cutoff: stock.cutoff,
        warning: stock.warning,
        par: stock.par,
      }).status,
      onHand: stock.onHand,
      backup: stock.backup,
    };
  }

  const editingArea = editingAreaId
    ? (areaById.get(editingAreaId) ?? null)
    : null;
  const editingShelf = editingShelfId
    ? (allShelves.find((s) => s.id === editingShelfId) ?? null)
    : null;
  const movingProduct = movingProductId
    ? (productMap.get(movingProductId) ?? null)
    : null;
  const movingPlacement = movingPlacementId
    ? (allPlacements.find((p) => p.id === movingPlacementId) ?? null)
    : null;

  function handleOpenAddArea() {
    setEditingAreaId(null);
    setAreaDialogOpen(true);
  }

  function handleOpenEditArea(area: StorageAreaView) {
    setEditingAreaId(area.id);
    setAreaDialogOpen(true);
  }

  async function handleArchiveArea(area: StorageAreaView) {
    const placed = allPlacements.filter(
      (p) => p.storageAreaId === area.id,
    ).length;
    if (
      !window.confirm(
        `Archive "${area.name}"? Its shelves and ${placed} placement${placed === 1 ? "" : "s"} are kept, and you can restore the area at any time. Stock counts are not affected.`,
      )
    ) {
      return;
    }
    const result = await run({
      type: "storageAreaArchive",
      id: area.id,
      expectedVersion: area.version,
    });
    setNotice(result.ok ? null : result.error);
    if (result.ok && selectedAreaId === area.id) setSelectedAreaId(ALL_AREAS);
  }

  async function handleRestoreArea(area: StorageAreaView) {
    const result = await run({
      type: "storageAreaUpsert",
      id: area.id,
      name: area.name,
      kind: area.kind,
      displayOrder: area.displayOrder,
      active: true,
      expectedVersion: area.version,
    });
    setNotice(result.ok ? null : result.error);
  }

  function handleOpenAddShelf(areaId?: string) {
    setEditingShelfId(null);
    setShelfDialogOpen(true);
    if (areaId) setSelectedAreaId(areaId);
  }

  function handleOpenEditShelf(shelf: StorageShelfView) {
    setEditingShelfId(shelf.id);
    setShelfDialogOpen(true);
  }

  async function handleDeleteShelf(shelf: StorageShelfView) {
    const placed = (placementsByShelf.get(shelf.id) ?? []).length;
    const message =
      placed === 0
        ? `Delete the empty shelf "${shelf.name}"?`
        : `Delete "${shelf.name}" and remove its ${placed} placed product${placed === 1 ? "" : "s"}? The placement records are deleted (and logged). The products and their stock counts are NOT affected; a product with no other placement becomes Unassigned.`;
    if (!window.confirm(message)) return;
    const result = await run({
      type: "storageShelfDelete",
      id: shelf.id,
      expectedVersion: shelf.version,
      removePlacements: placed > 0,
    });
    setNotice(result.ok ? null : result.error);
  }

  function handlePlaceProductOnShelf(shelf: StorageShelfView) {
    setMovingPlacementId(null);
    setMovingProductId(null);
    setDefaultShelfForMove(shelf.id);
    setSelectedAreaId(shelf.storageAreaId);
    setMoveDialogOpen(true);
  }

  function handleMovePlacement(placement: StoragePlacementView) {
    if (!productMap.has(placement.productId)) return;
    setMovingProductId(placement.productId);
    setMovingPlacementId(placement.id);
    setDefaultShelfForMove(placement.shelfId);
    setMoveDialogOpen(true);
  }

  async function handleRemovePlacement(placement: StoragePlacementView) {
    if (
      !window.confirm(
        "Remove this product from the shelf? Its stock count is unaffected; if it has no other placement it becomes Unassigned.",
      )
    ) {
      return;
    }
    const result = await run({
      type: "storagePlacementDelete",
      id: placement.id,
      expectedVersion: placement.version,
    });
    setNotice(result.ok ? null : result.error);
  }

  function handleAssignProduct(product: ProductView) {
    setMovingProductId(product.id);
    setMovingPlacementId(null);
    setDefaultShelfForMove(null);
    setMoveDialogOpen(true);
  }

  const activeArea = activeAreas.find((a) => a.id === selectedAreaId);
  const branchLabel = locationName?.trim() || "This branch";
  const showingCurrent = branchScope === "current";

  return (
    <div className="space-y-6">
      {/* 1. Header toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="text-primary size-4" aria-hidden="true" />
            {loadBranchOverview ? (
              <Select
                id="cooler-branch-select"
                aria-label="Restaurant branch"
                value={branchScope}
                onChange={(e) => {
                  // Entering the overview always starts from a fresh load.
                  setOverview({ state: "idle", data: null, error: null });
                  setBranchScope(e.target.value as "current" | "all");
                  setNotice(null);
                }}
                className="w-[220px] sm:w-[260px]"
              >
                <option value="current">{branchLabel}</option>
                <option value="all">All authorized branches (view only)</option>
              </Select>
            ) : (
              <span
                className="bg-muted/30 text-muted-foreground rounded-md border px-3 py-1.5 text-xs font-medium"
                data-testid="cooler-branch-label"
              >
                Branch: {branchLabel}
              </span>
            )}
          </div>

          {showingCurrent ? (
            <div className="flex items-center gap-2">
              <Warehouse
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
              <Select
                id="cooler-area-select"
                aria-label="Select storage area"
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-[220px] sm:w-[260px]"
              >
                <option value={ALL_AREAS}>All Storage Areas</option>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({STORAGE_AREA_KIND_LABELS[a.kind]})
                  </option>
                ))}
                <option value={UNASSIGNED}>
                  Unassigned Storage (
                  {unassignedProducts.length + archivedOnlyProducts.length})
                </option>
                {archivedAreas.length > 0 ? (
                  <option value={ARCHIVED}>
                    Archived areas ({archivedAreas.length})
                  </option>
                ) : null}
              </Select>
            </div>
          ) : null}
        </div>

        {showingCurrent ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search
                className="text-muted-foreground absolute top-2.5 left-2.5 size-4"
                aria-hidden="true"
              />
              <Input
                aria-label="Filter products or slots"
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
              className="min-h-9 gap-1.5"
            >
              <FolderPlus className="size-4" />
              <span>Add Area</span>
            </Button>
            {activeAreas.length > 0 && (
              <Button
                size="sm"
                onClick={() => handleOpenAddShelf(activeArea?.id)}
                className="min-h-9 gap-1.5"
              >
                <Plus className="size-4" />
                <span>Add Shelf</span>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {notice ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      ) : null}

      {/* 2. All authorized branches (read-only) */}
      {!showingCurrent ? (
        overview.state === "ready" && overview.data ? (
          <AllBranchesOverview
            overview={overview.data}
            products={snapshot.products}
            onEditCurrentBranch={() => setBranchScope("current")}
          />
        ) : overview.state === "error" ? (
          <div role="alert" className="rounded-lg border p-6 text-center">
            <p className="text-destructive text-sm">{overview.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setOverview({ state: "idle", data: null, error: null });
                setOverviewNonce((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground text-sm">
            Loading every branch you can manage…
          </p>
        )
      ) : null}

      {/* 2A. ALL STORAGE AREAS OVERVIEW */}
      {showingCurrent && selectedAreaId === ALL_AREAS && (
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
                        <Layers className="size-3.5" aria-hidden="true" />
                        <span>
                          {shelves.length}{" "}
                          {shelves.length === 1 ? "shelf" : "shelves"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Boxes className="size-3.5" aria-hidden="true" />
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
                        className="text-muted-foreground min-h-9 px-2 text-xs"
                      >
                        <Edit2 className="mr-1 size-3" />
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedAreaId(area.id)}
                        className="min-h-9 gap-1 px-3 text-xs"
                      >
                        <span>View Rack</span>
                        <MoveRight className="size-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Card className="bg-muted/20 hover:border-primary/50 flex flex-col border-dashed">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    Unassigned Storage
                  </h3>
                  <Badge tone="neutral" className="text-xs">
                    {unassignedProducts.length + archivedOnlyProducts.length}{" "}
                    items
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between pt-0">
                <p className="text-muted-foreground text-xs">
                  Catalog products with no physical placement in an active
                  storage area at this branch
                  {archivedOnlyProducts.length > 0
                    ? ` (${archivedOnlyProducts.length} only in archived storage)`
                    : ""}
                  .
                </p>
                <div className="mt-4 flex items-center justify-end border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAreaId(UNASSIGNED)}
                    className="min-h-9 gap-1 px-3 text-xs"
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

      {/* 2B. SPECIFIC STORAGE AREA SHELF LAYOUT */}
      {showingCurrent &&
        selectedAreaId !== ALL_AREAS &&
        selectedAreaId !== UNASSIGNED &&
        selectedAreaId !== ARCHIVED &&
        activeArea && (
          <div className="space-y-6">
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
                  Physical rack layout. Placement is for organization only; each
                  product&apos;s stock is counted once, for the whole branch.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEditArea(activeArea)}
                  className="min-h-9 gap-1.5 text-xs"
                >
                  <Edit2 className="size-3.5" />
                  <span>Edit Area</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchiveArea(activeArea)}
                  className="text-destructive hover:text-destructive min-h-9 gap-1.5 text-xs"
                >
                  <Archive className="size-3.5" />
                  <span>Archive</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleOpenAddShelf(activeArea.id)}
                  className="min-h-9 gap-1.5 text-xs"
                >
                  <Plus className="size-3.5" />
                  <span>Add Shelf</span>
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              {(shelvesByArea.get(activeArea.id) ?? []).map((shelf) => {
                const placements = placementsByShelf.get(shelf.id) ?? [];
                return (
                  <div
                    key={shelf.id}
                    className="border-muted/80 bg-muted/10 rounded-lg border-2 p-4 shadow-sm"
                  >
                    <div className="border-muted flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                      <div className="flex flex-wrap items-center gap-2">
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
                          className="min-h-9 px-2 text-xs"
                        >
                          <Plus className="mr-1 size-3" />
                          Place Item
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditShelf(shelf)}
                          aria-label={`Edit shelf ${shelf.name}`}
                          className="text-muted-foreground size-9 p-0"
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteShelf(shelf)}
                          aria-label={`Delete shelf ${shelf.name}`}
                          className="text-destructive hover:text-destructive size-9 p-0"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {placements.map((placement) => {
                        const product = productMap.get(placement.productId);
                        if (!product) return null;
                        const vendor = vendorMap.get(product.vendorId) ?? "—";
                        const stockInfo = getProductStatus(product.id);
                        const matches = matchesSearch(
                          product,
                          placement.slotLabel,
                        );

                        return (
                          <div
                            key={placement.id}
                            data-testid="placement-tile"
                            className={`bg-card hover:border-primary/70 relative flex flex-col justify-between rounded-md border p-3 shadow-xs transition hover:shadow-sm ${
                              matches ? "" : "opacity-35"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 pb-1.5">
                              <Badge
                                tone="neutral"
                                className="font-mono text-[11px] font-bold"
                              >
                                {placement.slotLabel ||
                                  (placement.slotNumber !== null
                                    ? `#${placement.slotNumber}`
                                    : `Slot ${placement.displayOrder}`)}
                              </Badge>
                              <StatusBadge status={stockInfo.status} />
                            </div>

                            <button
                              type="button"
                              onClick={() => onSelectProduct(product.id)}
                              className="min-h-11 py-1 text-left hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
                              title="Open this product to view and edit counts and details"
                            >
                              <div className="text-foreground line-clamp-2 text-xs font-medium">
                                {product.name}
                              </div>
                              <div className="text-muted-foreground mt-0.5 text-[11px]">
                                {product.size ? `${product.size} · ` : ""}
                                {vendor}
                              </div>
                            </button>

                            <div className="border-muted/50 mt-2 flex items-center justify-between border-t pt-2 text-[11px]">
                              <div className="text-foreground font-semibold">
                                {formatQuantity(stockInfo.onHand)} on hand
                                {stockInfo.backup > 0
                                  ? ` · ${formatQuantity(stockInfo.backup)} bkp`
                                  : ""}
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMovePlacement(placement)}
                                  aria-label={`Move ${product.name}`}
                                  className="text-muted-foreground hover:text-foreground size-9 p-0"
                                  title="Move / reassign position"
                                >
                                  <Edit2 className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleRemovePlacement(placement)
                                  }
                                  aria-label={`Remove ${product.name} from shelf`}
                                  className="text-destructive/80 hover:text-destructive size-9 p-0"
                                  title="Remove from shelf"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

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
      {showingCurrent && selectedAreaId === UNASSIGNED && (
        <div className="space-y-6">
          <div className="bg-card rounded-lg border p-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Unassigned Storage
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              These catalog products have no physical placement in an active
              storage area at this branch. Place them into a cooler or shelf to
              organize your floor.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredUnassigned.map((product) => (
              <UnassignedCard
                key={product.id}
                product={product}
                vendor={vendorMap.get(product.vendorId) ?? "—"}
                category={
                  product.categoryId
                    ? (categoryMap.get(product.categoryId) ?? "—")
                    : "—"
                }
                stock={getProductStatus(product.id)}
                canPlace={activeAreas.length > 0}
                onOpen={() => onSelectProduct(product.id)}
                onPlace={() => handleAssignProduct(product)}
              />
            ))}
          </div>

          {filteredUnassigned.length === 0 && (
            <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              {searchQuery
                ? "No unassigned products match your filter."
                : "Every catalog product has a physical placement."}
            </div>
          )}

          {filteredArchivedOnly.length > 0 && (
            <div className="space-y-3">
              <div className="bg-card rounded-lg border p-4">
                <h3 className="text-sm font-semibold">
                  In archived storage ({filteredArchivedOnly.length})
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  These products are placed only in an archived area, so they do
                  not appear in any active rack. Restore the area, or place them
                  somewhere active.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredArchivedOnly.map(({ product, areaIds }) => (
                  <UnassignedCard
                    key={product.id}
                    product={product}
                    vendor={vendorMap.get(product.vendorId) ?? "—"}
                    category={
                      product.categoryId
                        ? (categoryMap.get(product.categoryId) ?? "—")
                        : "—"
                    }
                    stock={getProductStatus(product.id)}
                    canPlace={activeAreas.length > 0}
                    note={`In archived: ${areaIds
                      .map((id) => areaById.get(id)?.name ?? "area")
                      .join(", ")}`}
                    onOpen={() => onSelectProduct(product.id)}
                    onPlace={() => handleAssignProduct(product)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2D. ARCHIVED AREAS (recoverable) */}
      {showingCurrent && selectedAreaId === ARCHIVED && (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border p-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Archived areas
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Archiving keeps an area&apos;s shelves and placements. Restore an
              area to use it again.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archivedAreas.map((area) => {
              const placed = allPlacements.filter(
                (p) => p.storageAreaId === area.id,
              ).length;
              return (
                <li key={area.id}>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold">{area.name}</h3>
                        <Badge tone="neutral" className="text-xs">
                          {STORAGE_AREA_KIND_LABELS[area.kind]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-2 pt-0">
                      <span className="text-muted-foreground text-xs">
                        {placed} placed {placed === 1 ? "item" : "items"}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-9 gap-1.5 text-xs"
                        onClick={() => handleRestoreArea(area)}
                      >
                        <RotateCcw className="size-3.5" />
                        Restore {area.name}
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          {archivedAreas.length === 0 && (
            <p className="text-muted-foreground text-sm">No archived areas.</p>
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
          selectedAreaId !== ALL_AREAS &&
          selectedAreaId !== UNASSIGNED &&
          selectedAreaId !== ARCHIVED
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
          selectedAreaId !== ALL_AREAS &&
          selectedAreaId !== UNASSIGNED &&
          selectedAreaId !== ARCHIVED
            ? selectedAreaId
            : activeAreas[0]?.id
        }
        defaultShelfId={defaultShelfForMove}
        areas={activeAreas}
        shelves={allShelves}
        placements={allPlacements}
        products={activeProducts}
        run={run}
      />
    </div>
  );
}

function UnassignedCard({
  product,
  vendor,
  category,
  stock,
  canPlace,
  note,
  onOpen,
  onPlace,
}: {
  product: ProductView;
  vendor: string;
  category: string;
  stock: { status: StockStatus; onHand: number };
  canPlace: boolean;
  note?: string;
  onOpen: () => void;
  onPlace: () => void;
}) {
  return (
    <div className="bg-card hover:border-primary/50 flex flex-col justify-between rounded-md border p-4 shadow-xs">
      <div>
        <div className="flex items-center justify-between gap-2 pb-2">
          <Badge tone="neutral" className="text-xs">
            {category}
          </Badge>
          <StatusBadge status={stock.status} />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-foreground min-h-11 text-left text-sm font-medium hover:underline"
        >
          {product.name}
        </button>
        <div className="text-muted-foreground mt-0.5 text-xs">
          {product.size ? `${product.size} · ` : ""}
          {vendor}
        </div>
        {note ? (
          <div className="text-muted-foreground mt-1 text-[11px]">{note}</div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-foreground text-xs font-semibold">
          {formatQuantity(stock.onHand)} on hand
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={onPlace}
          disabled={!canPlace}
          className="min-h-9 gap-1 text-xs"
        >
          <Plus className="size-3" />
          <span>Place on Shelf</span>
        </Button>
      </div>
    </div>
  );
}
