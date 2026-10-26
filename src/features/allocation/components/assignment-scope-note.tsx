import { Badge } from "@/components/ui/badge";
import type { AssignmentScope } from "@/features/allocation/domain/assignment-scope";

/**
 * #109 U3 -- inline scope copy for the surfaces where Transfer / End /
 * Unassign are chosen (Floor's table panel, Servers' table dialog). Both
 * render nothing for a single-table assignment, so ordinary actions stay
 * concise, and neither adds a click: the explanation sits next to the button
 * and is tied to it with aria-describedby, so a screen reader announces the
 * scope with the action rather than only when someone finds a banner.
 */

/** "Combined · T1 + T2 are one assignment." Text, never colour alone. */
export function AssignmentSummary({
  id,
  scope,
}: {
  id?: string;
  scope: AssignmentScope;
}) {
  if (!scope.summary) return null;
  return (
    <p id={id} className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge tone="accent">Combined</Badge>
      <span>{scope.summary}</span>
    </p>
  );
}

/** One muted sentence under the action it explains. */
export function ActionNote({ id, text }: { id: string; text: string | null }) {
  if (!text) return null;
  return (
    <p id={id} className="text-muted-foreground -mt-0.5 text-[11px]">
      {text}
    </p>
  );
}
