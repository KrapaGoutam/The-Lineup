"use client";

import * as React from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import type { Location } from "@/features/locations/domain/location";
import {
  DEFAULT_LOCATION_ROLE,
  deriveAssignmentStatus,
  filterRosterByName,
  locationRoleLabel,
  organizationRoleLabel,
  sortRoster,
  type AssignableLocation,
  type StaffRosterMember,
} from "@/features/locations/domain/staff-assignment";
import type { LocationStaffView } from "@/features/locations/actions/staff-assignment-actions";
import { LocationRoleSelect } from "./location-role-select";
import { AssignmentStatusBadge, LocationRoleBadge } from "./staff-badges";
import { EmployeeAssignmentsDialog } from "./employee-assignments-dialog";
import type { StaffAssignmentSource } from "./staff-assignment-source";

export interface LocationStaffManagementProps {
  readonly source: StaffAssignmentSource;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly location: Location;
  /** All locations of the organization (for the multi-location editor). */
  readonly organizationLocations: readonly AssignableLocation[];
  readonly canManage: boolean;
}

type RowEditor =
  | { readonly kind: "change-role"; readonly profileId: string }
  | { readonly kind: "reactivate"; readonly profileId: string };

const DANGER_BUTTON =
  "border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10";

function SearchBox({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly placeholder: string;
}) {
  return (
    <div className="relative">
      <Search
        className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background text-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 h-10 w-full rounded-xl border pr-3.5 pl-10 text-sm transition outline-none focus-visible:ring-2"
      />
    </div>
  );
}

/**
 * Location-centric staff view: who is explicitly assigned here, with role,
 * status and management actions. Mutations go through the existing atomic
 * assignment RPC (one change per action, scoped to this location).
 */
export function LocationStaffManagement({
  source,
  organizationId,
  organizationName,
  location,
  organizationLocations,
  canManage,
}: LocationStaffManagementProps) {
  const [view, setView] = React.useState<LocationStaffView | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [search, setSearch] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = React.useState<string | null>(null);

  const [rowEditor, setRowEditor] = React.useState<RowEditor | null>(null);
  const [pendingRole, setPendingRole] = React.useState<LocationRole>(
    DEFAULT_LOCATION_ROLE,
  );
  const [removing, setRemoving] = React.useState<StaffRosterMember | null>(
    null,
  );
  const [managing, setManaging] = React.useState<StaffRosterMember | null>(
    null,
  );

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignSearch, setAssignSearch] = React.useState("");
  const [candidate, setCandidate] = React.useState<StaffRosterMember | null>(
    null,
  );
  const [candidateRole, setCandidateRole] = React.useState<LocationRole>(
    DEFAULT_LOCATION_ROLE,
  );

  const locationActive = location.active;
  const mutable = canManage && locationActive;

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setView(null);
      setLoadError(null);
      try {
        const res = await source.loadLocationStaff(organizationId, location.id);
        if (cancelled) return;
        if (res.ok) setView(res.data);
        else setLoadError(res.error);
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load location staff.",
        );
      }
    }
    void Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
  }, [source, organizationId, location.id, reloadKey]);

  const rosterById = React.useMemo(
    () => new Map((view?.roster ?? []).map((m) => [m.profileId, m])),
    [view],
  );

  const rows = React.useMemo(() => {
    if (!view) return [];
    const built = view.assignments.map((assignment) => {
      const member: StaffRosterMember = rosterById.get(
        assignment.profileId,
      ) ?? {
        profileId: assignment.profileId,
        displayName: "Unknown member",
        organizationRoles: [],
        membershipActive: false,
      };
      return { member, assignment };
    });
    const sortedMembers = sortRoster(built.map((r) => r.member));
    const order = new Map(sortedMembers.map((m, i) => [m.profileId, i]));
    const ordered = [...built].sort(
      (a, b) =>
        (order.get(a.member.profileId) ?? 0) -
        (order.get(b.member.profileId) ?? 0),
    );
    return filterRosterByName(
      ordered.map((r) => ({ ...r, displayName: r.member.displayName })),
      search,
    );
  }, [view, rosterById, search]);

  const candidates = React.useMemo(() => {
    if (!view) return [];
    const assigned = new Set(view.assignments.map((a) => a.profileId));
    const eligible = view.roster.filter(
      (m) => m.membershipActive && !assigned.has(m.profileId),
    );
    return filterRosterByName(sortRoster(eligible), assignSearch);
  }, [view, assignSearch]);

  const activeMemberCount = view?.roster.filter(
    (m) => m.membershipActive,
  ).length;

  async function runChange(
    profileId: string,
    action: "assign" | "update" | "reactivate" | "deactivate",
    role: LocationRole | undefined,
    successMessage: string,
  ): Promise<boolean> {
    setBusyProfileId(profileId);
    setRowError(null);
    setMessage(null);
    try {
      const res = await source.applyChanges(organizationId, profileId, [
        { locationId: location.id, action, role },
      ]);
      if (!res.ok) {
        // Keep the pending edit open so the user can retry.
        setRowError(res.error);
        return false;
      }
      setMessage(successMessage);
      setRowEditor(null);
      setReloadKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setRowError(
        err instanceof Error
          ? err.message
          : "Network error. Your change was not saved.",
      );
      return false;
    } finally {
      setBusyProfileId(null);
    }
  }

  async function confirmAssign() {
    if (!candidate) return;
    const ok = await runChange(
      candidate.profileId,
      "assign",
      candidateRole,
      `${candidate.displayName} assigned to ${location.name} as ${locationRoleLabel(candidateRole)}.`,
    );
    if (ok) {
      setCandidate(null);
      setAssignOpen(false);
      setAssignSearch("");
      setCandidateRole(DEFAULT_LOCATION_ROLE);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const target = removing;
    const ok = await runChange(
      target.profileId,
      "deactivate",
      undefined,
      `${target.displayName}'s assigned access to ${location.name} was removed.`,
    );
    if (ok) setRemoving(null);
  }

  return (
    <div className="space-y-4" data-testid="location-staff-management">
      {!locationActive && (
        <p
          role="note"
          className="border-warn/30 bg-warn/10 text-warn rounded-xl border p-3 text-xs font-medium"
        >
          This location is inactive. Inactive locations cannot receive new
          assignments; existing assignments are shown as read-only history.
        </p>
      )}

      {message && (
        <p
          role="status"
          className="border-ok/30 bg-ok/10 text-ok rounded-xl border p-3 text-xs font-medium"
        >
          {message}
        </p>
      )}
      {rowError && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-xs font-medium"
        >
          {rowError}
        </p>
      )}

      {loadError ? (
        <Card className="border-destructive/30 bg-destructive/5 p-5 text-center">
          <p role="alert" className="text-destructive text-sm font-medium">
            {loadError}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        </Card>
      ) : !view ? (
        <p className="text-muted-foreground py-6 text-center text-xs">
          Loading staff...
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-foreground text-sm font-semibold">
              Staff Assignments · {location.name}
            </h3>
            {mutable && (
              <Button
                size="sm"
                onClick={() => {
                  setAssignOpen((o) => !o);
                  setCandidate(null);
                  setMessage(null);
                  setRowError(null);
                }}
                aria-expanded={assignOpen}
              >
                {assignOpen ? "Close Assign Staff" : "+ Assign Staff"}
              </Button>
            )}
          </div>

          {assignOpen && mutable && (
            <Card className="space-y-3 p-4" data-testid="assign-staff-panel">
              <h4 className="text-foreground text-sm font-semibold">
                Assign Staff
              </h4>
              {activeMemberCount === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No eligible staff members are available. Staff must have an
                  active organization membership before assignment.
                </p>
              ) : candidate ? (
                <div className="space-y-3">
                  <p className="text-foreground text-sm">
                    Assign <strong>{candidate.displayName}</strong> to{" "}
                    <strong>{location.name}</strong>
                  </p>
                  <LocationRoleSelect
                    id="assign-candidate-role"
                    label="Location role"
                    value={candidateRole}
                    onChange={setCandidateRole}
                    disabled={busyProfileId !== null}
                  />
                  <p
                    data-testid="assign-review"
                    className="text-muted-foreground text-xs"
                  >
                    Review: {candidate.displayName} will be assigned to{" "}
                    {location.name} as {locationRoleLabel(candidateRole)}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void confirmAssign()}
                      disabled={busyProfileId !== null}
                    >
                      {busyProfileId ? "Saving..." : "Confirm Assignment"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCandidate(null)}
                      disabled={busyProfileId !== null}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <SearchBox
                    id="assign-staff-search"
                    label="Search eligible staff"
                    placeholder="Search eligible staff by name..."
                    value={assignSearch}
                    onChange={setAssignSearch}
                  />
                  {candidates.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      {assignSearch.trim()
                        ? `No eligible staff match “${assignSearch}”. Staff already assigned appear in the list below.`
                        : "Every active organization member is already listed for this location."}
                    </p>
                  ) : (
                    <ul className="space-y-2" aria-label="Eligible staff">
                      {candidates.map((m) => (
                        <li
                          key={m.profileId}
                          className="border-border flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-foreground truncate text-sm font-medium">
                              {m.displayName}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {m.organizationRoles
                                .map(organizationRoleLabel)
                                .join(", ") || "Member"}
                              {" · "}Not Assigned
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Select ${m.displayName} to assign`}
                            onClick={() => {
                              setCandidate(m);
                              setCandidateRole(DEFAULT_LOCATION_ROLE);
                            }}
                          >
                            Select
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Card>
          )}

          {view.assignments.length > 0 && (
            <SearchBox
              id="location-staff-search"
              label="Search assigned staff"
              placeholder="Search assigned staff by name..."
              value={search}
              onChange={setSearch}
            />
          )}

          {view.assignments.length === 0 ? (
            <Card className="border-dashed p-6 text-center">
              <p className="text-muted-foreground text-sm">
                No staff assigned to this location yet.
              </p>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="text-muted-foreground p-5 text-center text-sm">
              No assigned staff match &ldquo;{search}&rdquo;.
            </Card>
          ) : (
            <ul className="space-y-2" aria-label="Assigned staff">
              {rows.map(({ member, assignment }) => (
                <StaffRow
                  key={assignment.profileId}
                  member={member}
                  assignment={assignment}
                  mutable={mutable}
                  busy={busyProfileId === member.profileId}
                  anyBusy={busyProfileId !== null}
                  editor={
                    rowEditor?.profileId === member.profileId ? rowEditor : null
                  }
                  pendingRole={pendingRole}
                  onPendingRole={setPendingRole}
                  onStartChangeRole={() => {
                    setRowEditor({
                      kind: "change-role",
                      profileId: member.profileId,
                    });
                    setPendingRole(assignment.role);
                    setRowError(null);
                    setMessage(null);
                  }}
                  onStartReactivate={() => {
                    setRowEditor({
                      kind: "reactivate",
                      profileId: member.profileId,
                    });
                    setPendingRole(assignment.role);
                    setRowError(null);
                    setMessage(null);
                  }}
                  onCancelEditor={() => {
                    setRowEditor(null);
                    setRowError(null);
                  }}
                  onSaveRole={() =>
                    void runChange(
                      member.profileId,
                      rowEditor?.kind === "reactivate"
                        ? "reactivate"
                        : "update",
                      pendingRole,
                      rowEditor?.kind === "reactivate"
                        ? `${member.displayName} reactivated at ${location.name} as ${locationRoleLabel(pendingRole)}.`
                        : `${member.displayName}'s role at ${location.name} changed to ${locationRoleLabel(pendingRole)}.`,
                    )
                  }
                  onRemove={() => {
                    setRowError(null);
                    setRemoving(member);
                  }}
                  onManageLocations={() => setManaging(member)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(null)}
          title="Remove assigned access"
          description={`Remove this employee's assigned access to ${location.name}? Their organization membership and assignments to other locations will remain unchanged.`}
        >
          <div className="space-y-3">
            <p className="text-foreground text-sm">
              Employee: <strong>{removing.displayName}</strong>
            </p>
            {rowError && (
              <p role="alert" className="text-destructive text-xs font-medium">
                {rowError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setRemoving(null)}
                disabled={busyProfileId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className={DANGER_BUTTON}
                onClick={() => void confirmRemove()}
                disabled={busyProfileId !== null}
              >
                {busyProfileId ? "Removing..." : "Remove Access"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {managing && (
        <EmployeeAssignmentsDialog
          source={source}
          organizationId={organizationId}
          organizationName={organizationName}
          member={managing}
          locations={organizationLocations}
          onClose={() => setManaging(null)}
          onSaved={(msg) => {
            setMessage(msg);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function StaffRow({
  member,
  assignment,
  mutable,
  busy,
  anyBusy,
  editor,
  pendingRole,
  onPendingRole,
  onStartChangeRole,
  onStartReactivate,
  onCancelEditor,
  onSaveRole,
  onRemove,
  onManageLocations,
}: {
  readonly member: StaffRosterMember;
  readonly assignment: LocationRoleAssignment;
  readonly mutable: boolean;
  readonly busy: boolean;
  readonly anyBusy: boolean;
  readonly editor: RowEditor | null;
  readonly pendingRole: LocationRole;
  readonly onPendingRole: (r: LocationRole) => void;
  readonly onStartChangeRole: () => void;
  readonly onStartReactivate: () => void;
  readonly onCancelEditor: () => void;
  readonly onSaveRole: () => void;
  readonly onRemove: () => void;
  readonly onManageLocations: () => void;
}) {
  const status = deriveAssignmentStatus(member, assignment);
  const canEditActive = mutable && member.membershipActive && assignment.active;
  const canReactivate =
    mutable && member.membershipActive && !assignment.active;
  const canRemove = mutable && assignment.active;
  const canManageLocations =
    mutable && (member.membershipActive || assignment.active);

  return (
    <li
      data-testid={`staff-row-${member.profileId}`}
      className="border-border space-y-3 rounded-xl border p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-semibold">
            {member.displayName}
          </p>
          <p className="text-muted-foreground text-xs">
            Organization:{" "}
            {member.organizationRoles.map(organizationRoleLabel).join(", ") ||
              "Member"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {assignment.active && <LocationRoleBadge role={assignment.role} />}
          {!assignment.active && (
            <Badge tone="neutral">
              Previous role: {locationRoleLabel(assignment.role)}
            </Badge>
          )}
          <AssignmentStatusBadge status={status} />
        </div>
      </div>

      {editor ? (
        <div className="grid gap-2 sm:grid-cols-[12rem_auto] sm:items-end">
          <LocationRoleSelect
            id={`row-role-${member.profileId}`}
            label={`New location role for ${member.displayName}`}
            value={pendingRole}
            onChange={onPendingRole}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSaveRole} disabled={busy}>
              {busy
                ? "Saving..."
                : editor.kind === "reactivate"
                  ? "Reactivate Assignment"
                  : "Save Role"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onCancelEditor}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canEditActive && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onStartChangeRole}
              disabled={anyBusy}
              aria-label={`Change role for ${member.displayName}`}
            >
              Change Role
            </Button>
          )}
          {canReactivate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onStartReactivate}
              disabled={anyBusy}
              aria-label={`Reactivate ${member.displayName}`}
            >
              Reactivate
            </Button>
          )}
          {canManageLocations && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onManageLocations}
              disabled={anyBusy}
              aria-label={`Manage locations for ${member.displayName}`}
            >
              Manage Locations
            </Button>
          )}
          {canRemove && (
            <Button
              size="sm"
              variant="outline"
              className={DANGER_BUTTON}
              onClick={onRemove}
              disabled={anyBusy}
              aria-label={`Remove assigned access for ${member.displayName}`}
            >
              Remove Access
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
