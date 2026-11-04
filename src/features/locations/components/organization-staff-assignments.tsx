"use client";

import * as React from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  filterRosterByName,
  organizationRoleLabel,
  type AssignableLocation,
  type StaffRosterMember,
} from "@/features/locations/domain/staff-assignment";
import { EmployeeAssignmentsDialog } from "./employee-assignments-dialog";
import type { StaffAssignmentSource } from "./staff-assignment-source";
import { Badge } from "@/components/ui/badge";

export interface OrganizationStaffAssignmentsProps {
  readonly source: StaffAssignmentSource;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly locations: readonly AssignableLocation[];
  readonly onClose: () => void;
}

/**
 * Employee-centric entry point: browse the organization's real members and
 * edit one person's assignments across several locations without visiting
 * each branch individually.
 */
export function OrganizationStaffAssignments({
  source,
  organizationId,
  organizationName,
  locations,
  onClose,
}: OrganizationStaffAssignmentsProps) {
  const [roster, setRoster] = React.useState<StaffRosterMember[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [managing, setManaging] = React.useState<StaffRosterMember | null>(
    null,
  );
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setRoster(null);
      setError(null);
      try {
        const res = await source.loadOrganizationStaff(organizationId);
        if (cancelled) return;
        if (res.ok) setRoster(res.data);
        else setError(res.error);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load staff.");
      }
    }
    void Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
  }, [source, organizationId, reloadKey]);

  const visible = React.useMemo(
    () => filterRosterByName(roster ?? [], search),
    [roster, search],
  );
  const hasActiveMembers = (roster ?? []).some((m) => m.membershipActive);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Staff Assignments"
      description={`Employees of ${organizationName}. Choose an employee to edit their location assignments.`}
      className="max-w-[min(94vw,40rem)]"
    >
      <div className="space-y-4" data-testid="organization-staff-assignments">
        {message && (
          <p
            role="status"
            className="border-ok/30 bg-ok/10 text-ok rounded-xl border p-3 text-xs font-medium"
          >
            {message}
          </p>
        )}

        {error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-center">
            <p role="alert" className="text-destructive text-sm font-medium">
              {error}
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
        ) : roster === null ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            Loading staff roster...
          </p>
        ) : roster.length === 0 || !hasActiveMembers ? (
          <Card className="border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">
              No eligible staff members are available. Staff must have an active
              organization membership before assignment.
            </p>
          </Card>
        ) : (
          <>
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search organization staff"
                placeholder="Search staff by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-input bg-background text-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 h-10 w-full rounded-xl border pr-3.5 pl-10 text-sm transition outline-none focus-visible:ring-2"
              />
            </div>
            {visible.length === 0 ? (
              <Card className="text-muted-foreground p-5 text-center text-sm">
                No staff match &ldquo;{search}&rdquo;.
              </Card>
            ) : (
              <ul className="space-y-2" aria-label="Organization staff">
                {visible.map((m) => (
                  <li
                    key={m.profileId}
                    data-testid={`org-staff-row-${m.profileId}`}
                    className="border-border flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {m.displayName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {m.organizationRoles
                          .map(organizationRoleLabel)
                          .join(", ") || "Member"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!m.membershipActive && (
                        <Badge tone="warning">
                          Organization Membership Inactive
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Manage locations for ${m.displayName}`}
                        onClick={() => {
                          setMessage(null);
                          setManaging(m);
                        }}
                      >
                        Manage Locations
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {managing && (
        <EmployeeAssignmentsDialog
          source={source}
          organizationId={organizationId}
          organizationName={organizationName}
          member={managing}
          locations={locations}
          onClose={() => setManaging(null)}
          onSaved={setMessage}
        />
      )}
    </Dialog>
  );
}
