"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamMember } from "@/lib/demo-data";

export type PurgeMemberResult = { ok: true } | { ok: false; error: string };

/**
 * Feature 035. Rendered only for an inactive, not-yet-purged target a
 * `canPurgeMember` check has already approved (TeamWorkspace's render
 * gate), from the Inactive tab only -- never offered next to an active
 * member.
 *
 * The copy here is deliberately accurate to what this action actually
 * does, not a generic "everything will be deleted" scare warning:
 * purge is an anonymization (profiles.display_name/avatar_url and the
 * original registration record get scrubbed), never a hard delete --
 * see docs/features/035-inactive-member-cascade-purge.md's "Decisions
 * and risks" for why. Overstating it as deleting shift/tip/payroll
 * history would be actively misleading to the manager pressing this
 * button about what their own records will look like afterward.
 *
 * The typed-name confirmation is the feature's own required safeguard
 * against an accidental click on an action this irreversible -- the
 * submit button stays disabled until the input exactly matches
 * `member.name`, case-sensitive, no trimming leniency beyond the
 * input's own natural whitespace.
 */
export function PurgeMemberDialog({
  member,
  onClose,
  onSubmit,
}: {
  member: TeamMember;
  onClose: () => void;
  onSubmit: (input: {
    targetProfileId: string;
    confirmName: string;
    reason: string;
  }) => Promise<PurgeMemberResult>;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const nameMatches = confirmName === member.name;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!nameMatches) {
      setError(`Type "${member.name}" exactly to confirm.`);
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit({
        targetProfileId: member.id,
        confirmName,
        reason: reason.trim(),
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
        aria-labelledby="purge-member-title"
        className="border-destructive/40 w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-destructive/15 text-destructive mt-0.5 grid size-9 flex-none place-items-center rounded-xl">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                id="purge-member-title"
                className="text-destructive text-lg font-semibold"
              >
                Permanently delete {member.name}?
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {done
                  ? "Their personal information has been permanently erased."
                  : "This erases their name and contact details everywhere they appear, permanently. Their historical shifts, tips, and payroll records stay on file for your records, but will show as “Deleted User” instead of their name. This cannot be undone."}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close purge dialog"
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
                <Label htmlFor="purge-confirm-name">
                  Type <span className="font-semibold">{member.name}</span> to
                  confirm
                </Label>
                <Input
                  id="purge-confirm-name"
                  value={confirmName}
                  onChange={(event) => setConfirmName(event.target.value)}
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purge-reason">Reason (optional)</Label>
                <Input
                  id="purge-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. requested erasure of their data"
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
                <Button
                  type="submit"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={pending || !nameMatches}
                >
                  {pending ? "Deleting…" : "Permanently delete"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
