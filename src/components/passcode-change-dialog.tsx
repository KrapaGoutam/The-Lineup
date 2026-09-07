"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import { isValidPasscode } from "@/features/auth/domain/passcode";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export type ChangePasscodeResult = { ok: true } | { ok: false; error: string };

/**
 * Feature 016, self-change entry point: an icon button in the header,
 * available to every signed-in role (see UX contract in
 * docs/features/016-passcode-management.md) -- unlike the reset dialog
 * below, this never displays a passcode, since the person just typed the
 * one they chose.
 */
export function PasscodeChangeDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    currentPasscode: string;
    newPasscode: string;
  }) => Promise<ChangePasscodeResult>;
}) {
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isValidPasscode(currentPasscode) || !isValidPasscode(newPasscode)) {
      setError("Enter your current passcode and a new 4-digit passcode.");
      return;
    }
    if (currentPasscode === newPasscode) {
      setError("Choose a passcode different from your current one.");
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit({ currentPasscode, newPasscode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } finally {
      setPending(false);
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
        aria-labelledby="change-passcode-title"
        className="w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="change-passcode-title" className="text-lg font-semibold">
              Change your passcode
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {done
                ? "Your passcode has been changed."
                : "Requires your current passcode."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close change passcode"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm leading-6">
                Use your new passcode the next time you sign in. This session
                stays open.
              </p>
              <Button className="w-full" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-passcode">Current passcode</Label>
                <Input
                  id="current-passcode"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="current-password"
                  value={currentPasscode}
                  onChange={(event) =>
                    setCurrentPasscode(
                      event.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                  placeholder="••••"
                  className="font-mono tracking-[0.35em]"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-passcode">New passcode</Label>
                <Input
                  id="new-passcode"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="new-password"
                  value={newPasscode}
                  onChange={(event) =>
                    setNewPasscode(
                      event.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                  placeholder="••••"
                  className="font-mono tracking-[0.35em]"
                />
                <p className="text-muted-foreground text-xs">
                  4 digits. Must be different from every other passcode at this
                  restaurant.
                </p>
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
                  {pending ? "Changing…" : "Change passcode"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
