"use client";

import { useState } from "react";
import type { SignedInUser } from "@/components/login-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { canChangeDesignation } from "@/features/team/domain/designations";
import {
  PasscodeResetDialog,
  type ResetPasscodeResult,
} from "@/features/team/components/passcode-reset-dialog";
import type { TeamMember } from "@/lib/demo-data";

/** Same active-target predicate and reset flow as Team, independently of its toggle. */
export function AccountRecovery({
  user,
  team,
  onResetPasscode,
}: {
  user: SignedInUser;
  team: readonly TeamMember[];
  onResetPasscode: (input: {
    targetProfileId: string;
    reason: string;
    newPasscode?: string;
  }) => Promise<ResetPasscodeResult>;
}) {
  const [target, setTarget] = useState<TeamMember | null>(null);
  if (user.designation !== "owner" && user.designation !== "manager")
    return null;
  const targets = team.filter(
    (member) =>
      member.active !== false &&
      canChangeDesignation({
        actorDesignation: user.designation,
        targetCurrentDesignation: member.designation,
      }),
  );
  return (
    <Card id="settings-recovery">
      <CardHeader>
        <h2 className="font-semibold">Staff / Account Recovery</h2>
        <p className="text-muted-foreground text-sm">
          Reset a staff passcode, including when Team is unavailable.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {targets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No eligible staff are available. Reload to refresh the staff list.
          </p>
        ) : (
          targets.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 text-sm break-words">{member.name}</span>
              <Button
                variant="secondary"
                className="min-h-11 shrink-0"
                onClick={(event) => {
                  event.currentTarget.focus();
                  setTarget(member);
                }}
                aria-label={`Reset ${member.name}'s passcode`}
              >
                Reset passcode
              </Button>
            </div>
          ))
        )}
        {target ? (
          <PasscodeResetDialog
            member={target}
            onClose={() => setTarget(null)}
            onSubmit={onResetPasscode}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
