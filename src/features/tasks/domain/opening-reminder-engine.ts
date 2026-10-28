import {
  zonedWallTimeFromInstant,
  zonedWallTimeToInstant,
} from "@/lib/timezone";

import {
  OPENING_REMINDER_OFFSET_MINUTES,
  OPENING_REMINDER_STAGES,
  openingReminderDedupeKey,
  type OpeningReminderStage,
} from "./opening-reminder";
import {
  countIncompleteOpeningWork,
  type OpeningReminderPromptData,
} from "./opening-reminder-popup";
import { notify, type EngineContext, type TasksState } from "./task-engine";
import { canWorkTask, isActiveStatus } from "./task-rules";
import type { TaskView, TaskViewer } from "./task-types";

/**
 * Demo-mode twin of `public.task_opening_reminders_sweep` (Tasks V1.1 T-5).
 *
 * Demo mode has no database, so this mirrors the T-4 evaluator for the
 * in-memory engine -- the same stages, the same "judged at the stage's own
 * instant" rule, the same per-recipient scope and the same dedupe key -- so
 * Playwright and development demos exercise the real popup path. It is not a
 * second policy: real mode never runs it, and it takes the clock from the
 * engine context exactly as the SQL takes `p_now`.
 */

/** The demo location. Real mode uses the database's location id. */
export const DEMO_LOCATION_ID = "demo-location";
/** The demo location's opening time (wall clock in the demo time zone). */
export const DEMO_OPENING_LOCAL = "09:00";

const STAGE_TITLES: Record<OpeningReminderStage, string> = {
  open: "Opening tasks are not complete",
  plus_15: "Opening tasks are still incomplete",
  plus_30: "Opening tasks are overdue",
};

/**
 * Was this item still open at `at`? Rebuilt from the audit trail, never from
 * current status: the latest completed / reopened / cancelled event at or
 * before `at` decides, and no such event means it was open.
 */
function openAt(state: TasksState, taskId: string, at: number): boolean {
  let latest: { type: string; time: number; id: number } | null = null;
  for (const event of state.events) {
    if (
      event.taskId !== taskId ||
      (event.type !== "completed" &&
        event.type !== "reopened" &&
        event.type !== "cancelled")
    ) {
      continue;
    }
    const time = Date.parse(event.createdAt);
    if (time > at) continue;
    if (
      !latest ||
      time > latest.time ||
      (time === latest.time && event.id > latest.id)
    ) {
      latest = { type: event.type, time, id: event.id };
    }
  }
  return latest === null || latest.type === "reopened";
}

/**
 * Stores every due, truly-missed stage once per recipient. Idempotent. A first
 * look at 09:34 on still-open work stores open, +15 and +30 (history); the
 * popup layer, not this function, decides that only +30 interrupts anyone.
 */
export function runDemoOpeningReminders(
  state: TasksState,
  ctx: EngineContext,
): TasksState {
  const date = zonedWallTimeFromInstant(ctx.now, ctx.timeZone).date;
  const openingAt = zonedWallTimeToInstant({
    date,
    time: DEMO_OPENING_LOCAL,
    timeZone: ctx.timeZone,
  }).getTime();
  const now = ctx.now.getTime();
  if (now < openingAt) return state;

  const instanceIds = new Set(
    state.instances
      .filter((i) => i.kind === "opening" && i.serviceDate === date)
      .map((i) => i.id),
  );
  if (instanceIds.size === 0) return state;
  const items = state.tasks.filter(
    (t) =>
      t.kind === "opening" &&
      t.checklistInstanceId !== null &&
      instanceIds.has(t.checklistInstanceId),
  );

  let next = state;
  for (const member of ctx.team) {
    const viewer: TaskViewer = {
      profileId: member.profileId,
      name: member.name,
      designation: member.designation,
    };
    const scope = items.filter((t) => canWorkTask(viewer, t));
    const openNow = scope.filter((t) => isActiveStatus(t.status)).length;
    if (openNow === 0) continue;
    for (const stage of OPENING_REMINDER_STAGES) {
      const at = openingAt + OPENING_REMINDER_OFFSET_MINUTES[stage] * 60_000;
      if (at > now) continue;
      const atStage = scope.filter((t) => openAt(state, t.id, at)).length;
      if (atStage === 0) continue;
      next = notify(next, ctx, {
        recipientId: member.profileId,
        type: "opening_reminder",
        taskId: null,
        title: STAGE_TITLES[stage],
        body:
          atStage === 1
            ? "1 Opening task is not complete"
            : `${atStage} Opening tasks are not complete`,
        dedupeKey: openingReminderDedupeKey(DEMO_LOCATION_ID, date, stage),
        reminder: {
          stage,
          serviceDate: date,
          locationId: DEMO_LOCATION_ID,
          stageAt: new Date(at).toISOString(),
          incompleteCount: atStage,
          incompleteNow: openNow,
        },
      });
    }
  }
  return next;
}

/**
 * The popup read model for one demo viewer: the same shape the real server
 * action returns (own reminders, today, live count), derived from the state.
 */
export function demoOpeningReminderPromptData(
  state: TasksState,
  ctx: EngineContext,
): OpeningReminderPromptData {
  const today = zonedWallTimeFromInstant(ctx.now, ctx.timeZone).date;
  const instanceIds = new Set(
    state.instances
      .filter((i) => i.kind === "opening" && i.serviceDate === today)
      .map((i) => i.id),
  );
  const tasks: TaskView[] = state.tasks;
  return {
    today,
    locationId: DEMO_LOCATION_ID,
    currentIncomplete: countIncompleteOpeningWork(
      tasks,
      instanceIds,
      ctx.actor,
    ),
    reminders: state.notifications
      .filter(
        (n) =>
          n.recipientId === ctx.actor.profileId &&
          n.type === "opening_reminder",
      )
      .map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        taskId: n.taskId,
        checklistInstanceId: n.checklistInstanceId,
        createdAt: n.createdAt,
        readAt: n.readAt,
        reminder: n.reminder,
      })),
  };
}
