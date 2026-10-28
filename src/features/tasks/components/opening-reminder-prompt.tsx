"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import {
  openingReminderCopy,
  type OpeningReminderPopup,
} from "../domain/opening-reminder-popup";
import {
  useOpeningReminderPrompt,
  type OpeningReminderSource,
} from "../hooks/use-opening-reminder-prompt";

type DialogProps = {
  popup: OpeningReminderPopup | null;
  currentIncomplete: number;
  isManagement: boolean;
  /** Dismiss, the close button and Escape all land here: acknowledge only. */
  onDismiss: () => void;
  /** Acknowledge, then take the person to Tasks. */
  onView: () => void;
};

/**
 * The one Opening reminder dialog. Presentation only: the popup it shows was
 * chosen by `selectOpeningReminderPopup`, and every way out (Dismiss, the X,
 * Escape, the backdrop) is the same acknowledgement, so no path hides it for
 * now and brings it back a moment later. Nothing here touches task state.
 *
 * The dialog stays mounted once shown and is closed through `open`, so the
 * browser returns focus to whatever had it before. Its last content is kept
 * while it closes so the title never flashes empty.
 */
export function OpeningReminderDialog({
  popup,
  currentIncomplete,
  isManagement,
  onDismiss,
  onView,
}: DialogProps) {
  const [shown, setShown] = useState<{
    popup: OpeningReminderPopup;
    currentIncomplete: number;
  } | null>(null);
  if (
    popup &&
    (!shown ||
      shown.popup.notificationId !== popup.notificationId ||
      shown.currentIncomplete !== currentIncomplete)
  ) {
    setShown({ popup, currentIncomplete });
  }
  const open = popup !== null;
  const bodyRef = useRef<HTMLDivElement>(null);
  // The browser would focus the close button (first in the dialog); the
  // primary action is where a person on a busy floor wants to land.
  useEffect(() => {
    if (open) {
      bodyRef.current
        ?.querySelector<HTMLElement>("[data-initial-focus]")
        ?.focus();
    }
  }, [open]);

  if (!shown) return null;
  const copy = openingReminderCopy(shown.popup.reminder.stage, {
    isManagement,
    currentIncomplete: shown.currentIncomplete,
  });
  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      title={copy.title}
      description={copy.description}
      className="max-w-[min(92vw,26rem)]"
    >
      <div
        ref={bodyRef}
        data-testid="opening-reminder-popup"
        className="flex flex-col gap-4"
      >
        <div>
          <Badge tone={copy.tone}>{copy.stageLabel}</Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            data-initial-focus
            className="min-h-12 w-full sm:w-auto"
            onClick={onView}
          >
            {copy.cta}
          </Button>
          <Button
            variant="secondary"
            className="min-h-12 w-full sm:w-auto"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type Props = {
  source: OpeningReminderSource;
  isManagement: boolean;
  /** Take the person to Tasks; called after the popup is acknowledged. */
  onViewTasks: () => void;
  onSessionInvalid?: () => void;
  /** After a reminder was acknowledged (so the shell can refresh its badge). */
  onAcknowledged?: () => void;
};

/**
 * Mounted in the app shell for a signed-in person, so the reminder reaches them
 * on any module. Signing out unmounts it, which drops every bit of its state;
 * the next person starts clean.
 */
export function OpeningReminderPrompt({
  source,
  isManagement,
  onViewTasks,
  onSessionInvalid,
  onAcknowledged,
}: Props) {
  const { popup, currentIncomplete, acknowledge } = useOpeningReminderPrompt({
    source,
    onSessionInvalid,
    onAcknowledged,
  });
  return (
    <OpeningReminderDialog
      popup={popup}
      currentIncomplete={currentIncomplete}
      isManagement={isManagement}
      onDismiss={acknowledge}
      onView={() => {
        acknowledge();
        onViewTasks();
      }}
    />
  );
}
