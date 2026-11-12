"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coffee,
  FileText,
  LogOut,
  Play,
  RotateCcw,
  Square,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { KioskActiveContext } from "../domain/kiosk-device";
import type { KioskEmployeeSessionState } from "./kiosk-app";
import {
  kioskBreakEndAction,
  kioskBreakStartAction,
  kioskClearSessionAction,
  kioskClockInAction,
  kioskClockOutAction,
  kioskGetActiveStatusAction,
} from "../actions/kiosk-clock-actions";
import type { AttendanceSessionModel } from "@/features/attendance/domain/attendance-session";
import type { ClockOperationResponse } from "@/features/attendance/data/native-attendance-data";
import { KioskReportDialog } from "./kiosk-report-dialog";

export interface KioskAttendanceScreenProps {
  readonly context: KioskActiveContext;
  readonly employee: KioskEmployeeSessionState;
  readonly onFinished: () => void;
  readonly onDeviceRevoked?: () => void;
}

const INACTIVITY_TIMEOUT_SECONDS = 45;

function formatElapsed(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function KioskAttendanceScreen({
  context,
  employee,
  onFinished,
  onDeviceRevoked,
}: KioskAttendanceScreenProps) {
  const [activeSession, setActiveSession] =
    React.useState<AttendanceSessionModel | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [actionInProgress, setActionInProgress] =
    React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<{
    readonly action: "clock_in" | "clock_out" | "break_start" | "break_end";
    readonly data: ClockOperationResponse;
  } | null>(null);

  // Inactivity countdown
  const [secondsRemaining, setSecondsRemaining] = React.useState<number>(
    INACTIVITY_TIMEOUT_SECONDS,
  );
  const [isReportOpen, setIsReportOpen] = React.useState<boolean>(false);

  const handleFinish = React.useCallback(async () => {
    try {
      await kioskClearSessionAction();
    } catch {
      // Ignore cleanup error
    } finally {
      onFinished();
    }
  }, [onFinished]);

  // Reset inactivity countdown on any user interaction
  const resetInactivity = React.useCallback(() => {
    setSecondsRemaining(INACTIVITY_TIMEOUT_SECONDS);
  }, []);

  React.useEffect(() => {
    const handleActivity = () => resetInactivity();
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [resetInactivity]);

  // Handle auto-finish on inactivity (unless report dialog is open)
  React.useEffect(() => {
    if (isReportOpen) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void handleFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isReportOpen, handleFinish]);

  // Auto-finish timer (5s) after a successful clock operation
  React.useEffect(() => {
    if (!lastResult) return;
    const timer = setTimeout(() => {
      void handleFinish();
    }, 5000);
    return () => clearTimeout(timer);
  }, [lastResult, handleFinish]);

  // Load current session status on mount
  const refreshStatus = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await kioskGetActiveStatusAction();
      if (!res.ok) {
        if (res.code === "device_revoked" || res.code === "device_unpaired") {
          onDeviceRevoked?.();
          return;
        }
        if (res.code === "session_expired") {
          onFinished();
          return;
        }
        setError(res.error);
      } else {
        setActiveSession(res.data.currentSession);
      }
    } catch (err: unknown) {
      console.error("refreshStatus error", err);
      setError("Failed to fetch current attendance status.");
    } finally {
      setIsLoading(false);
    }
  }, [onDeviceRevoked, onFinished]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus();
  }, [refreshStatus]);

  // Live elapsed time counter if currently clocked in
  const [elapsedSeconds, setElapsedSeconds] = React.useState<number>(0);

  React.useEffect(() => {
    if (!activeSession?.clockInAt || activeSession.status === "completed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsedSeconds(0);
      return;
    }

    const clockInTime = new Date(activeSession.clockInAt).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - clockInTime) / 1000));
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  const handleClockIn = async () => {
    resetInactivity();
    setActionInProgress(true);
    setError(null);
    try {
      const idempotencyKey = `kiosk-in-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await kioskClockInAction({ idempotencyKey });
      if (!res.ok) {
        setError(res.error);
      } else {
        setLastResult({ action: "clock_in", data: res.data });
        await refreshStatus();
      }
    } catch (err: unknown) {
      console.error("handleClockIn error", err);
      setError("Unexpected error during clock-in.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleClockOut = async () => {
    resetInactivity();
    setActionInProgress(true);
    setError(null);
    try {
      const idempotencyKey = `kiosk-out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await kioskClockOutAction({ idempotencyKey });
      if (!res.ok) {
        setError(res.error);
      } else {
        setLastResult({ action: "clock_out", data: res.data });
        await refreshStatus();
      }
    } catch (err: unknown) {
      console.error("handleClockOut error", err);
      setError("Unexpected error during clock-out.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleBreakStart = async () => {
    resetInactivity();
    setActionInProgress(true);
    setError(null);
    try {
      const res = await kioskBreakStartAction();
      if (!res.ok) {
        setError(res.error);
      } else {
        setLastResult({ action: "break_start", data: res.data });
        await refreshStatus();
      }
    } catch (err: unknown) {
      console.error("handleBreakStart error", err);
      setError("Failed to start break.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleBreakEnd = async () => {
    resetInactivity();
    setActionInProgress(true);
    setError(null);
    try {
      const res = await kioskBreakEndAction();
      if (!res.ok) {
        setError(res.error);
      } else {
        setLastResult({ action: "break_end", data: res.data });
        await refreshStatus();
      }
    } catch (err: unknown) {
      console.error("handleBreakEnd error", err);
      setError("Failed to end break.");
    } finally {
      setActionInProgress(false);
    }
  };

  const isClockedIn =
    activeSession !== null && activeSession.status !== "completed";
  const isOnBreak = activeSession?.status === "on_break";

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-between bg-[#0b0b0d] p-4 text-[#f6f3ed] selection:bg-[#f2a65a]/30 sm:p-6 md:p-8">
      {/* Top Employee Context Header */}
      <header className="relative z-10 flex w-full max-w-2xl items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#f2a65a]/30 bg-[#1c140d] text-[#f2a65a]">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold tracking-tight text-[#f6f3ed] sm:text-2xl">
              {employee.displayName}
            </h1>
            <p className="text-xs text-[#aaa7a1]">
              {context.organizationName} • {context.locationName}
            </p>
          </div>
        </div>

        {/* Timeout Counter and Exit Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1b1b1e] px-3 py-1 font-mono text-xs text-[#aaa7a1]">
            <Clock className="h-3.5 w-3.5 text-[#f2a65a]" />
            <span data-testid="inactivity-countdown">{secondsRemaining}s</span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleFinish}
            className="h-10 border-white/10 text-xs font-medium hover:bg-white/5 sm:text-sm"
            data-testid="finish-button"
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Finish
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 my-auto flex w-full max-w-xl flex-col items-center">
        {/* Error Alert */}
        {error && (
          <div
            className="mb-6 flex w-full items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-300 backdrop-blur-sm"
            role="alert"
            data-testid="attendance-error-alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {/* Success Confirmation Card (displayed after an operation) */}
        {lastResult ? (
          <div
            className="flex w-full flex-col items-center rounded-2xl border border-[#f2a65a]/40 bg-[#141416]/95 p-6 text-center shadow-2xl backdrop-blur-md sm:p-8"
            data-testid="success-confirmation"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-950/60 text-emerald-400">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <h2 className="font-serif text-2xl font-bold tracking-tight text-[#f6f3ed] sm:text-3xl">
              {lastResult.action === "clock_in" && "Successfully Clocked In!"}
              {lastResult.action === "clock_out" && "Successfully Clocked Out!"}
              {lastResult.action === "break_start" && "Break Started"}
              {lastResult.action === "break_end" && "Break Ended"}
            </h2>

            <p className="mt-2 text-sm text-[#aaa7a1]">
              {lastResult.action === "clock_in" &&
                `Recorded at ${lastResult.data.clockInAt ? new Date(lastResult.data.clockInAt).toLocaleTimeString() : "just now"}`}
              {lastResult.action === "clock_out" &&
                `Recorded at ${lastResult.data.clockOutAt ? new Date(lastResult.data.clockOutAt).toLocaleTimeString() : "just now"}`}
              {lastResult.action === "break_start" && "Enjoy your break."}
              {lastResult.action === "break_end" && "Welcome back."}
            </p>

            {lastResult.action === "clock_out" &&
              lastResult.data.grossElapsedSeconds && (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#1b1b1e] p-3 text-center">
                  <span className="text-xs text-[#aaa7a1]">
                    Total Shift Duration
                  </span>
                  <p className="mt-0.5 font-mono text-xl font-bold text-[#f2a65a]">
                    {formatElapsed(lastResult.data.grossElapsedSeconds)}
                  </p>
                </div>
              )}

            <p className="mt-6 text-xs text-[#aaa7a1]/70">
              Returning to station keypad in 5 seconds...
            </p>

            <Button
              type="button"
              onClick={handleFinish}
              className="mt-4 h-12 w-full max-w-xs bg-[#f2a65a] text-base font-semibold text-[#1c1007] shadow-lg shadow-[#f2a65a]/20 hover:bg-[#e09244]"
              data-testid="success-done-button"
            >
              Done
            </Button>
          </div>
        ) : (
          /* Normal Active Status and Action Buttons */
          <div className="flex w-full flex-col items-center">
            {/* Status Card */}
            <div className="mb-6 flex w-full flex-col items-center rounded-2xl border border-white/10 bg-[#141416]/90 p-6 text-center shadow-2xl backdrop-blur-md">
              <span className="text-xs font-semibold tracking-wider text-[#aaa7a1] uppercase">
                Current Status
              </span>

              <div className="mt-2 flex items-center gap-2">
                <Badge
                  tone={
                    isOnBreak ? "warning" : isClockedIn ? "success" : "neutral"
                  }
                  className="px-3 py-1 text-sm font-semibold capitalize"
                  data-testid="current-status-badge"
                >
                  {isOnBreak
                    ? "On Break"
                    : isClockedIn
                      ? "Clocked In"
                      : "Not Clocked In"}
                </Badge>
              </div>

              {isClockedIn && (
                <div className="mt-4 flex flex-col items-center">
                  <span className="text-xs text-[#aaa7a1]">
                    Shift Time Elapsed
                  </span>
                  <div
                    className="mt-1 font-mono text-3xl font-bold text-[#f2a65a] sm:text-4xl"
                    data-testid="shift-elapsed-time"
                  >
                    {formatElapsed(elapsedSeconds)}
                  </div>
                  {activeSession?.clockInAt && (
                    <span className="mt-1 text-xs text-[#aaa7a1]">
                      Clocked in at{" "}
                      {new Date(activeSession.clockInAt).toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Primary Action Buttons */}
            <div className="flex w-full flex-col gap-3">
              {!isClockedIn ? (
                <Button
                  type="button"
                  disabled={actionInProgress || isLoading}
                  onClick={handleClockIn}
                  className="h-16 w-full rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 active:scale-[0.98]"
                  data-testid="clock-in-button"
                >
                  <Play className="mr-2 h-6 w-6 fill-current" />
                  Clock In
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    disabled={actionInProgress || isLoading}
                    onClick={handleClockOut}
                    className="h-16 w-full rounded-2xl bg-red-600 text-xl font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500 active:scale-[0.98]"
                    data-testid="clock-out-button"
                  >
                    <Square className="mr-2 h-6 w-6 fill-current" />
                    Clock Out
                  </Button>

                  {/* Break Start / End Controls */}
                  {isOnBreak ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actionInProgress || isLoading}
                      onClick={handleBreakEnd}
                      className="h-14 w-full rounded-xl border-amber-500/40 bg-amber-500/10 text-lg font-semibold text-amber-300 hover:bg-amber-500/20"
                      data-testid="end-break-button"
                    >
                      <RotateCcw className="mr-2 h-5 w-5" />
                      End Break
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actionInProgress || isLoading}
                      onClick={handleBreakStart}
                      className="h-14 w-full rounded-xl border-white/10 bg-[#1b1b1e] text-base font-medium text-[#f6f3ed] hover:bg-[#252329]"
                      data-testid="start-break-button"
                    >
                      <Coffee className="mr-2 h-5 w-5 text-[#f2a65a]" />
                      Start Break
                    </Button>
                  )}
                </>
              )}

              {/* View Timesheet / Report Button */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetInactivity();
                  setIsReportOpen(true);
                }}
                className="mt-2 h-12 w-full rounded-xl border border-white/10 text-sm font-medium text-[#aaa7a1] hover:bg-white/5 hover:text-[#f6f3ed]"
                data-testid="view-timesheet-button"
              >
                <FileText className="mr-2 h-4 w-4" />
                My Attendance Timesheet
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="relative z-10 text-center text-xs text-[#aaa7a1]/70">
        <p>
          Always press Finish when done to protect your station account privacy.
        </p>
      </footer>

      {/* Monthly Attendance Report Dialog */}
      <KioskReportDialog
        open={isReportOpen}
        onClose={() => {
          resetInactivity();
          setIsReportOpen(false);
        }}
        context={context}
        employee={employee}
      />
    </div>
  );
}
