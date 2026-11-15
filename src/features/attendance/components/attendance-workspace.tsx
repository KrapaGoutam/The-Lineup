"use client";

import { useEffect, useState } from "react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAttendanceSourceAction,
  type AttendanceSourceView,
} from "@/features/attendance/actions/native-report-actions";
import { AttendanceReport } from "@/features/attendance/components/attendance-report";
import { NativeAttendanceReport } from "@/features/attendance/components/native-attendance-report";
import { timeZoneAbbreviation } from "@/features/attendance/domain/native-report";

type SourceState =
  | { status: "loading" }
  | { status: "ready"; source: AttendanceSourceView }
  | { status: "legacy"; reason: string }
  | { status: "error"; message: string };

/**
 * V2-006.005. Chooses WHICH attendance source this location uses and renders exactly one:
 * the native report (TheLineup Internal), the existing external report (unchanged), or an
 * "attendance is off" notice. The two sources are never merged, and the source is always
 * labelled. If no location can be verified the existing external report is shown unchanged
 * (the pre-V2 behaviour) and native records are never shown without a verified location.
 */
export function AttendanceWorkspace({
  restaurantSlug,
  demoMode,
  timeZone,
  user,
  demoNeonUserId = null,
}: {
  restaurantSlug: string;
  demoMode: boolean;
  timeZone: string;
  user: SignedInUser;
  demoNeonUserId?: number | null;
}) {
  const [state, setState] = useState<SourceState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    async function load() {
      const result = await getAttendanceSourceAction({ restaurantSlug });
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "ready", source: result.data });
      } else if (result.contextStale) {
        setState({ status: "legacy", reason: result.error });
      } else {
        setState({ status: "error", message: result.error });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, demoMode, reloadKey]);

  const legacy = (
    <AttendanceReport
      restaurantSlug={restaurantSlug}
      demoMode={demoMode}
      timeZone={timeZone}
      user={user}
      demoNeonUserId={demoNeonUserId}
    />
  );

  // Demo mode has no database: the existing demo report is the whole experience.
  if (demoMode) return legacy;

  if (state.status === "loading") {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading attendance…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          <p role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                setReloadKey((k) => k + 1);
              }}
            >
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "legacy") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          Showing the existing external records. {state.reason}
        </p>
        {legacy}
      </div>
    );
  }

  const { source } = state;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{source.locationName}</span>
        <Badge tone={source.source === "internal" ? "accent" : "neutral"}>
          Source: {source.label}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Times in {source.timeZone} (
          {timeZoneAbbreviation(null, source.timeZone)})
        </span>
      </div>
      {source.source === "internal" ? (
        <NativeAttendanceReport
          restaurantSlug={restaurantSlug}
          source={source}
        />
      ) : null}
      {source.source === "external" || source.source === "unconfigured" ? (
        <>
          {source.source === "unconfigured" ? (
            <p className="text-muted-foreground text-xs">
              {source.description}
            </p>
          ) : null}
          {legacy}
        </>
      ) : null}
      {source.source === "disabled" ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-semibold">Attendance is turned off</p>
            <p className="text-muted-foreground text-sm">
              {source.description} No clock-ins are accepted here. An owner can
              turn it back on in location settings.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
