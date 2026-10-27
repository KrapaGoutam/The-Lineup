"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import type { Designation } from "@/features/auth/domain/passcode";
import { base64ToBlob } from "@/lib/download-file";
import { EXPORT_MIME, sheetToCsv } from "@/lib/export/document";
import { readWorkbookBrowser } from "@/lib/xlsx/read-browser";
import { workbookToBlob } from "@/lib/xlsx/write-browser";
import { readWorkbook } from "@/lib/xlsx/workbook";

import {
  exportDataAction,
  getHistoryAction,
} from "../actions/inventory-actions";
import {
  commitImportAction,
  listImportBatchesAction,
  readWorkbookAction,
  previewImportAction,
} from "../actions/import-actions";
import type { ImportField } from "../domain/import-columns";
import { applyStagedPlanDemo } from "../domain/import-demo";
import { planImport, prepareCommit } from "../domain/import-run";
import type { ImportApi } from "./import-view";
import { prepareExport } from "../domain/exports";
import { isInventoryManager } from "../domain/inventory-types";
import {
  useCatalogController,
  type DemoCatalogBinding,
} from "../hooks/use-catalog-controller";
import { useInventoryRealtime } from "../hooks/use-inventory-realtime";
import { useOrderDrafts } from "../hooks/use-order-drafts";
import {
  vendorDraftTargets,
  type VendorDraftTarget,
} from "../domain/order-draft-view";
import { AnalyticsView } from "./analytics-view";
import { DashboardView } from "./dashboard-view";
import { HistoryView, type HistoryLoad } from "./history-view";
import type { DraftGuard } from "./order-draft-editor";
import { OrderDraftsView } from "./order-drafts-view";
import type { OrderDraftCta } from "./order-soon";
import { type RunExport } from "./export-control";
import { InventoryView } from "./inventory-view";
import {
  dropForeignTableState,
  writeTableState,
} from "./table-kit/filterable-table";
import { ManageView } from "./manage-view";
import { TableSkeleton } from "./table-kit/empty-state";

type View =
  | "dashboard"
  | "inventory"
  | "drafts"
  | "manage"
  | "history"
  | "analytics";

const VIEW_NAMES: Record<View, string> = {
  dashboard: "Dashboard",
  inventory: "Inventory",
  drafts: "Order Drafts",
  manage: "Manage",
  history: "History",
  analytics: "Analytics",
};

const VIEWS: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "drafts", label: "Order Drafts" },
  { id: "manage", label: "Manage" },
];

type Props = {
  restaurantSlug: string;
  user: { profileId: string; name: string; designation: Designation };
  /** Present in demo mode only; real mode reads and writes the database. */
  demo: DemoCatalogBinding | null;
  /** The location's time zone: dates and date filters are shown in it. */
  timeZone: string;
  /** The location whose stock changes are listened for (real mode). */
  locationId?: string | null;
  onSessionInvalid?: () => void;
};

/**
 * Bar Inventory. Mounts the catalog controller only while the tab is open
 * (hooks cannot live behind the app shell's signed-out early returns).
 * Leaving the tab and coming back re-reads from the database.
 */
export function InventoryModule(props: Props) {
  // Managers only (owner decision D1). The database refuses everyone else
  // too; this keeps staff from even mounting the module.
  if (!isInventoryManager(props.user.designation)) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-sm">
            Bar Inventory is not available for your role.
          </p>
        </CardContent>
      </Card>
    );
  }
  return <ManagerInventory {...props} />;
}

function ManagerInventory({
  restaurantSlug,
  user,
  demo,
  timeZone,
  locationId = null,
  onSessionInvalid,
}: Props) {
  const viewer = useMemo(
    () => ({
      profileId: user.profileId,
      name: user.name,
      designation: user.designation,
    }),
    [user.profileId, user.name, user.designation],
  );
  const controller = useCatalogController({
    demo,
    restaurantSlug,
    viewer,
    onSessionInvalid,
  });
  // Realtime = invalidation only: any change to a count or the ledger makes
  // the controller re-read the snapshot (quietly, folded into one read). The
  // views that read the ledger follow the snapshot, so they refresh with it.
  const refresh = controller.refresh;
  useInventoryRealtime({
    enabled: !demo,
    userId: user.profileId,
    locationId,
    onInvalidate: () => void refresh({ background: true }),
  });
  // Vendor Order Drafts: the data layer, the draft on screen, and a guard that
  // stops anyone leaving unsaved edits without choosing what happens to them.
  const orderDrafts = useOrderDrafts({
    demo,
    restaurantSlug,
    viewer,
    onSessionInvalid,
  });
  const reloadDrafts = orderDrafts.api.reload;
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const draftGuard = useRef<DraftGuard | null>(null);
  const registerGuard = useCallback((guard: DraftGuard | null) => {
    draftGuard.current = guard;
  }, []);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const navigate = useCallback((go: () => void) => {
    if (draftGuard.current?.dirty) {
      setLeaveError(null);
      setPendingNav(() => go);
    } else {
      go();
    }
  }, []);
  const [view, setView] = useState<View>("dashboard");
  // Opening the tab shows what the database holds now (like leaving and
  // coming back to Bar Inventory).
  useEffect(() => {
    if (view === "drafts") void reloadDrafts();
  }, [view, reloadDrafts]);
  // History and Analytics are reached from Inventory and the Dashboard and go
  // back to them, so that is the tab that is "current" while they are open.
  const currentTab: View =
    view === "history"
      ? "inventory"
      : view === "analytics"
        ? "dashboard"
        : view;
  // A control that switches the view (a tile, "Back") unmounts with the old
  // view, which would drop keyboard and screen-reader focus to the page top.
  // When that happens, focus the new view's region, which announces its name.
  const viewRegion = useRef<HTMLDivElement>(null);
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body) {
      viewRegion.current?.focus({ preventScroll: true });
    }
  }, [view]);
  const snapshot = controller.snapshot;
  // History comes from the immutable ledger. Demo keeps its ledger in memory;
  // real mode reads it from the database under the caller's own access.
  //
  // `loadHistory` must keep one identity: the app shell re-renders every
  // second (the clock) and rebuilds `demo`, and a new function each time
  // would make every view re-read the ledger each second. It reads the latest
  // values through a ref, updated in a layout effect so it is current before
  // any view's fetch effect runs.
  const latest = useRef({
    demo,
    snapshot,
    restaurantSlug,
    timeZone,
    onSessionInvalid,
    actorName: user.name,
  });
  useLayoutEffect(() => {
    latest.current = {
      demo,
      snapshot,
      restaurantSlug,
      timeZone,
      onSessionInvalid,
      actorName: user.name,
    };
  });
  const loadHistory = useCallback(
    async (days: number, productId: string | null): Promise<HistoryLoad> => {
      const { demo, snapshot, restaurantSlug, onSessionInvalid } =
        latest.current;
      if (demo) {
        const since = days === 0 ? 0 : Date.now() - days * 86_400_000;
        const all = (snapshot?.ledger ?? []).filter(
          (entry) =>
            (!productId || entry.productId === productId) &&
            Date.parse(entry.at) >= since,
        );
        const newest = all.toReversed();
        return {
          ok: true,
          entries: productId ? newest.slice(0, 25) : newest,
          truncated: false,
        };
      }
      const result = await getHistoryAction({
        restaurantSlug,
        days,
        productId,
      });
      if (!result.ok && result.sessionInvalid) onSessionInvalid?.();
      return result;
    },
    [],
  );
  // Exports. Demo has no server, so it builds the file here from the in-memory
  // catalog (the .xlsx writer is loaded only when asked for); real mode asks
  // the server, which re-applies the filters to the authorized rows. One
  // identity, like `loadHistory`.
  const runExport = useCallback<RunExport>(async (request, format) => {
    const { demo, snapshot, restaurantSlug, timeZone, onSessionInvalid } =
      latest.current;
    if (demo) {
      if (!snapshot) return { ok: false, error: "Nothing to export yet." };
      const file = prepareExport(
        request,
        { catalog: snapshot, entries: snapshot.ledger ?? [] },
        { timeZone, now: new Date(), slug: restaurantSlug },
        format,
      );
      return {
        ok: true,
        filename: file.filename,
        mime: EXPORT_MIME[format],
        data:
          format === "csv"
            ? sheetToCsv(file.document.csv)
            : await workbookToBlob(file.document.sheets),
      };
    }
    const result = await exportDataAction({
      restaurantSlug,
      format,
      request,
    });
    if (!result.ok) {
      if (result.sessionInvalid) onSessionInvalid?.();
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      filename: result.filename,
      mime: result.mime,
      data:
        result.encoding === "base64"
          ? base64ToBlob(result.content, result.mime)
          : result.content,
    };
  }, []);
  // Imports. Demo has no server: it plans and commits here, with the same pure
  // functions the server action uses. Real mode asks the server, which
  // re-plans the file against the database and commits atomically. One
  // identity, like `loadHistory`.
  const importApi = useMemo<ImportApi>(
    () => ({
      async preview(request) {
        const { demo, restaurantSlug, onSessionInvalid } = latest.current;
        if (demo) return planImport(request, demo.state);
        const result = await previewImportAction({
          restaurantSlug,
          ...request,
          mapping: request.mapping as Record<string, ImportField | null>,
        });
        if (!result.ok && result.sessionInvalid) onSessionInvalid?.();
        return result;
      },
      async readWorkbook({ base64, sheet }) {
        const { demo, restaurantSlug, onSessionInvalid } = latest.current;
        if (demo) {
          // Demo has no server: the same guard and reader run here, the
          // browser build of the reader loaded only now.
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          return readWorkbook(bytes, readWorkbookBrowser, { sheet });
        }
        const result = await readWorkbookAction({
          restaurantSlug,
          base64,
          sheet,
        });
        if (!result.ok && result.sessionInvalid) onSessionInvalid?.();
        return result;
      },
      async commit(request) {
        const { demo, restaurantSlug, onSessionInvalid, actorName } =
          latest.current;
        if (demo) {
          const already = demo.state.importBatches?.find(
            (b) => b.id === request.requestId,
          );
          if (already) {
            return {
              ok: true,
              batchId: already.id,
              result: {
                created: already.created,
                updated: already.updated,
                skipped: already.skipped,
                errors: already.errors,
                vendors_created: already.vendorsCreated,
                categories_created: already.categoriesCreated,
                subcategories_created: already.subcategoriesCreated,
                ledger_rows: 0,
                already: true,
              },
            };
          }
          const prep = prepareCommit(
            request,
            { excluded: request.excluded, approved: request.approved },
            request.fingerprint,
            demo.state,
          );
          if (!prep.ok)
            return { ok: false, kind: prep.kind, error: prep.error };
          const applied = applyStagedPlanDemo(demo.state, prep.staged, {
            ctx: {
              actorName,
              now: new Date(),
              newId: () => crypto.randomUUID(),
            },
            reason: request.reason,
            batch: {
              id: request.requestId,
              filename: request.filename,
              format: request.format,
              sheet: request.sheet,
            },
          });
          if ("conflicts" in applied) {
            return {
              ok: false,
              kind: "conflict",
              conflicts: applied.conflicts,
              error:
                "Some items changed since you previewed this file, so nothing was imported. Preview it again.",
            };
          }
          if (!applied.ok) {
            return { ok: false, kind: "error", error: applied.error };
          }
          demo.setState(applied.state);
          return {
            ok: true,
            batchId: request.requestId,
            result: applied.result,
          };
        }
        const result = await commitImportAction({
          restaurantSlug,
          ...request,
          mapping: request.mapping as Record<string, ImportField | null>,
        });
        if (!result.ok && "sessionInvalid" in result && result.sessionInvalid) {
          onSessionInvalid?.();
        }
        return result;
      },
      async loadBatches() {
        const { demo, restaurantSlug, onSessionInvalid } = latest.current;
        if (demo) return { ok: true, batches: demo.state.importBatches ?? [] };
        const result = await listImportBatchesAction({ restaurantSlug });
        if (!result.ok && result.sessionInvalid) onSessionInvalid?.();
        return result;
      },
    }),
    [],
  );
  const onImported = useCallback(() => {
    if (!latest.current.demo) void controller.refresh();
  }, [controller]);
  // Dashboard → Order soon: Create Order Draft / Open Order Draft. The draft is
  // always opened through the database's open-or-reuse call, never duplicated.
  const draftApi = orderDrafts.api;
  const draftList = orderDrafts.drafts;
  const draftCta = useMemo<OrderDraftCta | null>(() => {
    if (!snapshot || draftList === null) return null;
    return {
      targets: vendorDraftTargets(snapshot.vendors, draftList),
      open: async (target: VendorDraftTarget) => {
        if (target.draftId) {
          setSelectedDraftId(target.draftId);
          setView("drafts");
          return null;
        }
        const result = await draftApi.open(target.vendorId);
        if (!result.ok) return result.error;
        setSelectedDraftId(result.draftId);
        setView("drafts");
        return null;
      },
    };
  }, [snapshot, draftList, draftApi]);
  // Runs once, before any table reads its URL state.
  useState(() => dropForeignTableState(restaurantSlug));

  return (
    <div
      className="flex w-full max-w-full min-w-0 flex-col gap-4"
      data-testid="bar-inventory"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Bar Inventory</h1>
        {demo ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!controller.loading) void controller.refresh();
            }}
            // aria-disabled, not disabled: a disabled button drops keyboard focus.
            aria-disabled={controller.loading}
            className={controller.loading ? "opacity-60" : undefined}
          >
            {controller.loading ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Bar Inventory views"
        className="border-border bg-muted/30 flex w-full max-w-full gap-1 overflow-x-auto rounded-lg border p-1 sm:w-fit"
      >
        {VIEWS.map(({ id, label }) => (
          <Button
            key={id}
            role="tab"
            aria-selected={currentTab === id}
            variant={currentTab === id ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0"
            onClick={() => navigate(() => setView(id))}
          >
            {label}
          </Button>
        ))}
      </div>

      {controller.loadError && controller.snapshot ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {controller.loadError} Showing the last information we loaded.
        </p>
      ) : null}

      <div
        ref={viewRegion}
        role="region"
        aria-label={`${VIEW_NAMES[view]} view`}
        tabIndex={-1}
        className="flex w-full max-w-full min-w-0 flex-col gap-4 outline-none"
      >
        {controller.loadError && !controller.snapshot ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-6">
              <p role="alert" className="text-destructive text-sm">
                {controller.loadError}
              </p>
              <Button
                variant="secondary"
                onClick={() => void controller.refresh()}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : !controller.snapshot ? (
          <div>
            <p className="sr-only" role="status">
              Loading Bar Inventory…
            </p>
            <TableSkeleton />
          </div>
        ) : view === "manage" ? (
          <ManageView
            snapshot={controller.snapshot}
            run={controller.run}
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            imports={importApi}
            onImported={onImported}
          />
        ) : view === "drafts" ? (
          <OrderDraftsView
            snapshot={controller.snapshot}
            drafts={orderDrafts.drafts}
            loading={orderDrafts.loading}
            loadError={orderDrafts.loadError}
            api={orderDrafts.api}
            selectedDraftId={selectedDraftId}
            onSelectDraft={setSelectedDraftId}
            onGuard={registerGuard}
            navigate={navigate}
            viewerName={user.name}
            timeZone={timeZone}
          />
        ) : view === "inventory" ? (
          <InventoryView
            snapshot={controller.snapshot}
            run={controller.run}
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            loadHistory={loadHistory}
            onOpenHistory={() => setView("history")}
            runExport={runExport}
          />
        ) : view === "analytics" ? (
          <AnalyticsView
            snapshot={controller.snapshot}
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            load={loadHistory}
            onBack={() => setView("dashboard")}
            runExport={runExport}
          />
        ) : view === "history" ? (
          <HistoryView
            snapshot={controller.snapshot}
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            load={loadHistory}
            onBack={() => setView("inventory")}
            runExport={runExport}
          />
        ) : (
          <DashboardView
            snapshot={controller.snapshot}
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            runExport={runExport}
            onOpenHistory={() => setView("history")}
            onOpenAnalytics={() => setView("analytics")}
            loadHistory={loadHistory}
            draftCta={draftCta}
            onOpenInventory={(state) => {
              // The Inventory table reads its filters from the URL when it mounts.
              writeTableState("inv", restaurantSlug, state);
              setView("inventory");
            }}
          />
        )}
      </div>

      <Dialog
        open={pendingNav !== null}
        onClose={() => {
          if (!leaving) setPendingNav(null);
        }}
        title="You have unsaved changes"
        description="This order draft has changes that haven't been saved."
      >
        {leaveError ? (
          <p role="alert" className="text-destructive text-sm">
            {leaveError}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingNav(null)}>
            Stay
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const go = pendingNav;
              setPendingNav(null);
              go?.();
            }}
          >
            Discard changes
          </Button>
          <Button
            aria-disabled={leaving}
            onClick={async () => {
              if (leaving) return;
              setLeaving(true);
              setLeaveError(null);
              const saved = (await draftGuard.current?.save()) ?? true;
              setLeaving(false);
              if (saved) {
                const go = pendingNav;
                setPendingNav(null);
                go?.();
              } else {
                setLeaveError(
                  "Your changes weren't saved. Fix the problem in the draft, or discard them.",
                );
              }
            }}
          >
            {leaving ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
