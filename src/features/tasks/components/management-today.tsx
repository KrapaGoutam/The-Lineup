"use client";

import { useId, useMemo } from "react";

import { Select } from "@/components/ui/select";

import {
  buildTodayGroups,
  resolveScope,
  scopeFromValue,
  scopeToValue,
  type TodayScope,
} from "../domain/task-rules";
import type { TaskView } from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { TaskList } from "./task-list";

type Props = {
  controller: TasksController;
  scope: TodayScope;
  onScopeChange: (scope: TodayScope) => void;
  categoryName: (slug: string) => string;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
};

/**
 * Owner / Manager / Assistant Manager view of Today: All Staff, My Tasks or
 * one person, grouped Opening / General / Closing with the staff name on
 * every row. A view over the snapshot the caller was already allowed to
 * read -- RLS and the manager-only roster decide what is in it; the caller
 * (TodayView) only mounts this for managers and `resolveScope` re-checks.
 */
export function ManagementToday({
  controller,
  scope,
  onScopeChange,
  categoryName,
  onToggle,
  onOpen,
}: Props) {
  const snapshot = controller.snapshot;
  const { viewer, now } = controller;
  const selectId = useId();
  const helpId = useId();

  const people = useMemo(
    () =>
      snapshot
        ? [...snapshot.team].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [snapshot],
  );
  const active = snapshot ? resolveScope(scope, viewer, people) : scope;

  const groups = useMemo(
    () =>
      snapshot
        ? buildTodayGroups(
            {
              tasks: snapshot.tasks,
              checklists: snapshot.checklists,
              today: snapshot.today,
              timeZone: snapshot.timeZone,
              now,
            },
            active,
            viewer,
          )
        : null,
    [snapshot, active, viewer, now],
  );

  if (!snapshot || !groups) return null;

  const total =
    groups.opening.length + groups.general.length + groups.closing.length;
  const personName =
    active.type === "person"
      ? (people.find((p) => p.profileId === active.profileId)?.name ?? "")
      : "";
  const scopeName =
    active.type === "all"
      ? "All Staff"
      : active.type === "mine"
        ? "My Tasks"
        : personName;
  const emptyText =
    active.type === "all"
      ? "No tasks for today."
      : active.type === "mine"
        ? "You have no tasks today."
        : `No tasks today for ${personName}.`;

  return (
    <section aria-label="Work by staff" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold">Today&rsquo;s work</h2>
        <div className="w-full sm:w-64">
          <label
            htmlFor={selectId}
            className="text-muted-foreground mb-1 block text-xs font-medium"
          >
            Show tasks for
          </label>
          <Select
            id={selectId}
            value={scopeToValue(active)}
            aria-describedby={people.length === 0 ? helpId : undefined}
            onChange={(event) =>
              onScopeChange(scopeFromValue(event.target.value))
            }
          >
            <option value="all">All Staff</option>
            <option value="mine">My Tasks</option>
            {people.length > 0 ? (
              <optgroup label="Staff">
                {people.map((member) => (
                  <option
                    key={member.profileId}
                    value={`person:${member.profileId}`}
                  >
                    {member.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
          {people.length === 0 ? (
            <p id={helpId} className="text-muted-foreground mt-1 text-xs">
              No active staff to filter by.
            </p>
          ) : null}
        </div>
      </div>

      <p role="status" className="text-muted-foreground text-xs">
        {scopeName}: {total} {total === 1 ? "task" : "tasks"} today
      </p>

      {total === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-5">
          {(
            [
              ["Opening", groups.opening],
              ["General", groups.general],
              ["Closing", groups.closing],
            ] as const
          ).map(([label, tasks]) =>
            tasks.length === 0 ? null : (
              <section
                key={label}
                aria-label={`${label} work`}
                className="space-y-2.5"
              >
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {label}
                  <span className="ml-1.5 tabular-nums">{tasks.length}</span>
                </h3>
                <TaskList
                  tasks={tasks}
                  controller={controller}
                  categoryName={categoryName}
                  showAssignees
                  emptyText=""
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              </section>
            ),
          )}
        </div>
      )}
    </section>
  );
}
