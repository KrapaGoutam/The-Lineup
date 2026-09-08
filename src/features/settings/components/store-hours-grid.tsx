import type { DayHours } from "@/hooks/use-restaurant-clock";
import { cn } from "@/lib/utils";

const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Feature 023. Pure presentation of the 7-day operating-hours array that
 * already drives the header countdown (`useRestaurantClock`) -- this
 * component fetches nothing and owns no state, it only renders whatever
 * `hours`/`todayIndex` it's given. `todayIndex` is passed in rather than
 * computed here so there's exactly one place (restaurant-operations-app.tsx)
 * that decides "today" for the whole shell, matching how the avatar panel's
 * own store-hours summary already does it.
 */
export function StoreHoursGrid({
  hours,
  todayIndex,
}: {
  hours: DayHours[];
  todayIndex: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
      {weekDayLabels.map((label, index) => {
        const day = hours[index];
        const isToday = index === todayIndex;
        return (
          <div
            key={label}
            className={cn(
              "flex flex-col gap-1.5 rounded-2xl border p-3.5",
              isToday
                ? "border-primary bg-primary/10"
                : "border-border bg-background",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-semibold tracking-wider uppercase",
                isToday ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {day?.closed ? (
              <span className="text-muted-foreground text-sm font-medium">
                Closed
              </span>
            ) : (
              <span className="font-mono text-sm tabular-nums">
                {day?.opening ?? "—"} – {day?.closing ?? "—"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
