import {
  acknowledgeOpeningReminderAction,
  getOpeningReminderPromptAction,
} from "@/features/tasks/actions/tasks-actions";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import { generateDailyChecklists } from "../domain/checklist-engine";
import {
  demoOpeningReminderPromptData,
  runDemoOpeningReminders,
} from "../domain/opening-reminder-engine";
import {
  applyCommand,
  type EngineContext,
  type TasksState,
} from "../domain/task-engine";
import type { TaskTeamMember, TaskViewer } from "../domain/task-types";
import type { OpeningReminderSource } from "../hooks/use-opening-reminder-prompt";

/**
 * Real mode: two thin Server Actions. The browser names the restaurant and
 * (to acknowledge) one of its own notification ids; never a stage, a
 * recipient or a time.
 */
export function createRealOpeningReminderSource(
  restaurantSlug: string,
): OpeningReminderSource {
  return {
    async load() {
      const result = await getOpeningReminderPromptAction({ restaurantSlug });
      if (result.ok) return { ok: true, data: result.data };
      return { ok: false, sessionInvalid: result.sessionInvalid };
    },
    async acknowledge(id) {
      const result = await acknowledgeOpeningReminderAction({
        restaurantSlug,
        ids: [id],
      });
      return result.ok;
    },
  };
}

export type DemoReminderBinding = {
  /** Latest demo state (read at call time, so a wake never uses a stale copy). */
  getState: () => TasksState;
  setState: (next: TasksState) => void;
  team: readonly TaskTeamMember[];
  timeZone: string;
  viewer: TaskViewer;
};

/**
 * Demo mode: the same questions answered by the in-memory engine -- the demo
 * twin of the sweep, then the same read model the server action returns.
 */
export function createDemoOpeningReminderSource(
  binding: DemoReminderBinding,
): OpeningReminderSource {
  const context = (): EngineContext => ({
    actor: binding.viewer,
    team: binding.team,
    timeZone: binding.timeZone,
    now: new Date(),
  });
  return {
    async load() {
      const ctx = context();
      const today = zonedWallTimeFromInstant(ctx.now, ctx.timeZone).date;
      const before = binding.getState();
      const next = runDemoOpeningReminders(
        generateDailyChecklists(before, ctx, today, today),
        ctx,
      );
      if (next !== before) binding.setState(next);
      return { ok: true, data: demoOpeningReminderPromptData(next, ctx) };
    },
    async acknowledge(id) {
      const result = applyCommand(
        binding.getState(),
        { type: "notificationsRead", ids: [id] },
        context(),
      );
      if (!result.ok) return false;
      binding.setState(result.value);
      return true;
    },
  };
}
