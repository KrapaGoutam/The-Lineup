"use client";

import { useEffect, useMemo, useState } from "react";

function partsFor(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export type DayHours = {
  opening: string;
  closing: string;
  closed: boolean;
};

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function useRestaurantClock(
  timeZone: string,
  operatingHours: DayHours[],
) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    const local = partsFor(now, timeZone);
    const todayIndex = weekdayIndex[local.weekday] ?? 0;
    const today = operatingHours[todayIndex];
    const previous = operatingHours[(todayIndex + 6) % 7];
    const secondsNow =
      Number(local.hour) * 3600 +
      Number(local.minute) * 60 +
      Number(local.second);
    const toSeconds = (time: string) => {
      const [hour, minute] = time.split(":").map(Number);
      return hour * 3600 + minute * 60;
    };
    const previousClose = previous ? toSeconds(previous.closing) : 0;
    const previousOpen = previous ? toSeconds(previous.opening) : 0;
    const isPreviousOvernight = Boolean(
      previous &&
        !previous.closed &&
        previousClose <= previousOpen &&
        secondsNow < previousClose,
    );
    const isClosedToday = !today || today.closed;
    const opening = today ? toSeconds(today.opening) : 0;
    let closing = today ? toSeconds(today.closing) : 0;
    if (today && closing <= opening) closing += 86_400;
    const remaining = isPreviousOvernight
      ? previousClose - secondsNow
      : isClosedToday
        ? 0
        : Math.max(0, closing - secondsNow);
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return {
      dateTime: new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(now),
      countdown:
        isClosedToday && !isPreviousOvernight
          ? "Closed today"
          : remaining === 0
            ? "Day ended"
            : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      isClosed: remaining === 0,
    };
  }, [now, operatingHours, timeZone]);
}
