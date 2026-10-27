"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Designation } from "@/features/auth/domain/passcode";

import { isInventoryManager } from "../domain/inventory-types";
import {
  useCatalogController,
  type DemoCatalogBinding,
} from "../hooks/use-catalog-controller";
import { InventoryView } from "./inventory-view";
import { dropForeignTableState } from "./table-kit/filterable-table";
import { ManageView } from "./manage-view";
import { TableSkeleton } from "./table-kit/empty-state";

type View = "dashboard" | "inventory" | "manage";

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
  const [view, setView] = useState<View>("inventory");
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
        />
      ) : (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              The Dashboard (what to order and from whom) arrives in the next
              step of the build. Counts and levels are under Inventory.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
