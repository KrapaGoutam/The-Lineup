"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import type {
  AssignableLocation,
  StaffRosterMember,
} from "@/features/locations/domain/staff-assignment";
import { StaffMultiLocationEditor } from "./staff-multi-location-editor";
import type { StaffAssignmentSource } from "./staff-assignment-source";

export interface EmployeeAssignmentsDialogProps {
  readonly source: StaffAssignmentSource;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly member: StaffRosterMember;
  readonly locations: readonly AssignableLocation[];
  readonly onClose: () => void;
  /** Called only after the backend confirms the change set was persisted. */
  readonly onSaved: (message: string) => void;
}

/**
 * Loads one employee's persisted assignments (restricted to the administered
 * organization) and hosts the multi-location editor in an accessible dialog.
 */
export function EmployeeAssignmentsDialog({
  source,
  organizationId,
  organizationName,
  member,
  locations,
  onClose,
  onSaved,
}: EmployeeAssignmentsDialogProps) {
  const [baseline, setBaseline] = React.useState<
    LocationRoleAssignment[] | null
  >(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const [discardRequest, setDiscardRequest] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setBaseline(null);
      setLoadError(null);
      try {
        const res = await source.loadEmployeeAssignments(
          organizationId,
          member.profileId,
        );
        if (cancelled) return;
        if (res.ok) setBaseline(res.data.assignments);
        else setLoadError(res.error);
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load assignments.",
        );
      }
    }
    void Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
  }, [source, organizationId, member.profileId, reloadKey]);

  function requestClose() {
    if (dirty) setDiscardRequest((n) => n + 1);
    else onClose();
  }

  return (
    <Dialog
      open
      onClose={requestClose}
      title={`${member.displayName} — Location Assignments`}
      description={`Locations in ${organizationName}. Only the changes you make are saved.`}
      className="max-w-[min(94vw,40rem)]"
    >
      {loadError ? (
        <div className="space-y-3 text-center">
          <p role="alert" className="text-destructive text-sm font-medium">
            {loadError}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : baseline === null ? (
        <p className="text-muted-foreground py-6 text-center text-xs">
          Loading assignments...
        </p>
      ) : (
        <StaffMultiLocationEditor
          member={member}
          locations={locations}
          baseline={baseline}
          onDirtyChange={setDirty}
          discardRequest={discardRequest}
          onCancel={onClose}
          onSave={async (changes) => {
            const res = await source.applyChanges(
              organizationId,
              member.profileId,
              changes,
            );
            if (!res.ok) return { ok: false, error: res.error };
            onSaved(`Saved location assignments for ${member.displayName}.`);
            onClose();
            return { ok: true };
          }}
        />
      )}
    </Dialog>
  );
}
