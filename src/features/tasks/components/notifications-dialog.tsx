"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatBusinessDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

import type { NotificationView } from "../domain/task-types";

type Props = {
  notifications: readonly NotificationView[];
  unreadCount: number;
  timeZone: string;
  onClose: () => void;
  /** null marks every unread notification read. */
  onRead: (ids: number[] | null) => void;
  onOpenTask: (taskId: string) => void;
};

/**
 * The in-app inbox. The database is the source of truth for what exists and
 * what is read; this list is always the last server snapshot. Unread items
 * carry a "New" label as well as weight, so state is never color-only.
 */
export function NotificationsDialog({
  notifications,
  unreadCount,
  timeZone,
  onClose,
  onRead,
  onOpenTask,
}: Props) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Notifications"
      description={
        unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."
      }
    >
      {unreadCount > 0 ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => onRead(null)}
          >
            Mark all read
          </Button>
        </div>
      ) : null}
      {notifications.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notifications yet.</p>
      ) : (
        <ul className="space-y-2" aria-label="Notifications">
          {notifications.map((n) => {
            const unread = !n.readAt;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (unread) onRead([n.id]);
                    if (n.taskId) {
                      onClose();
                      onOpenTask(n.taskId);
                    }
                  }}
                  className={cn(
                    "border-border focus-visible:ring-ring flex min-h-14 w-full items-start gap-3 rounded-xl border p-3 text-left outline-none focus-visible:ring-2",
                    unread ? "bg-primary/10" : "bg-card",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm",
                        unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {n.title}
                    </span>
                    {n.body ? (
                      <span className="text-muted-foreground block truncate text-sm">
                        {n.body}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground block text-xs">
                      {formatBusinessDateTime(n.createdAt, timeZone)}
                    </span>
                  </span>
                  {unread ? <Badge tone="accent">New</Badge> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
