"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  addExistingEmployeeAction,
  listExistingEmployeesAction,
  type ExistingEmployee,
} from "@/features/organizations/actions/cross-organization-staff-actions";
import { listOrganizationsForAdministrationAction } from "@/features/organizations/actions/organization-admin-actions";
import type { StaffRosterMember } from "@/features/locations/domain/staff-assignment";

export function AddExistingEmployeeDialog({
  destinationOrganizationId,
  destinationOrganizationName,
  nextBranchName,
  onClose,
  onLinked,
  onAssign,
}: {
  readonly destinationOrganizationId: string;
  readonly destinationOrganizationName: string;
  readonly nextBranchName?: string;
  readonly onClose: () => void;
  readonly onLinked: (member: StaffRosterMember) => void;
  readonly onAssign: (member: StaffRosterMember) => void;
}) {
  const [organizations, setOrganizations] = React.useState<
    readonly { id: string; name: string }[] | null
  >(null);
  const [sourceId, setSourceId] = React.useState("");
  const [employees, setEmployees] = React.useState<
    readonly ExistingEmployee[] | null
  >(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [confirmation, setConfirmation] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [linked, setLinked] = React.useState<StaffRosterMember | null>(null);
  const [retry, setRetry] = React.useState(0);
  const submitting = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    void listOrganizationsForAdministrationAction()
      .then((result) => {
        if (cancelled) return;
        if (result.ok)
          setOrganizations(
            result.data.filter((org) => org.id !== destinationOrganizationId),
          );
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load organizations. Please retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [destinationOrganizationId, retry]);

  React.useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    void listExistingEmployeesAction({
      sourceOrganizationId: sourceId,
      destinationOrganizationId,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setEmployees(result.data);
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load employees. Please retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, destinationOrganizationId, retry]);

  const selected = employees?.find((member) => member.profileId === selectedId);
  const sourceName =
    organizations?.find((org) => org.id === sourceId)?.name ??
    "the source organization";
  const visible =
    employees?.filter((member) =>
      member.displayName
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ) ?? [];
  const sameNameCount = new Map<string, number>();
  for (const member of employees ?? [])
    sameNameCount.set(
      member.displayName,
      (sameNameCount.get(member.displayName) ?? 0) + 1,
    );

  function refreshRosters(message = "") {
    setEmployees(null);
    setSelectedId("");
    setConfirmation(false);
    setError(message);
    setRetry((number) => number + 1);
  }

  async function submit() {
    if (!selected || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const result = await addExistingEmployeeAction({
        sourceOrganizationId: sourceId,
        destinationOrganizationId,
        profileId: selected.profileId,
        reason,
        reactivate: selected.destinationStatus === "inactive",
      });
      if (!result.ok) {
        setError(result.error);
        if (
          result.code === "ALREADY_EXISTS" ||
          result.code === "ALREADY_ACTIVE" ||
          result.code === "INACTIVE_MEMBERSHIP"
        )
          refreshRosters(result.error);
        return;
      }
      const member = {
        ...selected,
        organizationRoles:
          selected.destinationStatus === "inactive" ? [] : ["server"],
        membershipActive: true,
      };
      setLinked(member);
      onLinked(member);
    } catch {
      setError("Network error. Check the destination roster before retrying.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Add Existing Employee"
      description={`Link an existing profile to ${destinationOrganizationName}. Branch assignment follows separately.`}
      className="max-w-[min(94vw,38rem)]"
    >
      {linked ? (
        <div className="space-y-4">
          <p
            role="status"
            className="border-ok/30 bg-ok/10 rounded-xl border p-3 text-sm"
          >
            {linked.displayName} is now an active member of{" "}
            {destinationOrganizationName}. Their original account and Personal
            PIN remain.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onAssign(linked)}>
              Assign to {nextBranchName ?? "a branch"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="employee-source" className="text-sm font-medium">
              Source organization
            </label>
            <Select
              id="employee-source"
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setEmployees(null);
                setSelectedId("");
                setConfirmation(false);
                setError("");
              }}
              disabled={pending}
            >
              <option value="">Select an organization</option>
              {organizations?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
            {organizations?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No other organizations are available.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="employee-search" className="text-sm font-medium">
              Search employee
            </label>
            <input
              id="employee-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!sourceId || pending}
              className="border-input bg-background min-h-11 w-full rounded-xl border px-3 text-sm"
              placeholder="Search by display name"
            />
          </div>
          {sourceId && !employees && !error && (
            <p role="status" className="text-muted-foreground text-sm">
              Loading source staff…
            </p>
          )}
          {employees && (
            <fieldset
              className="max-h-48 space-y-2 overflow-y-auto"
              aria-label="Select existing employee"
            >
              {visible.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No matching active employees.
                </p>
              ) : (
                visible.map((member) => (
                  <label
                    key={member.profileId}
                    className="border-border flex min-h-11 items-center gap-3 rounded-xl border p-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="existing-employee"
                      value={member.profileId}
                      checked={selectedId === member.profileId}
                      onChange={() => {
                        setSelectedId(member.profileId);
                        setConfirmation(false);
                      }}
                      disabled={
                        pending || member.destinationStatus === "active"
                      }
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {member.displayName}
                      {(sameNameCount.get(member.displayName) ?? 0) > 1
                        ? ` · ${member.profileId.slice(0, 8)}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {member.destinationStatus === "active"
                        ? "Already active"
                        : member.destinationStatus === "inactive"
                          ? "Inactive in destination"
                          : "Available"}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
          )}
          {selected && (
            <div className="space-y-1 text-sm">
              <p>
                Destination organization:{" "}
                <strong>{destinationOrganizationName}</strong>
              </p>
              <p>
                Organization role:{" "}
                <strong>
                  {selected.destinationStatus === "inactive"
                    ? "Existing role retained"
                    : "Server"}
                </strong>
              </p>
              {selected.destinationStatus === "inactive" && (
                <p className="text-amber-600">
                  This membership is inactive. Reactivation requires explicit
                  confirmation and an audit reason.
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="employee-reason" className="text-sm font-medium">
              Reason
            </label>
            <textarea
              id="employee-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              disabled={pending}
              className="border-input bg-background min-h-20 w-full rounded-xl border p-3 text-sm"
              aria-describedby="employee-reason-help"
            />
            <p
              id="employee-reason-help"
              className="text-muted-foreground text-xs"
            >
              Required, 3–500 characters. Recorded in the membership audit.
            </p>
          </div>
          {confirmation && selected && (
            <div className="border-primary/30 bg-primary/10 space-y-2 rounded-xl border p-3 text-sm">
              <p className="font-semibold">
                {selected.destinationStatus === "inactive"
                  ? "Reactivate"
                  : "Add"}{" "}
                {selected.displayName}{" "}
                {selected.destinationStatus === "inactive" ? "in" : "to"}{" "}
                {destinationOrganizationName}?
              </p>
              <p>
                Their {sourceName} access and personal PIN remain.{" "}
                {selected.destinationStatus === "inactive"
                  ? "Their existing destination role will remain."
                  : `They will receive a new ${destinationOrganizationName} membership as Server.`}{" "}
                {nextBranchName ?? "Branch"} assignment is a separate step.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!confirmation ? (
              <Button
                disabled={
                  !selected ||
                  reason.trim().length < 3 ||
                  reason.trim().length > 500 ||
                  pending
                }
                onClick={() => setConfirmation(true)}
              >
                Continue
              </Button>
            ) : (
              <Button disabled={pending} onClick={() => void submit()}>
                {pending
                  ? "Saving…"
                  : selected?.destinationStatus === "inactive"
                    ? "Confirm reactivation"
                    : "Confirm membership"}
              </Button>
            )}
            {confirmation && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirmation(false)}
              >
                Back
              </Button>
            )}
            {error && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => refreshRosters()}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
