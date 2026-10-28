import {
  Archive,
  CheckCircle2,
  CircleDashed,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { STATUS_LABEL, type StockStatus } from "../../domain/stock-rules";

export { STATUS_LABEL };

const TONE = {
  critical: "danger",
  low: "warning",
  healthy: "success",
  no_cutoff: "neutral",
  archived: "neutral",
} as const;

const ICON = {
  critical: OctagonAlert,
  low: TriangleAlert,
  healthy: CheckCircle2,
  no_cutoff: CircleDashed,
  archived: Archive,
} as const;

/** Icon + text + tone: status is never conveyed by colour alone. */
export function StatusBadge({ status }: { status: StockStatus }) {
  const Icon = ICON[status];
  return (
    <Badge tone={TONE[status]}>
      <Icon aria-hidden="true" className="size-3.5" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
