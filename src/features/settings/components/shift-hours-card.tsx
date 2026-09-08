import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";

const rows: Array<{ label: string; key: keyof ShiftDefaults }> = [
  { label: "Morning", key: "morning" },
  { label: "Evening", key: "evening" },
  { label: "Full day", key: "full_day" },
];

/**
 * Feature 023, manager-only card. Read-only display of the three shift-
 * label defaults, with an "Edit" button that hands off to the existing
 * `HoursDialog` (via `onEdit`) rather than this component owning its own
 * edit form -- there is exactly one place in the app that writes these
 * values (`saveScheduleConfig`, unchanged), and it already keeps the
 * header countdown in sync.
 */
export function ShiftHoursCard({
  shiftDefaults,
  onEdit,
}: {
  shiftDefaults: ShiftDefaults;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Shift hours</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Defaults applied to every new shift. Individual shifts can still
            override them.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(({ label, key }) => {
          const value = shiftDefaults[key];
          return (
            <div
              key={key}
              className="border-border grid grid-cols-[100px_1fr] items-center gap-3 border-b py-2 text-sm last:border-b-0"
            >
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {value.start} – {value.end}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
