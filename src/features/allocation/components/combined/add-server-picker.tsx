"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ExecResult } from "@/features/allocation/components/combined/types";
import type { TeamMember } from "@/lib/demo-data";

/**
 * "+ Server": a searchable picker over the branch's EXISTING employees (the
 * location roster the board already loads -- `board_location_roster`, which is
 * scoped to this organization and location). It cannot create an identity: the
 * only thing a row can do is add that person to today's rotation through the
 * same `add-column` action the existing Quick Add uses, which the database
 * re-checks (active membership of the organization) regardless of this list.
 * A person already on the rotation is shown as "Already added" and cannot be
 * added twice. Adding does not change roles or attendance.
 */
export function AddServerPicker({
  open,
  onClose,
  roster,
  onRotation,
  clockedInProfileIds,
  disabled,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  roster: TeamMember[];
  /** Profile ids already on today's rotation (any non-removed column). */
  onRotation: ReadonlySet<string>;
  clockedInProfileIds: string[];
  disabled: boolean;
  onAdd: (member: TeamMember) => Promise<ExecResult>;
}) {
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster
      .filter((member) =>
        needle ? member.name.toLowerCase().includes(needle) : true,
      )
      .map((member) => ({
        member,
        added: onRotation.has(member.id),
        inactive: member.active === false,
        clockedIn: clockedInProfileIds.includes(member.id),
      }))
      .sort((a, b) => {
        if (a.added !== b.added) return a.added ? 1 : -1;
        if (a.clockedIn !== b.clockedIn) return a.clockedIn ? -1 : 1;
        return a.member.name.localeCompare(b.member.name);
      });
  }, [roster, query, onRotation, clockedInProfileIds]);

  async function add(member: TeamMember) {
    setPendingId(member.id);
    setError(null);
    const result = await onAdd(member);
    setPendingId(null);
    if (!result.ok) setError(result.error);
  }

  function close() {
    setQuery("");
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add server"
      description="Employees at this branch. Search by name."
    >
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          aria-label="Search employees"
          placeholder="Search employees"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        {error ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
        <ul
          aria-label="Branch employees"
          className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto"
        >
          {rows.map(({ member, added, inactive, clockedIn }) => (
            <li
              key={member.id}
              className="border-border flex min-h-12 items-center gap-2 rounded-lg border px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {member.name}
              </span>
              {clockedIn ? <Badge tone="success">Clocked in</Badge> : null}
              {inactive ? <Badge tone="warning">Inactive</Badge> : null}
              {added ? (
                <Badge tone="neutral">Already added</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || inactive || pendingId !== null}
                  aria-label={`Add ${member.name}`}
                  onClick={() => add(member)}
                >
                  <UserPlus aria-hidden="true" /> Add
                </Button>
              )}
            </li>
          ))}
          {rows.length === 0 ? (
            <li role="status" className="text-muted-foreground text-sm">
              {roster.length === 0
                ? "No employees are available at this branch."
                : "No employees match that search."}
            </li>
          ) : null}
        </ul>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={close}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
