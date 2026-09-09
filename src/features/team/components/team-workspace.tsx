"use client";

import { useEffect, useState } from "react";
import { KeyRound, Link2, Pencil, UserCheck, UserX } from "lucide-react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Designation } from "@/features/auth/domain/passcode";
import {
  assignableDesignations,
  canChangeDesignation,
  canDeactivateMember,
  designationLabel,
} from "@/features/team/domain/designations";
import type { TeamMember } from "@/lib/demo-data";

import {
  AttendanceLinkDialog,
  type AttendanceLinkResult,
} from "./attendance-link-dialog";
import {
  MemberStatusDialog,
  type MemberStatusResult,
} from "./member-status-dialog";
import {
  PasscodeResetDialog,
  type ResetPasscodeResult,
} from "./passcode-reset-dialog";
import {
  RenameMemberDialog,
  type RenameMemberResult,
} from "./rename-member-dialog";

export function TeamWorkspace({
  user,
  team,
  onChangeDesignation,
  onRenameMember,
  onResetPasscode,
  onDeactivate,
  onReactivate,
  onLoadAttendanceOptions,
  onLinkAttendance,
  onUnlinkAttendance,
}: {
  user: SignedInUser;
  team: TeamMember[];
  onChangeDesignation: (memberId: string, next: Designation) => void;
  onRenameMember: (input: {
    targetProfileId: string;
    previousDisplayName: string;
    nextDisplayName: string;
  }) => Promise<RenameMemberResult>;
  onResetPasscode: (input: {
    targetProfileId: string;
    reason: string;
    newPasscode?: string;
  }) => Promise<ResetPasscodeResult>;
  onDeactivate: (input: {
    targetProfileId: string;
    reason: string;
  }) => Promise<MemberStatusResult>;
  onReactivate: (input: {
    targetProfileId: string;
    reason: string;
  }) => Promise<MemberStatusResult>;
  onLoadAttendanceOptions: AttendanceLinkDialogProps["onLoadOptions"];
  onLinkAttendance: (input: {
    targetProfileId: string;
    neonUserId: number;
  }) => Promise<AttendanceLinkResult>;
  onUnlinkAttendance: (input: {
    targetProfileId: string;
  }) => Promise<AttendanceLinkResult>;
}) {
  const [renameTarget, setRenameTarget] = useState<TeamMember | null>(null);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [attendanceTarget, setAttendanceTarget] = useState<TeamMember | null>(
    null,
  );
  const [statusTarget, setStatusTarget] = useState<{
    member: TeamMember;
    mode: "deactivate" | "reactivate";
  } | null>(null);

  // Feature 024, acceptance criterion 1: attendance link status must be
  // visible in the roster itself, not only after opening the Link
  // attendance dialog for one person at a time. Loaded once on mount via
  // the same options call that dialog already uses (no new action), and
  // reloaded after any action that could change who's linked to whom.
  const [linkedProfileIds, setLinkedProfileIds] = useState<Set<string> | null>(
    null,
  );
  const [linkStatusReloadKey, setLinkStatusReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onLoadAttendanceOptions().then((result) => {
      if (cancelled || !result.ok) return;
      setLinkedProfileIds(
        new Set(result.data.links.map((link) => link.profileId)),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkStatusReloadKey]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="accent">Module 4</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Team</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Everyone active at this restaurant. Owner, Manager, and Assistant
          Manager all have the same full access; Staff has today&apos;s regular
          employee access. An owner can set anyone&apos;s designation; a manager
          can only move someone between Assistant Manager and Staff, and never
          touch an owner or another manager.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Active members</h2>
        </CardHeader>
        <CardContent className="divide-border divide-y p-0 pt-4">
          {team.map((member) => {
            const own = member.id === user.profileId;
            // Feature 017: a deactivated member gets no other action --
            // only Reactivate, per the UX contract ("no other actions").
            // Designation changes and passcode reset stay active-only:
            // there's nothing to promote or reset for someone who can't
            // sign in right now.
            const isActive = member.active !== false;
            const options = isActive
              ? assignableDesignations({
                  actorDesignation: user.designation,
                  targetCurrentDesignation: member.designation,
                })
              : [];
            // Feature 016: reset authorization mirrors designation-change
            // authorization exactly (a credential reset is at least as
            // sensitive as a designation change) -- so it's gated on the
            // same predicate, not re-derived, and hidden entirely rather
            // than shown-then-disabled for a target the actor can't touch.
            const canReset =
              isActive &&
              canChangeDesignation({
                actorDesignation: user.designation,
                targetCurrentDesignation: member.designation,
              });
            // Feature 017: deactivate and reactivate share one
            // authorization predicate (canDeactivateMember -- the same
            // bar as reset, plus an unconditional self-target refusal),
            // reused for whichever direction this row currently offers.
            const canChangeStatus = canDeactivateMember({
              actorProfileId: user.profileId,
              actorDesignation: user.designation,
              targetProfileId: member.id,
              targetCurrentDesignation: member.designation,
            });
            // Feature 019 deliberately follows the attendance table's
            // manager-tier RLS, which includes Assistant Manager and allows
            // linking any roster member. This is separate from designation
            // writes: an assistant manager cannot promote people, but can
            // operate attendance just like the rest of the floor tooling.
            const canManageAttendance = user.role !== "server";
            return (
              <div
                key={member.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className="size-3 flex-none rounded-full"
                    style={{ backgroundColor: member.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {member.name}
                      {own ? (
                        <span className="text-primary ml-2 text-xs font-bold uppercase">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span>{designationLabel(member.designation)}</span>
                      {linkedProfileIds ? (
                        <Badge
                          tone={
                            linkedProfileIds.has(member.id)
                              ? "success"
                              : "neutral"
                          }
                        >
                          {linkedProfileIds.has(member.id)
                            ? "Attendance linked"
                            : "Attendance not linked"}
                        </Badge>
                      ) : null}
                      {!isActive ? (
                        <Badge tone="warning">Inactive</Badge>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {canReset ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Rename ${member.name}`}
                      onClick={() => setRenameTarget(member)}
                    >
                      <Pencil aria-hidden="true" />
                      Rename
                    </Button>
                  ) : null}
                  {options.map((option) => (
                    <Button
                      key={option}
                      variant="secondary"
                      size="sm"
                      aria-label={`Set ${member.name} to ${designationLabel(option)}`}
                      onClick={() => onChangeDesignation(member.id, option)}
                    >
                      Make {designationLabel(option)}
                    </Button>
                  ))}
                  {canReset ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Reset ${member.name}'s passcode`}
                      onClick={() => setResetTarget(member)}
                    >
                      <KeyRound aria-hidden="true" />
                      Reset passcode
                    </Button>
                  ) : null}
                  {canManageAttendance ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Link ${member.name}'s attendance record`}
                      onClick={() => setAttendanceTarget(member)}
                    >
                      <Link2 aria-hidden="true" />
                      Link attendance
                    </Button>
                  ) : null}
                  {canChangeStatus ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={
                        isActive
                          ? `Deactivate ${member.name}`
                          : `Reactivate ${member.name}`
                      }
                      onClick={() =>
                        setStatusTarget({
                          member,
                          mode: isActive ? "deactivate" : "reactivate",
                        })
                      }
                    >
                      {isActive ? (
                        <UserX aria-hidden="true" />
                      ) : (
                        <UserCheck aria-hidden="true" />
                      )}
                      {isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        In demo mode this roster is session-only. In real mode it&apos;s the
        organization&apos;s actual membership list, and a designation maps onto
        the same <code>roles</code> array the RLS policies already govern
        (Manager = <code>general_manager</code>, Assistant Manager =
        <code> shift_manager</code>) — no separate designation column or
        additional permission tier.
      </p>

      {renameTarget ? (
        <RenameMemberDialog
          member={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={onRenameMember}
        />
      ) : null}

      {resetTarget ? (
        <PasscodeResetDialog
          member={resetTarget}
          onClose={() => setResetTarget(null)}
          onSubmit={onResetPasscode}
        />
      ) : null}

      {statusTarget ? (
        <MemberStatusDialog
          member={statusTarget.member}
          mode={statusTarget.mode}
          onClose={() => setStatusTarget(null)}
          onSubmit={
            statusTarget.mode === "deactivate" ? onDeactivate : onReactivate
          }
        />
      ) : null}

      {attendanceTarget ? (
        <AttendanceLinkDialog
          member={attendanceTarget}
          onClose={() => setAttendanceTarget(null)}
          onLoadOptions={onLoadAttendanceOptions}
          onLink={async (input) => {
            const result = await onLinkAttendance(input);
            if (result.ok) setLinkStatusReloadKey((key) => key + 1);
            return result;
          }}
          onUnlink={async (input) => {
            const result = await onUnlinkAttendance(input);
            if (result.ok) setLinkStatusReloadKey((key) => key + 1);
            return result;
          }}
          teamNameById={new Map(team.map((member) => [member.id, member.name]))}
        />
      ) : null}
    </div>
  );
}

type AttendanceLinkDialogProps = Parameters<typeof AttendanceLinkDialog>[0];
