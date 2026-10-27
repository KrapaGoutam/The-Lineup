"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Designation } from "@/features/auth/domain/passcode";
import { base64ToBlob } from "@/lib/download-file";
import { EXPORT_MIME, sheetToCsv } from "@/lib/export/document";
import { workbookToBlob } from "@/lib/xlsx/write-browser";

import {
  exportDataAction,
  getHistoryAction,
} from "../actions/inventory-actions";
import { prepareExport } from "../domain/exports";
import { isInventoryManager } from "../domain/inventory-types";
import {
  useCatalogController,
  type DemoCatalogBinding,
} from "../hooks/use-catalog-controller";
import { AnalyticsView } from "./analytics-view";
import { DashboardView } from "./dashboard-view";
import { HistoryView, type HistoryLoad } from "./history-view";
import { type RunExport } from "./export-control";
import { InventoryView } from "./inventory-view";
import {
  dropForeignTableState,
  writeTableState,
} from "./table-kit/filterable-table";
import { ManageView } from "./manage-view";
import { TableSkeleton } from "./table-kit/empty-state";

type View = "dashboard" | "inventory" | "manage" | "history" | "analytics";

const VIEWS: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "manage", label: "Manage" },
];

type Props = {
  restaurantSlug: string;
  user: { profileId: string; name: string; designation: Designation };
  /** Present in demo mode only; real mode reads and writes the database. */
  demo: DemoCatalogBinding | null;
  /** The location's time zone: dates and date filters are shown in it. */
  timeZone: string;
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
  const [view, setView] = useState<View>("dashboard");
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
  });
  useLayoutEffect(() => {
    latest.current = {
      demo,
      snapshot,
      restaurantSlug,
      timeZone,
      onSessionInvalid,
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
            onClick={() => void controller.refresh()}
            disabled={controller.loading}
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
            aria-selected={view === id}
            variant={view === id ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0"
            onClick={() => setView(id)}
          >
            {label}
          </Button>
        ))}
      </div>

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
          onOpenInventory={(state) => {
            // The Inventory table reads its filters from the URL when it mounts.
            writeTableState("inv", restaurantSlug, state);
            setView("inventory");
          }}
        />
      )}
    </div>
  );
}
