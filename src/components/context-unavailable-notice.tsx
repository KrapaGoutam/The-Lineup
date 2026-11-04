import { ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { AvailableContextSummary } from "@/features/context/domain/active-context";

/**
 * V2-003.001: minimal, NON-interactive state shown when the server could not
 * establish ONE verified (organization, location) for an authenticated
 * request. Deliberately no switcher and no navigation: the interactive
 * selector is V2-003.002 and auto-selection is V2-003.003. Nothing here
 * loads or reveals operational data.
 */
export function ContextUnavailableNotice({
  status,
  availableContexts = [],
}: {
  status: "selection_required" | "invalid_context" | "error";
  availableContexts?: readonly AvailableContextSummary[];
}) {
  const copy =
    status === "selection_required"
      ? {
          title: "Choose a location",
          body: "Your account can work at more than one location. A location must be selected before this workspace can open.",
        }
      : status === "invalid_context"
        ? {
            title: "Location selection is no longer valid",
            body: "The saved location selection does not match your current access. No data has been loaded.",
          }
        : {
            title: "Workspace unavailable",
            body: "We couldn't verify your location access right now. No data has been loaded. Please try again shortly.",
          };

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-4"
      data-testid="context-unavailable"
      data-context-status={status}
    >
      <Card className="w-full">
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert aria-hidden className="text-muted-foreground size-5" />
            <h1 className="text-lg font-semibold">{copy.title}</h1>
          </div>
          <p className="text-muted-foreground text-sm">{copy.body}</p>
          {status === "selection_required" && availableContexts.length > 0 ? (
            <ul
              className="list-disc pl-5 text-sm"
              aria-label="Available locations"
            >
              {availableContexts.map((context) => (
                <li key={`${context.organizationId}:${context.locationId}`}>
                  {context.organizationName} — {context.locationName}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
