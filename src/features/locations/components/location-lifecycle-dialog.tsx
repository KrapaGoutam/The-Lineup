"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Location } from "@/features/locations/domain/location";
import {
  LIFECYCLE_REASON_MAX_LENGTH,
  archiveConfirmationMatches,
  describeLifecycleAction,
  evaluateLocationLifecycle,
  formatBlockedHeadline,
  formatLifecycleBlockers,
  formatRetainedSummary,
  getLocationLifecycleStatus,
  validateLifecycleReason,
  validateLifecycleTransition,
  type LifecycleBlocker,
  type LocationLifecycleAction,
  type LocationLifecycleReadiness,
} from "@/features/locations/domain/location-lifecycle";
import { LocationLifecycleBadge } from "./location-lifecycle-badge";
import type { LocationLifecycleSource } from "./location-lifecycle-source";

const IMPACT_TEXT: Readonly<Record<LocationLifecycleAction, string>> = {
  deactivate:
    "No new staff assignments, service sessions, schedules, tasks, tip pools or inventory activity can start at this location. Existing staff assignments, schedules, shifts, tips, payroll and inventory history are kept. Other locations are not affected.",
  reactivate:
    "The location accepts new operational work again. Nothing is restored automatically: removed staff assignments, closed sessions, old tasks and past schedules stay exactly as they are.",
  archive:
    "Archiving keeps every record and the location ID for history and reporting. An archived location accepts no operational work and cannot be reactivated directly: it must first be restored from the archive.",
  restore_archive:
    "The location returns to Inactive. It still accepts no operational work until it is reactivated as a separate step.",
};

const CONFIRM_LABEL: Readonly<Record<LocationLifecycleAction, string>> = {
  deactivate: "Deactivate location",
  reactivate: "Reactivate location",
  archive: "Archive location",
  restore_archive: "Restore from archive",
};

const PENDING_LABEL: Readonly<Record<LocationLifecycleAction, string>> = {
  deactivate: "Deactivating…",
  reactivate: "Reactivating…",
  archive: "Archiving…",
  restore_archive: "Restoring…",
};

const RESOLVE_NOUN: Readonly<Record<LocationLifecycleAction, string>> = {
  deactivate: "deactivation",
  reactivate: "reactivation",
  archive: "archiving",
  restore_archive: "restoring",
};

export interface LocationLifecycleDialogProps {
  readonly source: LocationLifecycleSource;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly location: Location;
  readonly action: LocationLifecycleAction;
  readonly onClose: () => void;
  /** Called once the backend (or demo) confirmed the transition. */
  readonly onCompleted: (updated: Location) => void;
  /** Called when the location changed underneath the dialog (stale state). */
  readonly onStale?: () => void;
}

function BlockerList({
  blockers,
}: {
  readonly blockers: readonly LifecycleBlocker[];
}) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {formatLifecycleBlockers(blockers).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function LocationLifecycleDialog({
  source,
  organizationId,
  organizationName,
  location,
  action,
  onClose,
  onCompleted,
  onStale,
}: LocationLifecycleDialogProps) {
  const needsReadiness = action === "deactivate" || action === "archive";
  const status = getLocationLifecycleStatus(location);
  const transition = validateLifecycleTransition(status, action);

  const [readiness, setReadiness] =
    React.useState<LocationLifecycleReadiness | null>(null);
  const [loading, setLoading] = React.useState(needsReadiness);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [reason, setReason] = React.useState("");
  const [typedName, setTypedName] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [serverBlockers, setServerBlockers] = React.useState<
    readonly LifecycleBlocker[]
  >([]);

  const reasonId = React.useId();
  const reasonErrorId = React.useId();
  const nameId = React.useId();
  const nameErrorId = React.useId();

  React.useEffect(() => {
    if (!needsReadiness) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await source.loadReadiness(organizationId, location);
        if (cancelled) return;
        if (res.ok) {
          setReadiness(res.data);
        } else {
          setReadiness(null);
          setLoadError(res.error);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Failed to load lifecycle status.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
  }, [source, organizationId, location, needsReadiness, reloadKey]);

  const evaluation = readiness
    ? evaluateLocationLifecycle(readiness, action)
    : null;
  const hardBlockers =
    serverBlockers.length > 0
      ? serverBlockers
      : (evaluation?.hardBlockers ?? []);
  const warnings = evaluation?.warnings ?? [];
  const blocked = hardBlockers.length > 0;

  const reasonCheck = validateLifecycleReason(reason);
  const nameOk =
    action !== "archive" ||
    archiveConfirmationMatches(location.name, typedName);
  const readinessPending = needsReadiness && (loading || Boolean(loadError));
  const confirmDisabled =
    submitting || stale || readinessPending || blocked || !transition.valid;

  const retainedLines = readiness
    ? formatRetainedSummary(readiness.retained)
    : [];

  async function handleConfirm() {
    setAttempted(true);
    setSubmitError(null);
    if (!reasonCheck.valid || !nameOk) return;

    setSubmitting(true);
    try {
      const res = await source.transition({
        organizationId,
        location,
        action,
        reason: reason.trim(),
      });
      if (res.ok) {
        onCompleted(res.data);
        return;
      }
      if (res.kind === "BLOCKED" && res.blockers && res.blockers.length > 0) {
        setServerBlockers(res.blockers);
        setSubmitError(null);
      } else if (res.kind === "STATE_CONFLICT") {
        setStale(true);
        setSubmitError(
          "This location changed while you were reviewing it. Refresh to see its current state.",
        );
      } else {
        setSubmitError(res.error);
      }
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "The lifecycle change failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const title = `${describeLifecycleAction(action)} ${location.name}`;

  return (
    <Dialog
      open
      onClose={submitting ? () => undefined : onClose}
      title={title}
      description={`Branch in ${organizationName}`}
      className="max-w-[min(94vw,36rem)]"
    >
      <div className="space-y-4" data-testid="lifecycle-dialog">
        <dl className="border-border bg-muted/30 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border p-3 text-sm">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="text-foreground font-medium">{location.name}</dd>
          <dt className="text-muted-foreground">Organization</dt>
          <dd className="text-foreground font-medium">{organizationName}</dd>
          <dt className="text-muted-foreground">Current state</dt>
          <dd>
            <LocationLifecycleBadge status={status} />
          </dd>
          {transition.nextStatus ? (
            <>
              <dt className="text-muted-foreground">After this change</dt>
              <dd>
                <LocationLifecycleBadge status={transition.nextStatus} />
              </dd>
            </>
          ) : null}
        </dl>

        {!transition.valid ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm"
          >
            {transition.error}
          </div>
        ) : null}

        <p className="text-muted-foreground text-sm">{IMPACT_TEXT[action]}</p>

        {needsReadiness && loading ? (
          <p
            role="status"
            className="text-muted-foreground text-sm"
            data-testid="lifecycle-loading"
          >
            Checking for unresolved operational work…
          </p>
        ) : null}

        {needsReadiness && loadError ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 space-y-2 rounded-xl border p-3 text-sm"
          >
            <p className="text-destructive">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {blocked ? (
          <div
            role="alert"
            data-testid="lifecycle-blockers"
            className="border-destructive/30 bg-destructive/5 space-y-2 rounded-xl border p-3 text-sm"
          >
            <p className="text-destructive font-semibold">
              {formatBlockedHeadline(location.name, action)}
            </p>
            <BlockerList blockers={hardBlockers} />
            <p className="text-muted-foreground">
              Resolve these items before {RESOLVE_NOUN[action]}. They are never
              closed or cancelled for you.
            </p>
          </div>
        ) : null}

        {!blocked && warnings.length > 0 ? (
          <div
            data-testid="lifecycle-warnings"
            className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
          >
            <p className="font-semibold">These items stay open as they are:</p>
            <BlockerList blockers={warnings} />
            <p>
              Nothing is closed, cancelled or finalized automatically; they can
              still be completed afterwards.
            </p>
          </div>
        ) : null}

        {retainedLines.length > 0 ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid="lifecycle-retained"
          >
            Retained history: {retainedLines.join(", ")}.
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label
            htmlFor={reasonId}
            className="text-foreground text-sm font-medium"
          >
            Reason (required)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={LIFECYCLE_REASON_MAX_LENGTH + 50}
            disabled={submitting || stale}
            aria-invalid={attempted && !reasonCheck.valid}
            aria-describedby={
              attempted && !reasonCheck.valid ? reasonErrorId : undefined
            }
            className="border-input bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 w-full rounded-xl border px-3 py-2 text-sm transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Why is this change being made? Recorded in the audit history."
          />
          {attempted && !reasonCheck.valid ? (
            <p id={reasonErrorId} className="text-destructive text-xs">
              {reasonCheck.errors[0]}
            </p>
          ) : null}
        </div>

        {action === "archive" ? (
          <div className="space-y-1.5">
            <label
              htmlFor={nameId}
              className="text-foreground text-sm font-medium"
            >
              Type <span className="font-semibold">{location.name}</span> to
              confirm
            </label>
            <Input
              id={nameId}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
              disabled={submitting || stale}
              aria-invalid={attempted && !nameOk}
              aria-describedby={attempted && !nameOk ? nameErrorId : undefined}
            />
            {attempted && !nameOk ? (
              <p id={nameErrorId} className="text-destructive text-xs">
                The name does not match. Type {location.name} exactly.
              </p>
            ) : null}
          </div>
        ) : null}

        <div aria-live="polite" className="min-h-0">
          {submitError ? (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm"
            >
              {submitError}
            </div>
          ) : null}
        </div>

        <div className="border-border flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
          {stale ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => (onStale ? onStale() : onClose())}
            >
              Refresh location
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          {!stale ? (
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
              aria-busy={submitting}
            >
              {submitting ? PENDING_LABEL[action] : CONFIRM_LABEL[action]}
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
