"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { ASSIGNMENT_LABELS } from "../domain/task-rules";
import {
  ASSIGNMENT_MODES,
  type AssignmentMode,
  type TaskTeamMember,
} from "../domain/task-types";

type Props = {
  idPrefix: string;
  mode: AssignmentMode;
  onModeChange: (mode: AssignmentMode) => void;
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  team: readonly TaskTeamMember[];
};

/**
 * Who a task is for: one person, selected people, the whole team or anyone
 * eligible. The person controls only appear for the modes that need them,
 * mirroring the database's assignee-count rules.
 */
export function AssigneePicker({
  idPrefix,
  mode,
  onModeChange,
  assigneeIds,
  onAssigneeIdsChange,
  team,
}: Props) {
  const modeId = `${idPrefix}-mode`;
  const personId = `${idPrefix}-person`;

  function changeMode(next: AssignmentMode) {
    onModeChange(next);
    if (next === "individual") onAssigneeIdsChange(assigneeIds.slice(0, 1));
    if (next === "all_team" || next === "anyone") onAssigneeIdsChange([]);
  }

  function toggle(profileId: string) {
    onAssigneeIdsChange(
      assigneeIds.includes(profileId)
        ? assigneeIds.filter((id) => id !== profileId)
        : [...assigneeIds, profileId],
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={modeId}>Assign to</Label>
        <Select
          id={modeId}
          value={mode}
          onChange={(event) => changeMode(event.target.value as AssignmentMode)}
        >
          {ASSIGNMENT_MODES.map((value) => (
            <option key={value} value={value}>
              {ASSIGNMENT_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {mode === "individual" ? (
        <div className="space-y-1.5">
          <Label htmlFor={personId}>Person</Label>
          <Select
            id={personId}
            value={assigneeIds[0] ?? ""}
            onChange={(event) =>
              onAssigneeIdsChange(
                event.target.value ? [event.target.value] : [],
              )
            }
          >
            <option value="">Choose a person…</option>
            {team.map((member) => (
              <option key={member.profileId} value={member.profileId}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {mode === "multiple" ? (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">
            People (choose two or more)
          </legend>
          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {team.map((member) => {
              const checked = assigneeIds.includes(member.profileId);
              return (
                <label
                  key={member.profileId}
                  className={cn(
                    "border-border flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm",
                    checked && "border-primary bg-primary/10",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--primary)]"
                    checked={checked}
                    onChange={() => toggle(member.profileId)}
                  />
                  {member.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
