"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useContextSwitch } from "@/features/context/components/use-context-switch";
import type { AvailableContextSummary } from "@/features/context/domain/active-context";
import { groupContextsByOrganization } from "@/features/context/domain/context-navigation";

/**
 * V2-003.001/.002: shown when the server could not establish ONE verified
 * (organization, location) for an authenticated request. No operational data
 * has been loaded. The user can explicitly choose among their VERIFIED
 * eligible locations (the choice is only a request; the server re-validates
 * it) or retry. It never invents an eligible context and never lists anything
 * beyond what the server returned for this user.
 */
export function ContextUnavailableNotice({
  status,
  availableContexts = [],
  availableContextsFailed = false,
}: {
  status: "selection_required" | "invalid_context" | "error";
  availableContexts?: readonly AvailableContextSummary[];
  availableContextsFailed?: boolean;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const { switchingTo, switchTo } = useContextSwitch();

  const copy =
    status === "selection_required"
      ? {
          title: "Choose a location",
          body: "Your account can work at more than one location. Choose where to work before this workspace opens.",
        }
      : status === "invalid_context"
        ? {
            title: "Location selection is no longer valid",
            body: "That location doesn't match your current access. No data has been loaded. Choose a location you can access, or try again.",
          }
        : {
            title: "Workspace unavailable",
            body: "We couldn't verify your location access right now. No data has been loaded. Please try again.",
          };

  const showChoices = status !== "error" && availableContexts.length > 0;
  const groups = groupContextsByOrganization(availableContexts);

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

          {showChoices ? (
            <nav
              aria-label="Available locations"
              className="flex flex-col gap-3"
            >
              {groups.map((group) => (
                <section
                  key={group.organizationId}
                  aria-label={group.organizationName}
                >
                  <h2 className="text-muted-foreground pb-1 text-xs font-semibold tracking-wide uppercase">
                    {group.organizationName}
                  </h2>
                  <ul className="flex flex-col gap-1.5">
                    {group.locations.map((context) => (
                      <li key={context.locationId}>
                        <Button
                          variant="outline"
                          className="min-h-12 w-full justify-start"
                          disabled={!!switchingTo}
                          onClick={() => switchTo(context)}
                          data-location-id={context.locationId}
                        >
                          {context.locationName}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          ) : null}

          {status !== "error" && availableContextsFailed ? (
            <p role="alert" className="text-destructive text-sm">
              We couldn&apos;t load your locations. Please try again.
            </p>
          ) : null}

          {switchingTo ? (
            <p role="status" className="text-muted-foreground text-sm">
              Opening {switchingTo.organizationName} —{" "}
              {switchingTo.locationName}…
            </p>
          ) : null}

          {status === "error" ||
          status === "invalid_context" ||
          availableContextsFailed ? (
            <Button
              variant="secondary"
              className="min-h-11 self-start"
              disabled={retrying}
              onClick={() => startRetry(() => router.refresh())}
            >
              <RefreshCw aria-hidden className="size-4" />
              {retrying ? "Checking…" : "Try again"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
