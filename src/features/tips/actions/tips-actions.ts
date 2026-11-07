"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import { fetchClockedInRoster } from "@/features/tips/data/fetch-clocked-in-roster";
import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";
import { getTipsActor } from "@/features/tips/data/tips-actor";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import {
  zonedWallTimeFromInstant,
  zonedWallTimeToInstant,
} from "@/lib/timezone";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

type Caller = NonNullable<Awaited<ReturnType<typeof getTipsActor>>>;

/**
 * Server-side request-context consistency check (V2-003.005).
 * Validates that the client's expected context matches the server-verified caller.
 */
async function checkWorkspace(
  raw: unknown,
  caller: Caller,
  claimedLocationId?: string,
) {
  const expectationRaw = raw ?? {
    profileId: caller.viewer.profileId,
    organizationId: caller.organizationId,
    locationId: claimedLocationId ?? caller.scope.locationId,
  };
  const outcome = await assertWorkspaceExpectation(
    expectationRaw,
    {
      profileId: caller.viewer.profileId,
      organizationId: caller.organizationId,
    },
    {
      resolveLocation: async () => ({
        id: caller.scope.locationId,
        time_zone: caller.scope.timeZone,
      }),
    },
  );
  if (outcome.ok) return { ok: true as const, location: outcome.location };
  if (outcome.code === "invalid") {
    return {
      ok: false as const,
      result: { ok: false as const, error: "That request is invalid." },
    };
  }
  return {
    ok: false as const,
    result: {
      ok: false as const,
      error: STALE_CONTEXT_MESSAGE,
      contextStale: true as const,
    },
  };
}

function isManagerRole(designation: string): boolean {
  return (
    designation === "owner" ||
    designation === "manager" ||
    designation === "assistant_manager"
  );
}

export type AddTipIntervalInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  timeZone?: string;
  serviceDate?: string;
  start: string;
  end: string;
  amountCents: number;
  participantIds: string[];
};

export async function addTipIntervalAction(
  input: AddTipIntervalInput,
): Promise<ActionResult<{ interval: TipIntervalInput; tipPoolId: number }>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const caller = await getTipsActor(input.restaurantSlug);
  if (!caller) {
    return {
      ok: false,
      error: "You need to sign in to add tip intervals.",
    };
  }

  if (!isManagerRole(caller.viewer.designation)) {
    return {
      ok: false,
      error: "Only an owner, manager or assistant manager can do that.",
    };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    caller,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tips",
    organizationId: caller.organizationId,
    claimedLocationId: input.locationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  if (input.amountCents < 0) {
    return {
      ok: false,
      error: "Tip amount must be a non-negative number of cents.",
    };
  }

  if (input.start === input.end) {
    return {
      ok: false,
      error: "Tip interval start and end must be different.",
    };
  }

  if (!input.participantIds || input.participantIds.length === 0) {
    return {
      ok: false,
      error: "Choose at least one participant.",
    };
  }

  const timeZone = workspace.location.time_zone;
  const serviceDate =
    input.serviceDate ?? zonedWallTimeFromInstant(new Date(), timeZone).date;

  const startsAt = zonedWallTimeToInstant({
    date: serviceDate,
    time: input.start,
    timeZone,
  });
  const endsAt = zonedWallTimeToInstant({
    date: serviceDate,
    time: input.end,
    timeZone,
  });

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "tips_add_interval",
    {
      p_organization_id: caller.organizationId,
      p_location_id: workspace.location.id,
      p_service_date: serviceDate,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
      p_amount_cents: input.amountCents,
      p_participant_ids: input.participantIds,
    },
  );

  if (rpcError) {
    return {
      ok: false,
      error: rpcError.message,
    };
  }

  const parsed =
    typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

  revalidatePath(`/r/${input.restaurantSlug}`);
  revalidatePath("/");

  return {
    ok: true,
    data: {
      interval: {
        id: String(parsed.interval_id),
        start: input.start,
        end: input.end,
        amountCents: input.amountCents,
        participantIds: input.participantIds,
      },
      tipPoolId: Number(parsed.tip_pool_id),
    },
  };
}

export type FinalizeTipsInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  tipPoolId: number;
};

export async function finalizeTipsAction(
  input: FinalizeTipsInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const caller = await getTipsActor(input.restaurantSlug);
  if (!caller) {
    return {
      ok: false,
      error: "You need to sign in to finalize tips.",
    };
  }

  if (!isManagerRole(caller.viewer.designation)) {
    return {
      ok: false,
      error: "Only an owner, manager or assistant manager can do that.",
    };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    caller,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tips",
    organizationId: caller.organizationId,
    claimedLocationId: input.locationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const { error } = await supabase.rpc("tips_finalize_pool", {
    p_organization_id: caller.organizationId,
    p_location_id: workspace.location.id,
    p_tip_pool_id: input.tipPoolId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${input.restaurantSlug}`);
  revalidatePath("/");
  return { ok: true, data: null };
}

export type ReopenTipsInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  organizationId?: string;
  locationId?: string;
  tipPoolId: number;
  reason: string;
};

export async function reopenTipsAction(
  input: ReopenTipsInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) {
    return {
      ok: false,
      error: "Enter a short reason (at least 3 characters).",
    };
  }

  const caller = await getTipsActor(input.restaurantSlug);
  if (!caller) {
    return {
      ok: false,
      error: "You need to sign in to reopen tips.",
    };
  }

  if (!isManagerRole(caller.viewer.designation)) {
    return {
      ok: false,
      error: "Only an owner, manager or assistant manager can do that.",
    };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    caller,
    input.locationId,
  );
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tips",
    organizationId: caller.organizationId,
    claimedLocationId: input.locationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const { error } = await supabase.rpc("tips_reopen_pool", {
    p_organization_id: caller.organizationId,
    p_location_id: workspace.location.id,
    p_tip_pool_id: input.tipPoolId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${input.restaurantSlug}`);
  revalidatePath("/");
  return { ok: true, data: null };
}

/**
 * Feature 029 & V2-005.003: Read-only suggestion: who currently has an open shift,
 * strictly filtered to the verified location's eligible workforce.
 */
export async function getClockedInRosterAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<ActionResult<{ profileIds: string[] }>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That request is invalid." };
  }

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const caller = await getTipsActor(parsed.data.restaurantSlug);
  if (!caller) {
    return {
      ok: false,
      error: "You need to sign in to pull the clocked-in team.",
    };
  }

  if (!isManagerRole(caller.viewer.designation)) {
    return {
      ok: false,
      error: "Only a manager or owner can pull the clocked-in team.",
    };
  }

  const workspace = await checkWorkspace(parsed.data.expectedContext, caller);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "tips",
    organizationId: caller.organizationId,
    location: workspace.location,
  });
  if (blocked) return blocked;

  const serviceDate = zonedWallTimeFromInstant(
    new Date(),
    workspace.location.time_zone,
  ).date;

  const [roster, { data: locationRoster, error: rosterError }] =
    await Promise.all([
      fetchClockedInRoster(supabase, {
        organizationId: caller.organizationId,
        serviceDate,
      }),
      supabase.rpc("tips_location_roster", {
        p_organization_id: caller.organizationId,
        p_location_id: workspace.location.id,
      }),
    ]);

  if (!roster.ok) return roster;

  // Intersect clocked-in profile IDs with verified location roster
  if (!rosterError && locationRoster) {
    const eligibleSet = new Set(
      (
        locationRoster as Array<{
          profile_id: string;
          active: boolean;
        }>
      )
        .filter((m) => m.active)
        .map((m) => m.profile_id),
    );
    const filtered = roster.data.filter((id) => eligibleSet.has(id));
    return { ok: true, data: { profileIds: filtered } };
  }

  return { ok: true, data: { profileIds: roster.data } };
}
