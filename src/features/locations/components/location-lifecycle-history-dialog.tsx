"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Location } from "@/features/locations/domain/location";
import {
  describeLifecycleAction,
  describeLifecycleStatus,
  type LocationLifecycleEvent,
} from "@/features/locations/domain/location-lifecycle";
import type { LocationLifecycleSource } from "./location-lifecycle-source";

export interface LocationLifecycleHistoryDialogProps {
  readonly source: LocationLifecycleSource;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly location: Location;
  readonly onClose: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function LocationLifecycleHistoryDialog({
  source,
  organizationId,
  organizationName,
  location,
  onClose,
}: LocationLifecycleHistoryDialogProps) {
  const [events, setEvents] = React.useState<LocationLifecycleEvent[] | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setEvents(null);
      try {
        const res = await source.loadHistory(organizationId, location);
        if (cancelled) return;
        if (res.ok) setEvents(res.data);
        else setError(res.error);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load history.",
        );
      }
    }
    void Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
  }, [source, organizationId, location, reloadKey]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${location.name} history`}
      description={`Lifecycle changes for this branch of ${organizationName}`}
      className="max-w-[min(94vw,36rem)]"
    >
      <div className="space-y-3" data-testid="lifecycle-history">
        {error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 space-y-2 rounded-xl border p-3 text-sm"
          >
            <p className="text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          </div>
        ) : events === null ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading history…
          </p>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No lifecycle changes have been recorded for this location.
          </p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="border-border rounded-xl border p-3 text-sm"
              >
                <p className="text-foreground font-medium">
                  {describeLifecycleAction(event.action)}:{" "}
                  {describeLifecycleStatus(event.previousState)} →{" "}
                  {describeLifecycleStatus(event.newState)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatWhen(event.changedAt)}
                </p>
                <p className="text-foreground mt-1.5">{event.reason}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="border-border flex justify-end border-t pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
