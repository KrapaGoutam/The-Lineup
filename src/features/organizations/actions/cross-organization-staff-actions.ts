"use server";

import { revalidatePath } from "next/cache";

import { getOverallRole } from "@/features/auth/data/overall-role";
import { reactivateMember } from "@/features/auth/data/member-deactivation";
import { listOrganizationStaffAction } from "@/features/locations/actions/staff-assignment-actions";
import type { StaffRosterMember } from "@/features/locations/domain/staff-assignment";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExistingEmployee = StaffRosterMember & {
  readonly destinationStatus: "absent" | "active" | "inactive";
};

async function ownerContext(): Promise<
  | {
      readonly ok: true;
      readonly client: Awaited<ReturnType<typeof createClient>>;
    }
  | Extract<Result<never>, { ok: false }>
> {
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid)
    return {
      ok: false,
      error: "Please sign in again.",
      code: "UNAUTHENTICATED",
    };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      error: "Please sign in again.",
      code: "UNAUTHENTICATED",
    };
  }
  if ((await getOverallRole(data.user.id, client)) !== "owner") {
    return {
      ok: false,
      error: "Overall Owner authority is required.",
      code: "FORBIDDEN",
    };
  }
  return { ok: true, client };
}

async function verifiedRosters(
  client: Awaited<ReturnType<typeof createClient>>,
  sourceOrganizationId: string,
  destinationOrganizationId: string,
): Promise<
  | {
      readonly ok: true;
      readonly source: StaffRosterMember[];
      readonly destination: StaffRosterMember[];
    }
  | Extract<Result<never>, { ok: false }>
> {
  if (
    !UUID.test(sourceOrganizationId) ||
    !UUID.test(destinationOrganizationId) ||
    sourceOrganizationId === destinationOrganizationId
  ) {
    return {
      ok: false,
      error: "Select two different valid organizations.",
      code: "INVALID_ORGANIZATION",
    };
  }
  const { data: organizations, error } = await client
    .from("organizations")
    .select("id")
    .in("id", [sourceOrganizationId, destinationOrganizationId]);
  if (error || !organizations) {
    return {
      ok: false,
      error: "Unable to verify organizations. Please retry.",
      code: "READ_FAILED",
    };
  }
  if (organizations.length !== 2) {
    return {
      ok: false,
      error: "Source or destination organization was not found.",
      code: "INVALID_ORGANIZATION",
    };
  }
  // Reuse the authorized, paged roster reader. Errors must never become an empty roster.
  const source = await listOrganizationStaffAction(
    sourceOrganizationId,
    client,
  );
  if (!source.ok)
    return {
      ok: false,
      error: "Unable to read source staff. Check access and retry.",
      code: "SOURCE_ROSTER_FAILED",
    };
  const destination = await listOrganizationStaffAction(
    destinationOrganizationId,
    client,
  );
  if (!destination.ok)
    return {
      ok: false,
      error: "Unable to read destination staff. Please retry.",
      code: "DESTINATION_ROSTER_FAILED",
    };
  return { ok: true, source: source.data, destination: destination.data };
}

export async function listExistingEmployeesAction(input: {
  readonly sourceOrganizationId: string;
  readonly destinationOrganizationId: string;
}): Promise<Result<readonly ExistingEmployee[]>> {
  try {
    const owner = await ownerContext();
    if (!owner.ok) return owner;
    const rosters = await verifiedRosters(
      owner.client,
      input?.sourceOrganizationId,
      input?.destinationOrganizationId,
    );
    if (!rosters.ok) return rosters;
    const destinationById = new Map(
      rosters.destination.map((member) => [member.profileId, member]),
    );
    return {
      ok: true,
      data: rosters.source
        .filter((member) => member.membershipActive)
        .map((member) => ({
          ...member,
          destinationStatus: destinationById.has(member.profileId)
            ? destinationById.get(member.profileId)!.membershipActive
              ? "active"
              : "inactive"
            : "absent",
        })),
    };
  } catch {
    return {
      ok: false,
      error: "Unable to load existing employees. Please retry.",
      code: "READ_FAILED",
    };
  }
}

export async function addExistingEmployeeAction(input: {
  readonly sourceOrganizationId: string;
  readonly destinationOrganizationId: string;
  readonly profileId: string;
  readonly reason: string;
  readonly reactivate?: boolean;
}): Promise<
  Result<{
    readonly profileId: string;
    readonly outcome: "added" | "reactivated";
  }>
> {
  try {
    const owner = await ownerContext();
    if (!owner.ok) return owner;
    const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
    if (reason.length < 3 || reason.length > 500) {
      return {
        ok: false,
        error: "Enter a reason between 3 and 500 characters.",
        code: "INVALID_REASON",
      };
    }
    if (!UUID.test(input?.profileId)) {
      return {
        ok: false,
        error: "Select an existing employee.",
        code: "EMPLOYEE_NOT_FOUND",
      };
    }
    const rosters = await verifiedRosters(
      owner.client,
      input.sourceOrganizationId,
      input.destinationOrganizationId,
    );
    if (!rosters.ok) return rosters;
    if (
      !rosters.source.some(
        (member) =>
          member.profileId === input.profileId && member.membershipActive,
      )
    ) {
      return {
        ok: false,
        error: "Employee is not active in the selected source organization.",
        code: "EMPLOYEE_NOT_FOUND",
      };
    }
    const existing = rosters.destination.find(
      (member) => member.profileId === input.profileId,
    );
    if (existing?.membershipActive) {
      return {
        ok: false,
        error: "Employee is already an active destination member.",
        code: "ALREADY_ACTIVE",
      };
    }
    if (existing && !input.reactivate) {
      return {
        ok: false,
        error:
          "Destination membership is inactive. Confirm reactivation separately.",
        code: "INACTIVE_MEMBERSHIP",
      };
    }
    if (!existing && input.reactivate) {
      return {
        ok: false,
        error: "No inactive destination membership exists.",
        code: "EMPLOYEE_NOT_FOUND",
      };
    }
    if (existing) {
      const result = await reactivateMember(owner.client, {
        organizationId: input.destinationOrganizationId,
        profileId: input.profileId,
        reason,
      });
      if (!result.ok)
        return {
          ok: false,
          error: "Unable to reactivate membership. Please retry.",
          code: result.code,
        };
      revalidatePath(
        `/system-administration/organizations/${input.destinationOrganizationId}`,
      );
      return {
        ok: true,
        data: { profileId: input.profileId, outcome: "reactivated" },
      };
    }
    const { data, error } = await owner.client.rpc("team_add_member", {
      p_organization_id: input.destinationOrganizationId,
      p_target_profile_id: input.profileId,
      p_roles: ["server"],
      p_reason: reason,
    });
    if (error) {
      if (error.code === "23505")
        return {
          ok: false,
          error:
            "A destination membership now exists. Refresh and check its state.",
          code: "ALREADY_EXISTS",
        };
      if (error.code === "42501" || error.code === "28000")
        return {
          ok: false,
          error: "Session or authorization changed. Please sign in again.",
          code: "FORBIDDEN",
        };
      return {
        ok: false,
        error: "Unable to add membership. Please retry.",
        code: "RPC_FAILED",
      };
    }
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      data.outcome !== "added" ||
      data.membership_active !== true
    ) {
      return {
        ok: false,
        error:
          "Unable to confirm membership. Refresh the destination roster before retrying.",
        code: "UNCONFIRMED_RESULT",
      };
    }
    revalidatePath(
      `/system-administration/organizations/${input.destinationOrganizationId}`,
    );
    return { ok: true, data: { profileId: input.profileId, outcome: "added" } };
  } catch {
    return {
      ok: false,
      error: "Unable to update membership. Please retry.",
      code: "NETWORK_ERROR",
    };
  }
}
