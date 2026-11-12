"use client";

import * as React from "react";
import { AlertCircle, Clock, Loader2, RotateCcw, Tablet } from "lucide-react";
import type { KioskActiveContext } from "../domain/kiosk-device";
import { kioskAuthenticatePinAction } from "../actions/kiosk-clock-actions";
import type { KioskEmployeeSessionState } from "./kiosk-app";

export interface KioskHomeScreenProps {
  readonly context: KioskActiveContext;
  readonly onAuthenticated: (session: KioskEmployeeSessionState) => void;
  readonly onDeviceRevoked?: () => void;
}

export function KioskHomeScreen({
  context,
  onAuthenticated,
  onDeviceRevoked,
}: KioskHomeScreenProps) {
  const [pin, setPin] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [isShaking, setIsShaking] = React.useState<boolean>(false);
  const [currentTime, setCurrentTime] = React.useState<Date>(() => new Date());

  // Live ticking clock in location timezone
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: context.timeZone,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(currentTime);
    } catch {
      return currentTime.toLocaleTimeString();
    }
  }, [currentTime, context.timeZone]);

  const formattedDate = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: context.timeZone,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(currentTime);
    } catch {
      return currentTime.toLocaleDateString();
    }
  }, [currentTime, context.timeZone]);

  const triggerShake = React.useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  }, []);

  const handleAuthenticate = React.useCallback(
    async (rawPin: string) => {
      if (rawPin.length !== 4) return;
      setError(null);
      setIsSubmitting(true);

      try {
        const res = await kioskAuthenticatePinAction({ pin: rawPin });
        if (!res.ok) {
          if (res.code === "device_revoked" || res.code === "device_unpaired") {
            onDeviceRevoked?.();
            return;
          }
          setError(res.error);
          triggerShake();
          setPin("");
          setIsSubmitting(false);
          return;
        }

        // Authentication succeeded
        onAuthenticated({
          profileId: res.data.employee.profileId,
          displayName: res.data.employee.displayName,
          locationId: res.data.employee.locationId,
          organizationId: res.data.employee.organizationId,
          roles: res.data.employee.roles,
        });
      } catch (err: unknown) {
        console.error("kiosk PIN auth error", err);
        setError("Failed to verify PIN. Please try again.");
        triggerShake();
        setPin("");
        setIsSubmitting(false);
      }
    },
    [onAuthenticated, onDeviceRevoked, triggerShake],
  );

  const handleDigit = React.useCallback(
    (digit: string) => {
      if (isSubmitting) return;
      setError(null);
      if (pin.length < 4) {
        const nextPin = pin + digit;
        setPin(nextPin);
        if (nextPin.length === 4) {
          void handleAuthenticate(nextPin);
        }
      }
    },
    [pin, isSubmitting, handleAuthenticate],
  );

  const handleBackspace = React.useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [isSubmitting]);

  const handleClear = React.useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    setPin("");
  }, [isSubmitting]);

  // Physical keyboard listener
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, handleDigit, handleBackspace, handleClear]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-between bg-[#0b0b0d] p-4 text-[#f6f3ed] selection:bg-[#f2a65a]/30 sm:p-6 md:p-8">
      {/* Decorative ambient background */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute top-12 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#f2a65a]/5 blur-[120px]" />
      </div>

      {/* Top Station Header */}
      <header className="relative z-10 flex w-full max-w-2xl items-center justify-between border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-serif text-xl font-bold tracking-tight text-[#f6f3ed] sm:text-2xl">
              {context.organizationName}
            </span>
            <span className="text-white/20">/</span>
            <span className="text-sm font-medium text-[#f2a65a] sm:text-base">
              {context.locationName}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#aaa7a1]">
            <Tablet className="h-3.5 w-3.5 text-[#f2a65a]" />
            <span>{context.deviceName}</span>
          </div>
        </div>

        {/* Live Clock Display in Location Timezone */}
        <div className="flex flex-col items-end text-right">
          <div className="flex items-center gap-1.5 font-mono text-xl font-bold text-[#f6f3ed] sm:text-2xl">
            <Clock className="h-4 w-4 text-[#f2a65a]" />
            <span data-testid="live-clock-time">{formattedTime}</span>
          </div>
          <span className="text-xs text-[#aaa7a1]">{formattedDate}</span>
        </div>
      </header>

      {/* Center PIN Pad Surface */}
      <main className="relative z-10 my-auto flex w-full max-w-sm flex-col items-center">
        <div className="mb-4 text-center">
          <h2 className="font-serif text-2xl font-medium tracking-tight text-[#f6f3ed] sm:text-3xl">
            Enter Your 4-Digit PIN
          </h2>
          <p className="mt-1 text-xs text-[#aaa7a1] sm:text-sm">
            Sign in to clock in, clock out, or review timesheets.
          </p>
        </div>

        {/* PIN Circles Display */}
        <div
          className={`mb-6 flex items-center justify-center gap-4 transition-transform ${
            isShaking ? "animate-bounce" : ""
          }`}
          data-testid="pin-dots-display"
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = index < pin.length;
            const isCurrent = index === pin.length && !isSubmitting;
            return (
              <div
                key={index}
                className={`h-5 w-5 rounded-full border-2 transition-all sm:h-6 sm:w-6 ${
                  isFilled
                    ? "scale-110 border-[#f2a65a] bg-[#f2a65a] shadow-lg shadow-[#f2a65a]/30"
                    : isCurrent
                      ? "animate-pulse border-[#f2a65a]/60 bg-[#141416]"
                      : "border-white/20 bg-[#141416]"
                }`}
                data-testid={`pin-dot-${index}`}
              />
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div
            className="mb-4 flex w-full items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 backdrop-blur-sm sm:text-sm"
            role="alert"
            data-testid="pin-error-alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {/* Loading Spinner during PIN Verification */}
        {isSubmitting && (
          <div
            className="mb-4 flex items-center gap-2 text-sm text-[#f2a65a]"
            data-testid="pin-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verifying PIN...</span>
          </div>
        )}

        {/* Numeric Touch Keypad */}
        <div
          className="grid w-full grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-[#141416]/90 p-4 shadow-2xl backdrop-blur-md"
          data-testid="numeric-keypad"
        >
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDigit(digit)}
              className="flex h-16 items-center justify-center rounded-xl border border-white/5 bg-[#1b1b1e] text-2xl font-semibold text-[#f6f3ed] transition hover:border-[#f2a65a]/40 hover:bg-[#252329] focus:ring-2 focus:ring-[#f2a65a]/40 focus:outline-none active:scale-95 disabled:opacity-40 sm:h-18"
              data-testid={`digit-${digit}`}
            >
              {digit}
            </button>
          ))}

          {/* Bottom Row: Clear, 0, Backspace */}
          <button
            type="button"
            disabled={isSubmitting || pin.length === 0}
            onClick={handleClear}
            className="flex h-16 flex-col items-center justify-center rounded-xl border border-white/5 bg-[#1b1b1e]/60 text-xs font-medium text-[#aaa7a1] transition hover:bg-[#1b1b1e] hover:text-[#f6f3ed] active:scale-95 disabled:opacity-30 sm:h-18"
            data-testid="keypad-clear"
          >
            <RotateCcw className="mb-0.5 h-4 w-4" />
            Clear
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDigit("0")}
            className="flex h-16 items-center justify-center rounded-xl border border-white/5 bg-[#1b1b1e] text-2xl font-semibold text-[#f6f3ed] transition hover:border-[#f2a65a]/40 hover:bg-[#252329] focus:ring-2 focus:ring-[#f2a65a]/40 focus:outline-none active:scale-95 disabled:opacity-40 sm:h-18"
            data-testid="digit-0"
          >
            0
          </button>

          <button
            type="button"
            disabled={isSubmitting || pin.length === 0}
            onClick={handleBackspace}
            className="flex h-16 flex-col items-center justify-center rounded-xl border border-white/5 bg-[#1b1b1e]/60 text-xs font-medium text-[#aaa7a1] transition hover:bg-[#1b1b1e] hover:text-[#f6f3ed] active:scale-95 disabled:opacity-30 sm:h-18"
            data-testid="keypad-backspace"
          >
            Delete
          </button>
        </div>
      </main>

      {/* Footer Instructions */}
      <footer className="relative z-10 text-center text-xs text-[#aaa7a1]/70">
        <p>Use your individual 4-digit employee PIN to sign in.</p>
        <p className="mt-0.5">
          Sessions automatically clear after 45 seconds of inactivity.
        </p>
      </footer>
    </div>
  );
}
