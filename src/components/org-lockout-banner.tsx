"use client";

import { FormEvent, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const POLL_INTERVAL_MS = 60_000;

/**
 * Manager/owner-only escape hatch for the organization-wide passcode
 * lockout (Feature 006). Only ever renders in real (non-demo) mode, since
 * demo mode has no backend attempt history to be locked out against.
 */
export function OrgLockoutBanner({
  restaurantSlug,
}: {
  restaurantSlug: string;
}) {
  const [active, setActive] = useState(false);
  const [showReasonForm, setShowReasonForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      try {
        const response = await fetch(
          `/api/auth/lockout-status?restaurantSlug=${encodeURIComponent(restaurantSlug)}`,
        );
        const payload = (await response.json()) as { active?: boolean };
        if (!cancelled) setActive(Boolean(payload.active));
      } catch {
        // A failed status check leaves the previous state — the manager
        // isn't blocked from anything by this control being briefly stale.
      }
    }
    checkStatus();
    const interval = setInterval(checkStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [restaurantSlug]);

  async function submitClear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (reason.length < 3) {
      setError("Enter a short reason (at least 3 characters).");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/clear-lockout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantSlug, reason }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to clear the lockout.");
        return;
      }
      setActive(false);
      setShowReasonForm(false);
    } catch {
      setError("The restaurant service is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!active) return null;

  return (
    <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-100">
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          Sign-in is temporarily limited for this restaurant after repeated
          failed passcode attempts.
        </p>
        {showReasonForm ? (
          <form
            onSubmit={submitClear}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <Input
              name="reason"
              placeholder="Reason for clearing"
              aria-label="Reason for clearing the lockout"
              className="h-9 min-w-0 sm:w-56"
              required
              minLength={3}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Clearing…" : "Confirm"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowReasonForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReasonForm(true)}
          >
            Clear login lockout
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-destructive mt-2 text-sm" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}
