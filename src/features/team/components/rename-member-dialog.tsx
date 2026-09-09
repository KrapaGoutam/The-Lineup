"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidDisplayName } from "@/features/auth/domain/registration";
import type { TeamMember } from "@/lib/demo-data";

export type RenameMemberResult = { ok: true } | { ok: false; error: string };

/**
 * Feature 024. Same lightweight dialog pattern as its siblings
 * (MemberStatusDialog, PasscodeResetDialog) rather than a shared mega-
 * dialog -- see tasks/current-task.md's reconciliation notes. Rendered
 * only for a target `canChangeDesignation` allows the actor to touch
 * (TeamWorkspace's own render gate, the same bar Passcode Reset already
 * uses), so authorization is never re-derived here.
 */
export function RenameMemberDialog({
  member,
  onClose,
  onSubmit,
}: {
  member: TeamMember;
  onClose: () => void;
  onSubmit: (input: {
    targetProfileId: string;
    previousDisplayName: string;
    nextDisplayName: string;
  }) => Promise<RenameMemberResult>;
}) {
  const [name, setName] = useState(member.name);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!isValidDisplayName(trimmed)) {
      setError("Enter a name between 2 and 100 characters.");
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit({
        targetProfileId: member.id,
        previousDisplayName: member.name,
        nextDisplayName: trimmed,
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
        aria-labelledby="rename-member-title"
        className="w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="rename-member-title" className="text-lg font-semibold">
              Rename {member.name}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {done
                ? "Their name has been updated."
                : "Updates the name shown across the app immediately."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close rename dialog"
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
                <Label htmlFor="rename-name">Name</Label>
                <Input
                  id="rename-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  maxLength={100}
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
                  {pending ? "Saving…" : "Save name"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
