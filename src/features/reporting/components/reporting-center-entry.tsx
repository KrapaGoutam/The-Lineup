import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";

import { buildReportingHref } from "@/features/reporting/domain/report-links";

/**
 * Navigation entry to the Reporting Center. Visibility is a convenience only: the Reporting
 * Center page and its actions decide, from verified facts, what the caller may report on
 * (a person without any reporting authority is told so and sees nothing).
 */
export function ReportingCenterEntry() {
  return (
    <Link
      href={buildReportingHref()}
      className="hover:bg-muted border-border bg-card flex min-h-24 w-full items-center gap-4 rounded-2xl border p-5 text-left"
    >
      <span className="bg-primary/10 text-primary grid size-12 flex-none place-items-center rounded-2xl">
        <BarChart3 className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">Reporting Center</span>
        <span className="text-muted-foreground mt-0.5 block text-sm">
          Attendance and payroll reports across your branches
        </span>
      </span>
      <ChevronRight
        className="text-muted-foreground size-[18px] flex-none"
        aria-hidden="true"
      />
    </Link>
  );
}
