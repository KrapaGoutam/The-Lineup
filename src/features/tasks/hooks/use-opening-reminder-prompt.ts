"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  selectOpeningReminderPopup,
  type OpeningReminderPopup,
  type OpeningReminderPromptData,
} from "../domain/opening-reminder-popup";
import { createWakeGate } from "./wake-gate";

export type OpeningReminderLoadResult =
  | { ok: true; data: OpeningReminderPromptData }
  | { ok: false; sessionInvalid?: boolean };

/**
 * Where the popup's facts come from. Real mode: Server Actions (the database
 * sweeps and answers). Demo mode: the in-memory engine. The hook is the same.
 */
export type OpeningReminderSource = {
  /** Ask the authority to evaluate, then read back the caller's own state. */
  load: () => Promise<OpeningReminderLoadResult>;
  /** Mark the caller's own reminder notification read. */
  acknowledge: (id: number) => Promise<boolean>;
};

/** Collapses focus + visibility + online bursts (and a second tab) to one call. */
export const WAKE_MIN_INTERVAL_MS = 5_000;
/**
 * A device left open on one screen has no focus event to wake it, so a visible
 * tab asks again once a minute. The server decides what is due; this only asks.
 */
export const WAKE_HEARTBEAT_MS = 60_000;

function monotonicNow(): number {
  return performance.now();
}

type Options = {
  source: OpeningReminderSource;
  onSessionInvalid?: () => void;
  /** Called after the server saved an acknowledgement. */
  onAcknowledged?: () => void;
};

export type OpeningReminderPrompt = {
  popup: OpeningReminderPopup | null;
  currentIncomplete: number;
  /** Acknowledges the shown reminder (and nothing else). Idempotent. */
  acknowledge: () => void;
};

/**
 * Wakes the authority, reads back the caller's own reminders and exposes the
 * single popup that should be on screen (or none). It owns no timing rule:
 * which stage is due, for whom and whether it already exists is the database's
 * decision. A failed wake keeps the last known state and retries on the next
 * trigger; it never invents or clears a reminder.
 *
 * Wake triggers: mount (sign-in / first authenticated load), tab becoming
 * visible, window focus, coming back online, and a one-minute heartbeat while
 * visible. All of them pass through one gate.
 */
export function useOpeningReminderPrompt({
  source,
  onSessionInvalid,
  onAcknowledged,
}: Options): OpeningReminderPrompt {
  const [data, setData] = useState<OpeningReminderPromptData | null>(null);
  // Acknowledged here but possibly not yet visible in a refetch. Optimistic
  // only: the server's read state is what survives a reload or another tab.
  const [acked, setAcked] = useState<ReadonlySet<number>>(() => new Set());

  const [gate] = useState(() =>
    createWakeGate(WAKE_MIN_INTERVAL_MS, monotonicNow),
  );
  const sourceRef = useRef(source);
  const sessionRef = useRef(onSessionInvalid);
  const acknowledgedRef = useRef(onAcknowledged);
  useEffect(() => {
    sourceRef.current = source;
    sessionRef.current = onSessionInvalid;
    acknowledgedRef.current = onAcknowledged;
  });
  const aliveRef = useRef(true);

  const wake = useCallback(async () => {
    if (!gate.tryEnter()) return;
    try {
      const result = await sourceRef.current.load();
      if (!aliveRef.current) return;
      if (result.ok) setData(result.data);
      else if (result.sessionInvalid) sessionRef.current?.();
    } catch (error) {
      // Transient failure: keep what we know, try again on the next wake.
      console.error("opening reminder wake failed", error);
    } finally {
      gate.leave();
    }
  }, [gate]);

  useEffect(() => {
    aliveRef.current = true;
    void wake();
    const onVisible = () => {
      if (document.visibilityState === "visible") void wake();
    };
    const onFocus = () => void wake();
    const onOnline = () => void wake();
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") void wake();
    }, WAKE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      aliveRef.current = false;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [wake]);

  const popup = useMemo(() => {
    if (!data) return null;
    return selectOpeningReminderPopup({
      reminders: data.reminders.map((n) =>
        acked.has(n.id) && !n.readAt
          ? { ...n, readAt: new Date(0).toISOString() }
          : n,
      ),
      today: data.today,
      locationId: data.locationId,
      currentIncomplete: data.currentIncomplete,
    });
  }, [data, acked]);

  const popupRef = useRef(popup);
  useEffect(() => {
    popupRef.current = popup;
  });

  const acknowledge = useCallback(() => {
    const current = popupRef.current;
    if (!current) return;
    const id = current.notificationId;
    popupRef.current = null;
    setAcked((prev) => new Set(prev).add(id));
    void (async () => {
      let saved = false;
      try {
        saved = await sourceRef.current.acknowledge(id);
      } catch (error) {
        console.error("opening reminder acknowledge failed", error);
      }
      if (!aliveRef.current) return;
      if (!saved) {
        // Not saved: forget the optimistic mark so the server's truth rules.
        setAcked((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return;
      }
      acknowledgedRef.current?.();
      // Converge on the server's read state (and pick up a later stage). The
      // gate may defer this; the next wake then does the same.
      void wake();
    })();
  }, [wake]);

  return {
    popup,
    currentIncomplete: data?.currentIncomplete ?? 0,
    acknowledge,
  };
}
