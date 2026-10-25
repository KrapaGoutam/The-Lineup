import type {
  AssignmentMode,
  ChecklistKind,
  ChecklistTemplateView,
  DueWindow,
  PersonRef,
  RecurrenceRuleView,
  TaskEventView,
  TaskKind,
  TaskPriority,
  TaskStatus,
  TaskView,
} from "../domain/task-types";

/** The columns Tasks reads from `public.tasks` (plus its assignment embed). */
export type TaskRow = {
  id: string;
  kind: TaskKind;
  title: string;
  instructions: string | null;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignment_mode: AssignmentMode;
  start_date: string | null;
  due_date: string | null;
  due_time: string | null;
  due_window: DueWindow | null;
  due_at: string | null;
  blocked_reason: string | null;
  completed_by: string | null;
  completed_at: string | null;
  completion_note: string | null;
  cancelled_at: string | null;
  group_id: string | null;
  recurrence_rule_id: string | null;
  checklist_instance_id: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  task_assignments: { profile_id: string }[];
};

export type TaskEventRow = {
  id: number;
  task_id: string | null;
  event_type: string;
  actor_profile_id: string | null;
  payload: unknown;
  created_at: string;
};

export const TASK_ROW_COLUMNS =
  "id, kind, title, instructions, category, priority, status, assignment_mode, start_date, due_date, due_time, due_window, due_at, blocked_reason, completed_by, completed_at, completion_note, cancelled_at, group_id, recurrence_rule_id, checklist_instance_id, sort_order, created_by, created_at, task_assignments(profile_id)";

function person(
  profileId: string | null,
  names: ReadonlyMap<string, string>,
): PersonRef | null {
  if (!profileId) return null;
  return { profileId, name: names.get(profileId) ?? "Former team member" };
}

/** Postgres `time` arrives as HH:MM:SS; the UI works in HH:MM. */
function clock(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

export function collectProfileIds(
  rows: readonly TaskRow[],
  events: readonly TaskEventRow[],
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.created_by);
    if (row.completed_by) ids.add(row.completed_by);
    for (const a of row.task_assignments) ids.add(a.profile_id);
  }
  for (const event of events) {
    if (event.actor_profile_id) ids.add(event.actor_profile_id);
  }
  return [...ids];
}

export function mapTaskRow(
  row: TaskRow,
  names: ReadonlyMap<string, string>,
): TaskView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    instructions: row.instructions,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignmentMode: row.assignment_mode,
    assignees: row.task_assignments
      .map((a) => person(a.profile_id, names))
      .filter((p): p is PersonRef => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    startDate: row.start_date,
    dueDate: row.due_date,
    dueTime: clock(row.due_time),
    dueWindow: row.due_window,
    dueAt: row.due_at,
    blockedReason: row.blocked_reason,
    completedBy: person(row.completed_by, names),
    completedAt: row.completed_at,
    completionNote: row.completion_note,
    cancelledAt: row.cancelled_at,
    groupId: row.group_id,
    recurrenceRuleId: row.recurrence_rule_id,
    checklistInstanceId: row.checklist_instance_id,
    sortOrder: row.sort_order,
    createdBy: person(row.created_by, names),
    createdAt: row.created_at,
  };
}

export function mapEventRow(
  row: TaskEventRow,
  names: ReadonlyMap<string, string>,
): TaskEventView {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.event_type,
    actor: person(row.actor_profile_id, names),
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
  };
}

export type TemplateRow = {
  id: string;
  kind: ChecklistKind;
  name: string;
  days_of_week: number[];
  active: boolean;
  checklist_template_items: {
    title: string;
    instructions: string | null;
    category: string;
    priority: TaskPriority;
    assignment_mode: AssignmentMode;
    due_window: DueWindow | null;
    due_time: string | null;
    sort_order: number;
    active: boolean;
    checklist_template_item_assignees: { profile_id: string }[];
  }[];
};

export const TEMPLATE_ROW_COLUMNS =
  "id, kind, name, days_of_week, active, checklist_template_items(title, instructions, category, priority, assignment_mode, due_window, due_time, sort_order, active, checklist_template_item_assignees(profile_id))";

export function mapTemplateRow(row: TemplateRow): ChecklistTemplateView {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    daysOfWeek: [...row.days_of_week].sort(),
    active: row.active,
    items: [...row.checklist_template_items]
      .filter((item) => item.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        title: item.title,
        instructions: item.instructions,
        category: item.category,
        priority: item.priority,
        assignmentMode: item.assignment_mode,
        assigneeIds: item.checklist_template_item_assignees.map(
          (a) => a.profile_id,
        ),
        dueWindow: item.due_window,
        dueTime: clock(item.due_time),
      })),
  };
}

export type SeriesRow = {
  id: string;
  title: string;
  instructions: string | null;
  category: string;
  priority: TaskPriority;
  assignment_mode: AssignmentMode;
  due_time: string | null;
  due_window: DueWindow | null;
  frequency: RecurrenceRuleView["frequency"];
  weekdays: number[] | null;
  day_of_month: number | null;
  starts_on: string;
  end_type: RecurrenceRuleView["endType"];
  ends_on: string | null;
  max_occurrences: number | null;
  active: boolean;
  created_by: string;
  task_recurrence_assignees: { profile_id: string }[];
};

export const SERIES_ROW_COLUMNS =
  "id, title, instructions, category, priority, assignment_mode, due_time, due_window, frequency, weekdays, day_of_month, starts_on, end_type, ends_on, max_occurrences, active, created_by, task_recurrence_assignees(profile_id)";

export function mapSeriesRow(
  row: SeriesRow,
  names: ReadonlyMap<string, string>,
): RecurrenceRuleView {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    category: row.category,
    priority: row.priority,
    assignmentMode: row.assignment_mode,
    assigneeIds: row.task_recurrence_assignees.map((a) => a.profile_id),
    dueTime: clock(row.due_time),
    dueWindow: row.due_window,
    frequency: row.frequency,
    weekdays: row.weekdays ? [...row.weekdays].sort() : null,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endType: row.end_type,
    endsOn: row.ends_on,
    maxOccurrences: row.max_occurrences,
    active: row.active,
    createdBy: person(row.created_by, names),
  };
}
