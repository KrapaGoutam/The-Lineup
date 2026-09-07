"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidPasscode } from "@/features/auth/domain/passcode";
import type { TeamMember } from "@/lib/demo-data";

export type ResetPasscodeResult =
  | { ok: true; passcode: string }
  | { ok: false; error: string };

/**
 * Feature 016, manager/owner reset entry point. Rendered only for rows
 * `canChangeDesignation` (imported by the caller, TeamWorkspace) allows the
 * actor to touch -- this component itself does no authorization, it's
 * simply not mounted for a target the actor can't reset (see UX contract:
 * "not rendered at all", never shown-then-disabled).
 */
export function PasscodeResetDialog({
  member,
  onClose,
  onSubmit,
}: {
  member: TeamMember;
  onClose: () => void;
  onSubmit: (input: {
    targetProfileId: string;
    reason: string;
    newPasscode?: string;
  }) => Promise<ResetPasscodeResult>;
}) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [customPasscode, setCustomPasscode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [issuedPasscode, setIssuedPasscode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError("Enter a short reason (at least 3 characters).");
      return;
    }
    if (mode === "custom" && !isValidPasscode(customPasscode)) {
      setError("The new passcode must be exactly 4 digits.");
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit({
        targetProfileId: member.id,
        reason: trimmedReason,
        newPasscode: mode === "custom" ? customPasscode : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIssuedPasscode(result.passcode);
    } finally {
      setPending(false);
    }
  }

  async function copyPasscode() {
    if (!issuedPasscode) return;
    try {
      await navigator.clipboard.writeText(issuedPasscode);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) --
      // the passcode is already visible on screen either way, so this is
      // a convenience, not the only way to get the value.
      setError("Couldn't copy automatically — the passcode is shown above.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-passcode-title"
        className="w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="reset-passcode-title" className="text-lg font-semibold">
              Reset {member.name}&apos;s passcode
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {issuedPasscode
                ? "Share this with them directly."
                : "Their current passcode stops working immediately."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close reset passcode"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          {issuedPasscode ? (
            <div className="space-y-4">
              <div className="border-primary/30 bg-primary/10 rounded-xl border p-4 text-center">
                <p className="font-mono text-3xl font-bold tracking-[0.35em]">
                  {issuedPasscode}
                </p>
              </div>
              <p className="text-destructive text-sm font-medium">
                Write this down now — it will not be shown again.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={copyPasscode}
                >
                  {copied ? "Copied" : "Copy passcode"}
                </Button>
                <Button type="button" className="flex-1" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">New passcode</legend>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="passcode-mode"
                      checked={mode === "auto"}
                      onChange={() => setMode("auto")}
                      className="accent-[var(--primary)]"
                    />
                    Generate randomly
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="passcode-mode"
                      checked={mode === "custom"}
                      onChange={() => setMode("custom")}
                      className="accent-[var(--primary)]"
                    />
                    Choose one
                  </label>
                </div>
                {mode === "custom" ? (
                  <Input
                    id="custom-passcode"
                    aria-label="New 4-digit passcode"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={customPasscode}
                    onChange={(event) =>
                      setCustomPasscode(
                        event.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    placeholder="••••"
                    className="font-mono tracking-[0.35em]"
                    autoFocus
                  />
                ) : null}
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="reset-reason">Reason</Label>
                <Input
                  id="reset-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. forgot their passcode"
                  autoFocus={mode === "auto"}
                />
              </div>
              {error ? (
                <p className="text-destructive text-sm" aria-live="polite">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Resetting…" : "Reset passcode"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
