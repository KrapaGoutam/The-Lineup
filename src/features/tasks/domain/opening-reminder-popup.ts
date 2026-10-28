import {
  OPENING_REMINDER_STAGES,
  type OpeningReminder,
  type OpeningReminderStage,
} from "./opening-reminder";
import { canWorkTask, isActiveStatus } from "./task-rules";
import type { NotificationView, TaskView, TaskViewer } from "./task-types";

/**
 * Opening reminder popup (Tasks V1.1 T-5, PLAN D-5).
 *
 * The database stores every legitimately missed stage (T-4 catch-up: a first
 * look at 09:34 on still-open work can store open, +15 and +30). Storage is
 * history; the popup is a presentation decision. This module is that decision
 * and nothing else: it never computes timing, never mutates anything and never
 * reads the clock. Stage ids come from the stored machine-readable payload,
 * never from title text.
 */

/** Urgency order within one service day: +30 > +15 > open. */
const STAGE_RANK: Record<OpeningReminderStage, number> = Object.fromEntries(
  OPENING_REMINDER_STAGES.map((stage, index) => [stage, index]),
) as Record<OpeningReminderStage, number>;

export function openingReminderStageRank(stage: OpeningReminderStage): number {
  return STAGE_RANK[stage];
}

export type OpeningReminderPopup = {
  /** The one notification the popup stands for (and the one Dismiss reads). */
  notificationId: number;
  reminder: OpeningReminder;
};

/**
 * What the popup needs from a source (the database in real mode, the in-memory
 * engine in demo mode). Own rows and a number only: nothing about coworkers.
 */
export type OpeningReminderPromptData = {
  today: string;
  locationId: string;
  currentIncomplete: number;
  reminders: NotificationView[];
};

export type PopupSelectionInput = {
  /** The viewer's own opening_reminder notifications, read and unread. */
  reminders: readonly NotificationView[];
  /** Location-local service date now, as decided by the server. */
  today: string;
  /** The location this session is working in. */
  locationId: string | null;
  /**
   * Incomplete required Opening items in the viewer's own scope right now,
   * read from the live Tasks data (not from the stored payload).
   */
  currentIncomplete: number;
};

/**
 * The single popup for this moment, or null.
 *
 * - Only a reminder of today's service date at this location can pop: an older
 *   day's reminder is history, not current work.
 * - Nothing pops when no Opening work is incomplete now (completed or
 *   cancelled after the reminder was stored). The stored row is untouched.
 * - Of the unread candidates only the most urgent stage pops, so a catch-up
 *   that stored open + 15 + 30 yields one popup (+30), never three in a row.
 * - A stage at or below one the viewer already acknowledged is superseded: it
 *   stays unread in the inbox but never pops. Without this, dismissing +30
 *   would surface +15 on the next refresh, which is the same spam in slow
 *   motion. A later, higher stage still pops.
 */
export function selectOpeningReminderPopup(
  input: PopupSelectionInput,
): OpeningReminderPopup | null {
  if (input.locationId === null || input.currentIncomplete <= 0) return null;

  const today: { n: NotificationView; reminder: OpeningReminder }[] = [];
  for (const n of input.reminders) {
    const reminder = n.type === "opening_reminder" ? n.reminder : null;
    if (
      !reminder ||
      reminder.serviceDate !== input.today ||
      reminder.locationId !== input.locationId
    ) {
      continue;
    }
    today.push({ n, reminder });
  }

  let acknowledgedRank = -1;
  for (const { n, reminder } of today) {
    if (n.readAt) {
      acknowledgedRank = Math.max(acknowledgedRank, STAGE_RANK[reminder.stage]);
    }
  }

  let best: { n: NotificationView; reminder: OpeningReminder } | null = null;
  for (const entry of today) {
    if (entry.n.readAt) continue;
    const rank = STAGE_RANK[entry.reminder.stage];
    if (rank <= acknowledgedRank) continue;
    if (
      !best ||
      rank > STAGE_RANK[best.reminder.stage] ||
      (rank === STAGE_RANK[best.reminder.stage] && entry.n.id > best.n.id)
    ) {
      best = entry;
    }
  }
  return best ? { notificationId: best.n.id, reminder: best.reminder } : null;
}

/**
 * Opening items still open right now in this viewer's own work scope, from live
 * Tasks data. This is what keeps the popup honest: a reminder stored when work
 * was open must not interrupt someone after the work is done or cancelled. It
 * mirrors the evaluator's scope (management: every item; staff: only what they
 * may work, `private.tasks_can_work`) and its "open" statuses, and it counts a
 * number only -- no ids, names or titles leave this function.
 *
 * `openingInstanceIds` are today's Opening checklist instances at the location.
 */
export function countIncompleteOpeningWork(
  tasks: readonly TaskView[],
  openingInstanceIds: ReadonlySet<string>,
  viewer: TaskViewer,
): number {
  let count = 0;
  for (const task of tasks) {
    if (
      task.kind === "opening" &&
      task.checklistInstanceId !== null &&
      openingInstanceIds.has(task.checklistInstanceId) &&
      isActiveStatus(task.status) &&
      canWorkTask(viewer, task)
    ) {
      count += 1;
    }
  }
  return count;
}

export type OpeningReminderCopy = {
  title: string;
  description: string;
  /** Primary action; navigates to Tasks and acknowledges. */
  cta: string;
  /** Short stage label shown as a badge (text, never color alone). */
  stageLabel: string;
  tone: "accent" | "warning" | "danger";
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Concise, stage-aware copy. Management sees the authoritative count of
 * Opening items still open; staff only ever see that they have work (their own
 * scope, no number, no names). The wording describes the stage, not an elapsed
 * time, because the stage is all the database guarantees.
 */
export function openingReminderCopy(
  stage: OpeningReminderStage,
  options: { isManagement: boolean; currentIncomplete: number },
): OpeningReminderCopy {
  const n = options.currentIncomplete;
  const items = `${n} Opening ${plural(n, "item", "items")}`;
  if (options.isManagement) {
    const cta = "View Opening Tasks";
    if (stage === "open") {
      return {
        title: "Opening Tasks Are Ready",
        description: `${items} to complete.`,
        cta,
        stageLabel: "Opening",
        tone: "accent",
      };
    }
    if (stage === "plus_15") {
      return {
        title: "Opening Tasks Need Attention",
        description: `${items} ${plural(n, "is", "are")} still incomplete.`,
        cta,
        stageLabel: "Still open",
        tone: "warning",
      };
    }
    return {
      title: "Opening Tasks Need Attention",
      description: `${items} ${plural(n, "needs", "need")} attention.`,
      cta,
      stageLabel: "Needs attention",
      tone: "danger",
    };
  }
  const cta = "View My Opening Tasks";
  if (stage === "open") {
    return {
      title: "Opening Task Reminder",
      description: "Your Opening tasks are ready.",
      cta,
      stageLabel: "Opening",
      tone: "accent",
    };
  }
  if (stage === "plus_15") {
    return {
      title: "Opening Task Reminder",
      description: "You still have Opening work to complete.",
      cta,
      stageLabel: "Still open",
      tone: "warning",
    };
  }
  return {
    title: "Opening Task Reminder",
    description: "Your Opening work needs attention.",
    cta,
    stageLabel: "Needs attention",
    tone: "danger",
  };
}
