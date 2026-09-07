"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamMember } from "@/lib/demo-data";

export type MemberStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Feature 017. One dialog for both directions -- deactivate and its
 * exact symmetric reverse, reactivate -- since the UI contract, fields,
 * and validation are identical; only the copy and which route/handler
 * gets called differ. Rendered only for a target `canDeactivateMember`
 * allows the actor to touch (TeamWorkspace's own render gate), and never
 * on the actor's own row, regardless of role.
 */
export function MemberStatusDialog({
  member,
  mode,
  onClose,
  onSubmit,
}: {
  member: TeamMember;
  mode: "deactivate" | "reactivate";
  onClose: () => void;
  onSubmit: (input: {
    targetProfileId: string;
    reason: string;
  }) => Promise<MemberStatusResult>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const isDeactivate = mode === "deactivate";
  const title = isDeactivate
    ? `Deactivate ${member.name}`
    : `Reactivate ${member.name}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError("Enter a short reason (at least 3 characters).");
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit({
        targetProfileId: member.id,
        reason: trimmedReason,
      });
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
        aria-labelledby="member-status-title"
        className="w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="member-status-title" className="text-lg font-semibold">
              {title}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {done
                ? isDeactivate
                  ? "Their access has been removed."
                  : "Their access has been restored."
                : isDeactivate
                  ? "Blocks their sign-in and every action immediately, even from an already-open session."
                  : "Restores their membership and passcode exactly as they were."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={`Close ${mode} dialog`}
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          {done ? (
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status-reason">Reason</Label>
                <Input
                  id="status-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    isDeactivate
                      ? "e.g. no longer employed here"
                      : "e.g. rehired"
                  }
                  autoFocus
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
                  {pending
                    ? isDeactivate
                      ? "Deactivating…"
                      : "Reactivating…"
                    : title}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
