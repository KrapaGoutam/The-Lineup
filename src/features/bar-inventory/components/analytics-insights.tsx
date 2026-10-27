"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildItemAnalytics,
  fastestMoving,
  formatRate,
  frequentlyHittingCutoff,
  presetWindow,
  type ItemAnalytics,
} from "../domain/analytics";
import { buildInventoryRows } from "../domain/inventory-rows";
import type { CatalogSnapshot } from "../domain/inventory-types";
import type { LoadHistory } from "./history-view";
import { useLedger } from "./use-ledger";

const TOP = 5;

function InsightCard({
  title,
  empty,
  items,
  detail,
}: {
  title: string;
  empty: string;
  items: ItemAnalytics[];
  detail: (item: ItemAnalytics) => string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <h3 className="font-semibold">{title}</h3>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ol className="divide-border divide-y" aria-label={title}>
            {items.map((item) => (
              <li
                key={item.productId}
                data-testid="insight-item"
                data-name={item.item}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {item.item}
                  {item.size ? ` ${item.size}` : ""}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {detail(item)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The Dashboard's movement insights: the five fastest-moving items and the
 * items that keep falling to their cutoff, over the last 30 days, from the
 * same analytics as the full view. Each says so when the data cannot support
 * a ranking yet.
 */
export function AnalyticsInsights({
  snapshot,
  timeZone,
  load,
  onOpenAnalytics,
}: {
  snapshot: CatalogSnapshot;
  timeZone: string;
  load: LoadHistory;
  onOpenAnalytics: () => void;
}) {
  const ledger = useLedger(load, snapshot);
  const ready = ledger.status === "ready" ? ledger : null;
  const items = useMemo(() => {
    if (!ready) return [];
    const now = new Date();
    return buildItemAnalytics(ready.entries, buildInventoryRows(snapshot), {
      window: presetWindow(30, timeZone, now),
      includeObserved: true,
      includeShrink: false,
      timeZone,
      now,
    });
  }, [ready, snapshot, timeZone]);

  return (
    <section aria-label="Movement insights" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Movement, last 30 days</h2>
        <Button variant="ghost" onClick={onOpenAnalytics}>
          See analytics
        </Button>
      </div>
      {ledger.status === "loading" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading movement…
        </p>
      ) : ledger.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {ledger.error}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <InsightCard
            title="Fastest moving"
            items={fastestMoving(items).slice(0, TOP)}
            empty="Not enough history yet. Rankings appear once an item has 3 or more recorded uses and at least 2 weeks of history."
            detail={(i) => `${formatRate(i.perDay)}/day`}
          />
          <InsightCard
            title="Frequently hitting cutoff"
            items={frequentlyHittingCutoff(items).slice(0, TOP)}
            empty="No item has fallen to its cutoff twice or more in the last 30 days."
            detail={(i) => `${i.cutoffHits}× in the period`}
          />
        </div>
      )}
    </section>
  );
}
