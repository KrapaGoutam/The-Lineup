import { weekdayOf } from "./recurrence";
import {
  computeDueAt,
  pushEvent,
  type EngineContext,
  type InstanceRecord,
  type TasksState,
} from "./task-engine";
import type {
  AssignmentMode,
  ChecklistKind,
  ChecklistTemplateItemView,
  ChecklistTemplateView,
  DueWindow,
  PersonRef,
  TaskView,
} from "./task-types";

export { weekdayOf };

export function templateAppliesOn(
  template: Pick<ChecklistTemplateView, "daysOfWeek" | "active">,
  date: string,
): boolean {
  return template.active && template.daysOfWeek.includes(weekdayOf(date));
}

/**
 * Mirrors `checklist_generate_daily`: only people who are still active keep
 * their assignment, and an item whose named people have left degrades
 * gracefully (one person left -> individual; none -> anyone) instead of
 * failing the whole day.
 */
export function resolveItemAssignment(
  mode: AssignmentMode,
  activeAssigneeIds: readonly string[],
): { mode: AssignmentMode; assigneeIds: string[] } {
  if (mode === "all_team" || mode === "anyone") {
    return { mode, assigneeIds: [] };
  }
  const ids = [...activeAssigneeIds].sort();
  if (mode === "individual") {
    return ids.length === 1
      ? { mode, assigneeIds: ids }
      : { mode: "anyone", assigneeIds: [] };
  }
  if (ids.length >= 2) return { mode, assigneeIds: ids };
  if (ids.length === 1) return { mode: "individual", assigneeIds: ids };
  return { mode: "anyone", assigneeIds: [] };
}

function defaultWindow(
  kind: ChecklistKind,
  item: ChecklistTemplateItemView,
): DueWindow | null {
  if (item.dueWindow) return item.dueWindow;
  if (item.dueTime) return null;
  return kind === "opening" ? "before_opening" : "closing";
}

/**
 * Creates the day's checklist instances for every active template that
 * applies. Idempotent: an existing (template, date) pair is left untouched,
 * and the same state object is returned when nothing changed. Items become
 * ordinary tasks, so each day owns its own completion state.
 */
export function generateDailyChecklists(
  state: TasksState,
  ctx: EngineContext,
  today: string,
  date: string,
  kind?: ChecklistKind,
): TasksState {
  if (date < today) return state;
  let next = state;
  const people = new Map(ctx.team.map((m) => [m.profileId, m.name]));

  const templates = state.templates
    .filter((t) => (!kind || t.kind === kind) && templateAppliesOn(t, date))
    .sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    );

  for (const template of templates) {
    if (
      next.instances.some(
        (i) => i.templateId === template.id && i.serviceDate === date,
      )
    ) {
      continue;
    }
    const instance: InstanceRecord = {
      id: `inst-${next.seq}`,
      templateId: template.id,
      kind: template.kind,
      name: template.name,
      serviceDate: date,
    };
    let seq = next.seq + 1;
    const created: TaskView[] = template.items.map((item, index) => {
      const resolved = resolveItemAssignment(
        item.assignmentMode,
        item.assigneeIds.filter((id) => people.has(id)),
      );
      const assignees: PersonRef[] = resolved.assigneeIds.map((id) => ({
        profileId: id,
        name: people.get(id) ?? "Team member",
      }));
      const dueWindow = defaultWindow(template.kind, item);
      return {
        id: `task-${seq++}`,
        kind: template.kind,
        title: item.title,
        instructions: item.instructions,
        category: item.category,
        priority: item.priority,
        status: "open",
        assignmentMode: resolved.mode,
        assignees,
        startDate: null,
        dueDate: date,
        dueTime: item.dueTime,
        dueWindow,
        dueAt: computeDueAt(
          { dueDate: date, dueTime: item.dueTime },
          ctx.timeZone,
        ),
        blockedReason: null,
        completedBy: null,
        completedAt: null,
        completionNote: null,
        cancelledAt: null,
        groupId: null,
        recurrenceRuleId: null,
        checklistInstanceId: instance.id,
        sortOrder: index + 1,
        createdBy: { profileId: ctx.actor.profileId, name: ctx.actor.name },
        createdAt: ctx.now.toISOString(),
      };
    });

    next = {
      ...next,
      seq,
      instances: [...next.instances, instance],
      tasks: [...next.tasks, ...created],
    };
    next = pushEvent(next, ctx, null, "checklist_generated", {
      template_id: template.id,
      name: template.name,
      service_date: date,
      items: created.length,
    });
  }
  return next;
}
