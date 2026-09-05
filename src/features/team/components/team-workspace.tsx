"use client";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  canChangeRole,
  otherAssignableRole,
} from "@/features/team/domain/roles";
import type { TeamMember } from "@/lib/demo-data";

export function TeamWorkspace({
  user,
  team,
  onChangeRole,
}: {
  user: SignedInUser;
  team: TeamMember[];
  onChangeRole: (memberId: string, nextRole: TeamMember["role"]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="accent">Module 4</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Team</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Everyone active at this restaurant. Owners can change any role;
          managers can promote a server or step a manager back down, but
          can&apos;t change an owner.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Active members</h2>
        </CardHeader>
        <CardContent className="divide-border divide-y p-0 pt-4">
          {team.map((member) => {
            const own = member.id === user.profileId;
            const nextRole = otherAssignableRole(member.role);
            const allowed = canChangeRole({
              actorRole: user.role,
              targetCurrentRole: member.role,
            });
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 px-5 py-4"
              >
                <span
                  className="size-3 rounded-full"
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
                  <p className="text-muted-foreground mt-0.5 text-xs capitalize">
                    {member.role}
                  </p>
                </div>
                {allowed && nextRole ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onChangeRole(member.id, nextRole)}
                  >
                    Make {nextRole}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        This session-only roster mirrors every other module in demo mode. In
        Supabase mode, role changes write to the same <code>memberships</code>{" "}
        row the RLS policies already govern.
      </p>
    </div>
  );
}
