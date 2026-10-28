"use client";

import { useEffect, useMemo } from "react";

import type { Designation } from "@/features/auth/domain/passcode";

import type { TasksState } from "../domain/task-engine";
import type { TaskTeamMember } from "../domain/task-types";
import { useTasksController } from "../hooks/use-tasks-controller";
import { TasksWorkspace } from "./tasks-workspace";

export type TasksDemoBinding = {
  state: TasksState;
  setState: (next: TasksState) => void;
  team: readonly TaskTeamMember[];
  timeZone: string;
  organizationId: string;
  /** Run the demo Opening reminder engine (opt-in; see the app shell). */
  openingReminders?: boolean;
};

type Props = {
  restaurantSlug: string;
  user: { profileId: string; name: string; designation: Designation };
  /** Present in demo mode only; real mode reads and writes the database. */
  demo: TasksDemoBinding | null;
  onSessionInvalid?: () => void;
  /** Lets the app shell keep its Tasks tab badge in step with the inbox. */
  onUnreadChange?: (unread: number) => void;
};

/**
 * Mounts the Tasks controller only while the Tasks tab is open (hooks cannot
 * live behind the app shell's signed-out early returns). Leaving the tab and
 * coming back re-fetches, which is exactly the stale-state recovery Tasks
 * relies on instead of Realtime.
 */
export function TasksModule({
  restaurantSlug,
  user,
  demo,
  onSessionInvalid,
  onUnreadChange,
}: Props) {
  const viewer = useMemo(
    () => ({
      profileId: user.profileId,
      name: user.name,
      designation: user.designation,
    }),
    [user.profileId, user.name, user.designation],
  );
  const controller = useTasksController({
    demo,
    restaurantSlug,
    viewer,
    onSessionInvalid,
  });
  const unread = controller.snapshot?.unreadCount;
  useEffect(() => {
    if (unread !== undefined) onUnreadChange?.(unread);
  }, [unread, onUnreadChange]);
  return <TasksWorkspace controller={controller} />;
}
