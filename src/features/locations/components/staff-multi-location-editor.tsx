"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import {
  DEFAULT_LOCATION_ROLE,
  buildAssignmentChangeSet,
  describeChange,
  locationRoleLabel,
  type AssignableLocation,
  type DesiredLocationAssignment,
  type StaffRosterMember,
} from "@/features/locations/domain/staff-assignment";
import type { LocationAssignmentChangeInput } from "@/features/auth/domain/location-assignment";
import { LocationRoleSelect } from "./location-role-select";

const DANGER_BUTTON =
  "border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10";

export interface StaffMultiLocationEditorProps {
  readonly member: StaffRosterMember;
  readonly locations: readonly AssignableLocation[];
  /** Persisted baseline, already restricted to the administered organization. */
  readonly baseline: readonly LocationRoleAssignment[];
  readonly onSave: (
    changes: readonly LocationAssignmentChangeInput[],
  ) => Promise<{ readonly ok: boolean; readonly error?: string }>;
  readonly onCancel: () => void;
  /** Reports whether unsaved changes exist so a host dialog can guard closing. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Increment to ask the editor to show its discard confirmation (host close). */
  readonly discardRequest?: number;
}

interface DraftEntry {
  readonly assigned: boolean;
  readonly role: LocationRole;
}

function initialDraft(
  locations: readonly AssignableLocation[],
  baseline: readonly LocationRoleAssignment[],
): Record<string, DraftEntry> {
  const draft: Record<string, DraftEntry> = {};
  for (const loc of locations) {
    const current = baseline.find((a) => a.locationId === loc.id);
    draft[loc.id] = {
      assigned: Boolean(current?.active),
      role: current?.role ?? DEFAULT_LOCATION_ROLE,
    };
  }
  return draft;
}

/**
 * Employee-centric editor: one person, many locations, one atomic change set.
 * Only locations the user actually changes appear in the submitted payload;
 * untouched or off-screen locations are never deactivated implicitly.
 */
export function StaffMultiLocationEditor({
  member,
  locations,
  baseline,
  onSave,
  onCancel,
  onDirtyChange,
  discardRequest = 0,
}: StaffMultiLocationEditorProps) {
  const sortedLocations = React.useMemo(
    () =>
      [...locations].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }),
    [locations],
  );

  const [draft, setDraft] = React.useState(() =>
    initialDraft(locations, baseline),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  const [dismissedDiscardRequest, setDismissedDiscardRequest] =
    React.useState(0);

  const desired: DesiredLocationAssignment[] = sortedLocations.map((loc) => ({
    locationId: loc.id,
    assigned: draft[loc.id]?.assigned ?? false,
    role: draft[loc.id]?.role ?? DEFAULT_LOCATION_ROLE,
  }));
  const changeSet = buildAssignmentChangeSet({
    baseline,
    desired,
    editableLocations: locations,
  });
  const changes = changeSet.success ? changeSet.changes : [];
  const dirty = changes.length > 0;
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // A host-initiated close request (discardRequest increments) shows the same
  // confirmation as the Cancel button; derived during render, no effect needed.
  const showDiscardConfirm =
    confirmingDiscard || discardRequest > dismissedDiscardRequest;

  const removals = changes.filter((c) => c.action === "deactivate");
  const nameOf = (id: string) =>
    locations.find((l) => l.id === id)?.name ?? "this location";

  function updateDraft(locationId: string, patch: Partial<DraftEntry>) {
    setError(null);
    setConfirmingRemoval(false);
    setDraft((prev) => ({
      ...prev,
      [locationId]: { ...prev[locationId], ...patch },
    }));
  }

  async function submit() {
    if (!changeSet.success || changes.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSave(changes);
      if (!res.ok) {
        // Preserve the draft so the user can retry without re-entering anything.
        setError(res.error ?? "Failed to save assignments.");
        setConfirmingRemoval(false);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Network error. Your changes were not saved.",
      );
      setConfirmingRemoval(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveClick() {
    if (removals.length > 0 && !confirmingRemoval) {
      setConfirmingRemoval(true);
      return;
    }
    void submit();
  }

  function handleCancelClick() {
    if (dirty && !showDiscardConfirm) {
      setConfirmingDiscard(true);
      return;
    }
    onCancel();
  }

  const memberInactive = !member.membershipActive;

  return (
    <form
      className="space-y-4"
      aria-label={`Location assignments for ${member.displayName}`}
      onSubmit={(e) => {
        e.preventDefault();
        handleSaveClick();
      }}
    >
      {memberInactive && (
        <p
          role="note"
          className="border-warn/30 bg-warn/10 text-warn rounded-xl border p-3 text-xs font-medium"
        >
          Organization membership inactive. This employee cannot be assigned or
          reactivated until their organization membership is active. Existing
          assignments can still be removed.
        </p>
      )}

      <ul className="space-y-2" aria-label="Locations">
        {sortedLocations.map((loc) => {
          const entry = draft[loc.id];
          const current = baseline.find((a) => a.locationId === loc.id);
          const baseId = `staff-${member.profileId}-${loc.id}`;

          if (!loc.active) {
            return (
              <li
                key={loc.id}
                data-testid={`assignment-row-${loc.id}`}
                className="border-border bg-muted/30 rounded-xl border p-3"
              >
                <p className="text-foreground text-sm font-medium">
                  {loc.name}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Inactive location — assignments are read-only.
                  {current
                    ? ` Historical role: ${locationRoleLabel(current.role)}${current.active ? "" : " (inactive)"}.`
                    : ""}
                </p>
              </li>
            );
          }

          const canToggleOn = !memberInactive;
          const checkboxDisabled =
            submitting || (!entry.assigned && !canToggleOn);
          const wasInactive = current && !current.active;

          return (
            <li
              key={loc.id}
              data-testid={`assignment-row-${loc.id}`}
              className="border-border grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end"
            >
              <div className="min-w-0 space-y-1">
                <label
                  htmlFor={`${baseId}-assigned`}
                  className="text-foreground flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"
                >
                  <input
                    id={`${baseId}-assigned`}
                    type="checkbox"
                    className="accent-primary size-5 shrink-0"
                    checked={entry.assigned}
                    disabled={checkboxDisabled}
                    onChange={(e) =>
                      updateDraft(loc.id, { assigned: e.target.checked })
                    }
                  />
                  <span className="truncate">{loc.name}</span>
                </label>
                <p className="text-muted-foreground pl-7 text-xs">
                  {current?.active
                    ? "Currently assigned"
                    : wasInactive
                      ? "Inactive assignment (will be reactivated if checked)"
                      : "Not assigned"}
                </p>
              </div>
              <LocationRoleSelect
                id={`${baseId}-role`}
                label={`Location role at ${loc.name}`}
                value={entry.role}
                disabled={!entry.assigned || submitting}
                onChange={(role) => updateDraft(loc.id, { role })}
              />
            </li>
          );
        })}
      </ul>

      {dirty && (
        <div
          data-testid="pending-changes"
          className="border-border bg-muted/30 rounded-xl border p-3"
        >
          <p className="text-foreground text-xs font-semibold">
            Pending changes ({changes.length})
          </p>
          <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {changes.map((c) => (
              <li key={c.locationId}>
                {describeChange(c, nameOf(c.locationId))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!changeSet.success && (
        <p role="alert" className="text-destructive text-xs font-medium">
          {changeSet.error}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-xs font-medium"
        >
          {error}
        </p>
      )}

      {confirmingRemoval && removals.length > 0 && (
        <div
          role="alertdialog"
          aria-labelledby="confirm-removal-title"
          className="border-warn/30 bg-warn/10 space-y-2 rounded-xl border p-3"
        >
          <p id="confirm-removal-title" className="text-sm font-semibold">
            Confirm removal of assigned access
          </p>
          <p className="text-xs">
            Remove this employee&apos;s assigned access to{" "}
            {removals.map((r) => nameOf(r.locationId)).join(", ")}? Their
            organization membership and assignments to other locations will
            remain unchanged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={DANGER_BUTTON}
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Saving..." : "Confirm and Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={submitting}
              onClick={() => setConfirmingRemoval(false)}
            >
              Go Back
            </Button>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <div
          role="alertdialog"
          aria-labelledby="confirm-discard-title"
          className="border-border bg-muted/40 space-y-2 rounded-xl border p-3"
        >
          <p id="confirm-discard-title" className="text-sm font-semibold">
            Discard unsaved changes?
          </p>
          <p className="text-muted-foreground text-xs">
            Your pending assignment changes have not been saved.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={DANGER_BUTTON}
              onClick={onCancel}
            >
              Discard Changes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setConfirmingDiscard(false);
                setDismissedDiscardRequest(discardRequest);
              }}
            >
              Keep Editing
            </Button>
          </div>
        </div>
      )}

      <div className="border-border flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCancelClick}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!dirty || submitting}>
          {submitting ? "Saving..." : "Save Assignments"}
        </Button>
      </div>
    </form>
  );
}
