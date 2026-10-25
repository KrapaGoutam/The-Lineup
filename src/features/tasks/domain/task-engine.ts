import {
  zonedWallTimeFromInstant,
  zonedWallTimeToInstant,
} from "@/lib/timezone";

import { occurrenceDates, weekdayOf } from "./recurrence";
import type {
  CommandResult,
  SeriesInput,
  TemplateInput,
  TaskCommand,
  TaskCreateInput,
  TaskFields,
} from "./task-commands";
import { addDaysToDate, canViewTask, canWorkTask } from "./task-rules";
import {
  DEFAULT_TASK_CATEGORIES,
  type ChecklistKind,
  type ChecklistTemplateView,
  type RecurrenceRuleView,
  isTasksManager,
  type AssignmentMode,
  type PersonRef,
  type TaskEventView,
  type TaskTeamMember,
  type TaskView,
  type TaskViewer,
  type TasksSnapshot,
} from "./task-types";

/**
 * In-memory implementation of the Tasks write rules, used by demo mode
 * (no database) and as an executable specification of the `public.task_*`
 * RPCs: every rule below has a counterpart in
 * supabase/migrations/20261025090000_tasks_v1_foundation.sql and its pgTAP
 * test. Real mode never runs this -- the database is authoritative.
 */
/** A generated daily checklist; its items are rows in `tasks`. */
export type InstanceRecord = {
  id: string;
  templateId: string;
  kind: ChecklistKind;
  name: string;
  serviceDate: string;
};

export type TasksState = {
  tasks: TaskView[];
  events: TaskEventView[];
  templates: ChecklistTemplateView[];
  instances: InstanceRecord[];
  rules: RecurrenceRuleView[];
  seq: number;
};

export type EngineContext = {
  actor: TaskViewer;
  /** Active members only. */
  team: readonly TaskTeamMember[];
  timeZone: string;
  now: Date;
};

export function emptyTasksState(): TasksState {
  return {
    tasks: [],
    events: [],
    templates: [],
    instances: [],
    rules: [],
    seq: 1,
  };
}

const fail = <T>(error: string): CommandResult<T> => ({ ok: false, error });
const ok = <T>(value: T): CommandResult<T> => ({ ok: true, value });

const MANAGER_ONLY = "Only an owner, manager or assistant manager can do that.";

/** due_at exactly as the database trigger derives it. */
export function computeDueAt(
  fields: Pick<TaskFields, "dueDate" | "dueTime">,
  timeZone: string,
): string | null {
  if (!fields.dueDate) return null;
  if (fields.dueTime) {
    return zonedWallTimeToInstant({
      date: fields.dueDate,
      time: fields.dueTime,
      timeZone,
    }).toISOString();
  }
  return zonedWallTimeToInstant({
    date: addDaysToDate(fields.dueDate, 1),
    time: "00:00",
    timeZone,
  }).toISOString();
}

function validateFields(fields: TaskFields): string | null {
  if (!fields.title.trim())
    return "Give the task a title (up to 160 characters).";
  if (fields.dueTime && !fields.dueDate) return "A due time needs a due date.";
  if (fields.startDate && fields.dueDate && fields.startDate > fields.dueDate) {
    return "The start date cannot be after the due date.";
  }
  if (!DEFAULT_TASK_CATEGORIES.some((c) => c.slug === fields.category)) {
    return "Unknown task category.";
  }
  return null;
}

export function validateAssignees(
  mode: AssignmentMode,
  ids: readonly string[],
  ctx: EngineContext,
): CommandResult<PersonRef[]> {
  const unique = [...new Set(ids)];
  if (mode === "all_team" || mode === "anyone") {
    if (unique.length > 0) {
      return fail("Team and shared tasks take no individual assignees.");
    }
  } else if (mode === "individual") {
    if (unique.length !== 1) {
      return fail("Choose exactly one person for an individual task.");
    }
  } else if (unique.length < 2) {
    return fail("Choose at least two people for a multi-person task.");
  }
  const people: PersonRef[] = [];
  for (const id of unique) {
    const member = ctx.team.find((m) => m.profileId === id);
    if (!member) {
      return fail(
        "Every assignee must be an active member of this restaurant.",
      );
    }
    people.push({ profileId: member.profileId, name: member.name });
  }
  return ok(people);
}

export function pushEvent(
  state: TasksState,
  ctx: EngineContext,
  taskId: string | null,
  type: string,
  payload: Record<string, unknown>,
): TasksState {
  const event: TaskEventView = {
    id: state.seq,
    taskId,
    type,
    actor: { profileId: ctx.actor.profileId, name: ctx.actor.name },
    payload,
    createdAt: ctx.now.toISOString(),
  };
  return { ...state, events: [...state.events, event], seq: state.seq + 1 };
}

function replaceTask(state: TasksState, task: TaskView): TasksState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
  };
}

function actorRef(ctx: EngineContext): PersonRef {
  return { profileId: ctx.actor.profileId, name: ctx.actor.name };
}

function createOne(
  state: TasksState,
  ctx: EngineContext,
  input: TaskCreateInput,
  mode: AssignmentMode,
  assignees: PersonRef[],
  groupId: string | null,
): TasksState {
  const id = `task-${state.seq}`;
  const task: TaskView = {
    id,
    kind: "task",
    title: input.title.trim(),
    instructions: input.instructions?.trim() || null,
    category: input.category,
    priority: input.priority,
    status: "open",
    assignmentMode: mode,
    assignees,
    startDate: input.startDate,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    dueWindow: input.dueWindow,
    dueAt: computeDueAt(input, ctx.timeZone),
    blockedReason: null,
    completedBy: null,
    completedAt: null,
    completionNote: null,
    cancelledAt: null,
    groupId,
    recurrenceRuleId: null,
    checklistInstanceId: null,
    sortOrder: 0,
    createdBy: actorRef(ctx),
    createdAt: ctx.now.toISOString(),
  };
  const next = { ...state, tasks: [...state.tasks, task], seq: state.seq + 1 };
  return pushEvent(next, ctx, id, "created", {
    title: task.title,
    assignment_mode: mode,
    assignees: assignees.map((a) => a.profileId),
  });
}

/** Applies one command exactly as the corresponding RPC would. */
export function applyCommand(
  state: TasksState,
  command: TaskCommand,
  ctx: EngineContext,
): CommandResult<TasksState> {
  const manager = isTasksManager(ctx.actor.designation);
  const find = (id: string) => state.tasks.find((t) => t.id === id);

  switch (command.type) {
    case "create": {
      if (!manager) return fail(MANAGER_ONLY);
      const { input } = command;
      const invalid = validateFields(input);
      if (invalid) return fail(invalid);
      const people = validateAssignees(
        input.assignmentMode,
        input.assigneeIds,
        ctx,
      );
      if (!people.ok) return people;
      if (input.eachPerson) {
        if (input.assignmentMode !== "multiple") {
          return fail("Each-person completion needs a multi-person task.");
        }
        const groupId = `group-${state.seq}`;
        let next = state;
        for (const person of people.value) {
          next = createOne(next, ctx, input, "individual", [person], groupId);
        }
        return ok(next);
      }
      return ok(
        createOne(state, ctx, input, input.assignmentMode, people.value, null),
      );
    }

    case "update": {
      const task = find(command.taskId);
      if (!task || !manager) return fail(MANAGER_ONLY);
      if (task.status === "completed" || task.status === "cancelled") {
        return fail("Completed or cancelled tasks cannot be edited.");
      }
      const invalid = validateFields(command.input);
      if (invalid) return fail(invalid);
      const f = command.input;
      const before = {
        title: task.title,
        instructions: task.instructions,
        category: task.category,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        dueWindow: task.dueWindow,
      };
      const after = {
        title: f.title.trim(),
        instructions: f.instructions?.trim() || null,
        category: f.category,
        priority: f.priority,
        startDate: f.startDate,
        dueDate: f.dueDate,
        dueTime: f.dueTime,
        dueWindow: f.dueWindow,
      };
      if (JSON.stringify(before) === JSON.stringify(after)) return ok(state);
      const updated: TaskView = {
        ...task,
        ...after,
        dueAt: computeDueAt(after, ctx.timeZone),
      };
      return ok(
        pushEvent(replaceTask(state, updated), ctx, task.id, "edited", {
          before,
          after,
        }),
      );
    }

    case "assign": {
      const task = find(command.taskId);
      if (!task || !manager) return fail(MANAGER_ONLY);
      if (task.status === "completed" || task.status === "cancelled") {
        return fail("Completed or cancelled tasks cannot be reassigned.");
      }
      const people = validateAssignees(
        command.assignmentMode,
        command.assigneeIds,
        ctx,
      );
      if (!people.ok) return people;
      const oldIds = task.assignees.map((a) => a.profileId).sort();
      const newIds = people.value.map((a) => a.profileId).sort();
      if (
        oldIds.join() === newIds.join() &&
        task.assignmentMode === command.assignmentMode
      ) {
        return ok(state);
      }
      const updated: TaskView = {
        ...task,
        assignmentMode: command.assignmentMode,
        assignees: people.value,
      };
      return ok(
        pushEvent(replaceTask(state, updated), ctx, task.id, "reassigned", {
          from: { mode: task.assignmentMode, assignees: oldIds },
          to: { mode: command.assignmentMode, assignees: newIds },
        }),
      );
    }

    case "setStatus": {
      const task = find(command.taskId);
      if (!task || !canWorkTask(ctx.actor, task)) {
        return fail("That task does not exist or you cannot update it.");
      }
      if (task.status === command.status) return ok(state);
      const allowed =
        (task.status === "open" &&
          (command.status === "in_progress" || command.status === "blocked")) ||
        (task.status === "in_progress" && command.status === "blocked") ||
        (task.status === "blocked" &&
          (command.status === "open" || command.status === "in_progress"));
      if (!allowed) return fail("That status change is not allowed.");
      const reason = command.reason?.trim() || null;
      if (command.status === "blocked" && !reason) {
        return fail("Say what is blocking this task (up to 300 characters).");
      }
      const event =
        command.status === "blocked"
          ? "blocked"
          : task.status === "blocked"
            ? "unblocked"
            : "started";
      const updated: TaskView = {
        ...task,
        status: command.status,
        blockedReason: command.status === "blocked" ? reason : null,
      };
      return ok(
        pushEvent(replaceTask(state, updated), ctx, task.id, event, {
          from: task.status,
          to: command.status,
          reason,
        }),
      );
    }

    case "complete": {
      const task = find(command.taskId);
      if (!task || !canWorkTask(ctx.actor, task)) {
        return fail("That task does not exist or you cannot complete it.");
      }
      // First completer wins; a second completion is a no-op.
      if (task.status === "completed") return ok(state);
      if (task.status === "cancelled") {
        return fail("A cancelled task cannot be completed.");
      }
      const note = command.note?.trim() || null;
      const onBehalf =
        task.assignees.length > 0 &&
        !task.assignees.some((a) => a.profileId === ctx.actor.profileId);
      // Assignees are deliberately untouched.
      const updated: TaskView = {
        ...task,
        status: "completed",
        blockedReason: null,
        completedBy: actorRef(ctx),
        completedAt: ctx.now.toISOString(),
        completionNote: note,
      };
      return ok(
        pushEvent(replaceTask(state, updated), ctx, task.id, "completed", {
          on_behalf: onBehalf,
          assignees: task.assignees.map((a) => a.profileId),
          note,
        }),
      );
    }

    case "reopen": {
      const task = find(command.taskId);
      if (!task || !canWorkTask(ctx.actor, task)) {
        return fail("That task does not exist or you cannot update it.");
      }
      if (task.status !== "completed") return ok(state);
      if (!manager && task.completedBy?.profileId !== ctx.actor.profileId) {
        return fail(
          "Only the person who completed this task or a manager can reopen it.",
        );
      }
      const updated: TaskView = {
        ...task,
        status: "open",
        completedBy: null,
        completedAt: null,
        completionNote: null,
      };
      return ok(
        pushEvent(replaceTask(state, updated), ctx, task.id, "reopened", {
          previous_completed_by: task.completedBy?.profileId ?? null,
          previous_completed_at: task.completedAt,
        }),
      );
    }

    case "cancel": {
      const task = find(command.taskId);
      if (!task || !manager) return fail(MANAGER_ONLY);
      if (task.status === "cancelled") return ok(state);
      if (task.status === "completed") {
        return fail("A completed task cannot be cancelled. Reopen it first.");
      }
      const updated: TaskView = {
        ...task,
        status: "cancelled",
        blockedReason: null,
        cancelledAt: ctx.now.toISOString(),
      };
      return ok(
        pushEvent(replaceTask(state, updated), ctx, task.id, "cancelled", {
          from: task.status,
          reason: command.reason?.trim() || null,
        }),
      );
    }

    case "seriesCreate": {
      if (!manager) return fail(MANAGER_ONLY);
      const built = buildRule(state, command.input, ctx, null);
      if (!built.ok) return built;
      const rule = built.value;
      const next: TasksState = {
        ...state,
        seq: state.seq + 1,
        rules: [...state.rules, rule],
      };
      return ok(materializeRule(next, rule, ctx, todayOf(ctx)));
    }

    case "seriesUpdate": {
      if (!manager) return fail(MANAGER_ONLY);
      const existing = state.rules.find((r) => r.id === command.ruleId);
      if (!existing) return fail(MANAGER_ONLY);
      const built = buildRule(state, command.input, ctx, existing);
      if (!built.ok) return built;
      return ok(applySeriesUpdate(state, built.value, ctx));
    }

    case "seriesStop": {
      if (!manager) return fail(MANAGER_ONLY);
      const existing = state.rules.find((r) => r.id === command.ruleId);
      if (!existing) return fail(MANAGER_ONLY);
      return ok(stopSeries(state, existing, ctx));
    }

    case "templateSave": {
      if (!manager) return fail(MANAGER_ONLY);
      const input: TemplateInput = command.input;
      const items: ChecklistTemplateView["items"] = [];
      let position = 0;
      for (const item of input.items) {
        position += 1;
        if (!DEFAULT_TASK_CATEGORIES.some((c) => c.slug === item.category)) {
          return fail(`Item ${position} has an unknown category.`);
        }
        const people = validateAssignees(
          item.assignmentMode,
          item.assigneeIds,
          ctx,
        );
        if (!people.ok) return people;
        items.push({
          ...item,
          instructions: item.instructions?.trim() || null,
          assigneeIds: people.value.map((p) => p.profileId),
        });
      }
      const name = input.name.trim();
      const existing = command.templateId
        ? state.templates.find((t) => t.id === command.templateId)
        : undefined;
      if (command.templateId && !existing) {
        return fail("That checklist does not exist.");
      }
      if (existing && existing.kind !== input.kind) {
        return fail("A checklist cannot change between opening and closing.");
      }
      const clash = state.templates.some(
        (t) =>
          t.kind === input.kind &&
          t.name.toLowerCase() === name.toLowerCase() &&
          t.id !== command.templateId,
      );
      if (clash) {
        return fail(
          `A ${input.kind} checklist named "${name}" already exists.`,
        );
      }
      const template: ChecklistTemplateView = {
        id: existing?.id ?? `tpl-${state.seq}`,
        kind: input.kind,
        name,
        daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
        active: input.active,
        items,
      };
      return ok({
        ...state,
        seq: existing ? state.seq : state.seq + 1,
        templates: existing
          ? state.templates.map((t) => (t.id === existing.id ? template : t))
          : [...state.templates, template],
      });
    }

    case "templateSetActive": {
      if (!manager) return fail(MANAGER_ONLY);
      if (!state.templates.some((t) => t.id === command.templateId)) {
        return fail(MANAGER_ONLY);
      }
      return ok({
        ...state,
        templates: state.templates.map((t) =>
          t.id === command.templateId ? { ...t, active: command.active } : t,
        ),
      });
    }

    case "carryForward": {
      if (!manager) return fail(MANAGER_ONLY);
      let next = state;
      for (const id of [...new Set(command.taskIds)].sort()) {
        const task = next.tasks.find((t) => t.id === id);
        if (!task) return fail(MANAGER_ONLY);
        if (
          task.kind !== "task" ||
          !["open", "in_progress", "blocked"].includes(task.status)
        ) {
          continue;
        }
        if (task.startDate && task.startDate > command.newDueDate) {
          return fail("The new due date is before the task start date.");
        }
        const updated: TaskView = {
          ...task,
          dueDate: command.newDueDate,
          dueAt: computeDueAt(
            { dueDate: command.newDueDate, dueTime: task.dueTime },
            ctx.timeZone,
          ),
        };
        next = pushEvent(
          replaceTask(next, updated),
          ctx,
          task.id,
          "carried_forward",
          {
            from_due_date: task.dueDate,
            to_due_date: command.newDueDate,
          },
        );
      }
      return ok(next);
    }
  }
}

/** The read model one signed-in person would receive (RLS-equivalent). */
export function buildSnapshot(
  state: TasksState,
  ctx: EngineContext & {
    organizationId: string;
    locationId: string | null;
    today: string;
  },
): TasksSnapshot {
  const manager = isTasksManager(ctx.actor.designation);
  return {
    organizationId: ctx.organizationId,
    locationId: ctx.locationId,
    timeZone: ctx.timeZone,
    today: ctx.today,
    generatedAt: ctx.now.toISOString(),
    tasks: state.tasks.filter(
      (t) => t.kind === "task" && canViewTask(ctx.actor, t),
    ),
    checklists: [...state.instances]
      .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))
      .map((instance) => ({
        id: instance.id,
        kind: instance.kind,
        name: instance.name,
        serviceDate: instance.serviceDate,
        items: state.tasks
          .filter((t) => t.checklistInstanceId === instance.id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    series: manager ? state.rules.filter((r) => r.active) : [],
    templates: manager ? state.templates : [],
    events: manager ? state.events : [],
    team: manager ? [...ctx.team] : [],
    categories: DEFAULT_TASK_CATEGORIES.map((c) => ({ ...c })),
  };
}

// ---------------------------------------------------------------------
// Recurrence (mirrors supabase/migrations/20261025110000_tasks_v1_recurrence.sql)
// ---------------------------------------------------------------------
const HORIZON_DAYS = 14;

function todayOf(ctx: EngineContext): string {
  return zonedWallTimeFromInstant(ctx.now, ctx.timeZone).date;
}

function buildRule(
  state: TasksState,
  input: SeriesInput,
  ctx: EngineContext,
  existing: RecurrenceRuleView | null,
): CommandResult<RecurrenceRuleView> {
  if (!input.title.trim()) {
    return fail("Give the task a title (up to 160 characters).");
  }
  if (!DEFAULT_TASK_CATEGORIES.some((c) => c.slug === input.category)) {
    return fail("Unknown task category.");
  }
  const people = validateAssignees(
    input.assignmentMode,
    input.assigneeIds,
    ctx,
  );
  if (!people.ok) return people;

  let weekdays: number[] | null = null;
  let dayOfMonth: number | null = null;
  if (input.frequency === "weekly") weekdays = [weekdayOf(input.startsOn)];
  if (input.frequency === "selected_weekdays") {
    if (!input.weekdays || input.weekdays.length === 0) {
      return fail("Choose at least one weekday.");
    }
    weekdays = [...new Set(input.weekdays)].sort();
  }
  if (input.frequency === "monthly") {
    dayOfMonth = input.dayOfMonth ?? Number(input.startsOn.slice(8, 10));
  }
  if (
    input.endType === "on_date" &&
    (!input.endsOn || input.endsOn < input.startsOn)
  ) {
    return fail("The end date cannot be before the start date.");
  }
  if (input.endType === "after_count" && !input.maxOccurrences) {
    return fail("Choose how many times it repeats (1 to 1000).");
  }
  return ok({
    id: existing?.id ?? `rule-${state.seq}`,
    title: input.title.trim(),
    instructions: input.instructions?.trim() || null,
    category: input.category,
    priority: input.priority,
    assignmentMode: input.assignmentMode,
    assigneeIds: people.value.map((p) => p.profileId),
    dueTime: input.dueTime,
    dueWindow: input.dueWindow,
    frequency: input.frequency,
    weekdays,
    dayOfMonth,
    startsOn: input.startsOn,
    endType: input.endType,
    endsOn: input.endType === "on_date" ? input.endsOn : null,
    maxOccurrences:
      input.endType === "after_count" ? input.maxOccurrences : null,
    active: true,
    createdBy: existing?.createdBy ?? actorRef(ctx),
  });
}

function resolveSeriesAssignment(
  rule: RecurrenceRuleView,
  ctx: EngineContext,
): { mode: AssignmentMode; assignees: PersonRef[] } {
  const known = new Map(ctx.team.map((m) => [m.profileId, m.name]));
  const active = rule.assigneeIds.filter((id) => known.has(id)).sort();
  let mode = rule.assignmentMode;
  let ids = active;
  if (mode === "all_team" || mode === "anyone") {
    ids = [];
  } else if (mode === "individual" && ids.length !== 1) {
    mode = "anyone";
    ids = [];
  } else if (mode === "multiple") {
    if (ids.length === 1) mode = "individual";
    else if (ids.length === 0) mode = "anyone";
  }
  return {
    mode,
    assignees: ids.map((id) => ({
      profileId: id,
      name: known.get(id) ?? "Team member",
    })),
  };
}

/** Creates any missing occurrences of one rule through today + 14 days. */
export function materializeRule(
  state: TasksState,
  rule: RecurrenceRuleView,
  ctx: EngineContext,
  today: string,
): TasksState {
  if (!rule.active) return state;
  const { mode, assignees } = resolveSeriesAssignment(rule, ctx);
  const from = rule.startsOn > today ? rule.startsOn : today;
  const dates = occurrenceDates(rule, from, addDaysToDate(today, HORIZON_DAYS));
  let next = state;
  for (const date of dates) {
    const exists = next.tasks.some(
      (t) => t.recurrenceRuleId === rule.id && t.dueDate === date,
    );
    if (exists) continue;
    const id = `task-${next.seq}`;
    const task: TaskView = {
      id,
      kind: "task",
      title: rule.title,
      instructions: rule.instructions,
      category: rule.category,
      priority: rule.priority,
      status: "open",
      assignmentMode: mode,
      assignees,
      startDate: null,
      dueDate: date,
      dueTime: rule.dueTime,
      dueWindow: rule.dueWindow,
      dueAt: computeDueAt(
        { dueDate: date, dueTime: rule.dueTime },
        ctx.timeZone,
      ),
      blockedReason: null,
      completedBy: null,
      completedAt: null,
      completionNote: null,
      cancelledAt: null,
      groupId: null,
      recurrenceRuleId: rule.id,
      checklistInstanceId: null,
      sortOrder: 0,
      createdBy: rule.createdBy,
      createdAt: ctx.now.toISOString(),
    };
    next = { ...next, seq: next.seq + 1, tasks: [...next.tasks, task] };
    next = pushEvent(next, ctx, id, "created", {
      title: task.title,
      assignment_mode: mode,
      assignees: assignees.map((a) => a.profileId),
      recurrence_rule_id: rule.id,
    });
  }
  return next;
}

/** Lazy materialization for every active series (idempotent). */
export function generateRecurringTasks(
  state: TasksState,
  ctx: EngineContext,
  today: string,
): TasksState {
  let next = state;
  for (const rule of state.rules) {
    next = materializeRule(next, rule, ctx, today);
  }
  return next;
}

function untouchedFuture(state: TasksState, ruleId: string, today: string) {
  return state.tasks.filter(
    (t) =>
      t.recurrenceRuleId === ruleId &&
      t.dueDate !== null &&
      t.dueDate >= today &&
      t.status === "open",
  );
}

function applySeriesUpdate(
  state: TasksState,
  rule: RecurrenceRuleView,
  ctx: EngineContext,
): TasksState {
  const today = todayOf(ctx);
  let next: TasksState = {
    ...state,
    rules: state.rules.map((r) => (r.id === rule.id ? rule : r)),
  };
  const { mode, assignees } = resolveSeriesAssignment(rule, ctx);
  for (const task of untouchedFuture(state, rule.id, today)) {
    const date = task.dueDate!;
    if (!occurrenceDates(rule, today, date).includes(date)) {
      const cancelled: TaskView = {
        ...task,
        status: "cancelled",
        cancelledAt: ctx.now.toISOString(),
      };
      next = pushEvent(
        replaceTask(next, cancelled),
        ctx,
        task.id,
        "cancelled",
        {
          from: task.status,
          reason: "Series changed",
          rule_id: rule.id,
        },
      );
    } else {
      const updated: TaskView = {
        ...task,
        title: rule.title,
        instructions: rule.instructions,
        category: rule.category,
        priority: rule.priority,
        dueTime: rule.dueTime,
        dueWindow: rule.dueWindow,
        dueAt: computeDueAt(
          { dueDate: date, dueTime: rule.dueTime },
          ctx.timeZone,
        ),
        assignmentMode: mode,
        assignees,
      };
      next = pushEvent(replaceTask(next, updated), ctx, task.id, "edited", {
        scope: "this_and_future",
        rule_id: rule.id,
      });
    }
  }
  return materializeRule(next, rule, ctx, today);
}

function stopSeries(
  state: TasksState,
  rule: RecurrenceRuleView,
  ctx: EngineContext,
): TasksState {
  const today = todayOf(ctx);
  let next: TasksState = {
    ...state,
    rules: state.rules.map((r) =>
      r.id === rule.id ? { ...r, active: false } : r,
    ),
  };
  for (const task of untouchedFuture(state, rule.id, today)) {
    const cancelled: TaskView = {
      ...task,
      status: "cancelled",
      cancelledAt: ctx.now.toISOString(),
    };
    next = pushEvent(replaceTask(next, cancelled), ctx, task.id, "cancelled", {
      from: task.status,
      reason: "Series ended",
      rule_id: rule.id,
    });
  }
  return next;
}
