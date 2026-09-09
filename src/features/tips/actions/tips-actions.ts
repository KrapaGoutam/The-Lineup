"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fetchClockedInRoster } from "@/features/tips/data/fetch-clocked-in-roster";
import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getCurrentUser } from "@/lib/current-user";
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
      // Feature 017: see requireLiveSession's doc comment.
      sessionInvalid?: true;
    };

async function getOrCreateTipPool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  locationId: string,
  serviceDate: string,
) {
  const { data: existing } = await supabase
    .from("tip_pools")
    .select("id, status")
    .eq("location_id", locationId)
    .eq("service_date", serviceDate)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("tip_pools")
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      service_date: serviceDate,
      status: "draft",
    })
    .select("id, status")
    .single();
  if (error || !created) return null;
  return created;
}

export type AddTipIntervalInput = {
  restaurantSlug: string;
  organizationId: string;
  locationId: string;
  timeZone: string;
  serviceDate: string;
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

  const pool = await getOrCreateTipPool(
    supabase,
    input.organizationId,
    input.locationId,
    input.serviceDate,
  );
  if (!pool) return { ok: false, error: "Could not prepare today's tip pool." };
  if (pool.status === "finalized") {
    return {
      ok: false,
      error:
        "This tip pool is finalized. A manager or owner must reopen it first.",
    };
  }

  const startsAt = zonedWallTimeToInstant({
    date: input.serviceDate,
    time: input.start,
    timeZone: input.timeZone,
  });
  const endsAt = zonedWallTimeToInstant({
    date: input.serviceDate,
    time: input.end,
    timeZone: input.timeZone,
  });

  const { data: interval, error: intervalError } = await supabase
    .from("tip_intervals")
    .insert({
      organization_id: input.organizationId,
      tip_pool_id: pool.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      amount_cents: input.amountCents,
    })
    .select("id")
    .single();
  if (intervalError || !interval) {
    return {
      ok: false,
      error: `Could not add the interval: ${intervalError?.message}`,
    };
  }

  const { error: participantsError } = await supabase
    .from("tip_interval_participants")
    .insert(
      input.participantIds.map((profileId) => ({
        organization_id: input.organizationId,
        tip_interval_id: interval.id,
        profile_id: profileId,
      })),
    );
  if (participantsError) {
    await supabase.from("tip_intervals").delete().eq("id", interval.id);
    return {
      ok: false,
      error: `Could not record participants: ${participantsError.message}`,
    };
  }

  const { error: recalcError } = await supabase.rpc("recalculate_tip_pool", {
    target_tip_pool_id: pool.id,
  });
  if (recalcError) {
    return {
      ok: false,
      error: `Could not recalculate the pool: ${recalcError.message}`,
    };
  }

  revalidatePath(`/r/${input.restaurantSlug}`);
  return {
    ok: true,
    data: {
      interval: {
        id: String(interval.id),
        start: input.start,
        end: input.end,
        amountCents: input.amountCents,
        participantIds: input.participantIds,
      },
      tipPoolId: pool.id,
    },
  };
}

async function recordAuditEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    organizationId: string;
    locationId: string;
    tipPoolId: number;
    action: "finalized" | "reopened";
    reason?: string;
  },
) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("audit_events").insert({
    organization_id: input.organizationId,
    location_id: input.locationId,
    actor_profile_id: auth.user.id,
    action: input.action,
    entity_type: "tip_pool",
    entity_id: String(input.tipPoolId),
    reason: input.reason ?? null,
  });
}

export async function finalizeTipsAction(input: {
  restaurantSlug: string;
  organizationId: string;
  locationId: string;
  tipPoolId: number;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  // finalized_by needs the raw auth user id, so this reads it directly
  // rather than going through requireLiveSession (which only reports
  // live/dead, not the id) -- same underlying getUser() check, just with
  // the id kept.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return {
      ok: false,
      error: "Your session is no longer valid. Please sign in again.",
      sessionInvalid: true,
    };
  }

  const { error } = await supabase
    .from("tip_pools")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: auth.user.id,
    })
    .eq("id", input.tipPoolId);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    tipPoolId: input.tipPoolId,
    action: "finalized",
  });

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

export async function reopenTipsAction(input: {
  restaurantSlug: string;
  organizationId: string;
  locationId: string;
  tipPoolId: number;
  reason: string;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const { error } = await supabase
    .from("tip_pools")
    .update({ status: "draft", finalized_at: null, finalized_by: null })
    .eq("id", input.tipPoolId);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    tipPoolId: input.tipPoolId,
    action: "reopened",
    reason: input.reason,
  });

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * Feature 029. Read-only: who currently has a genuinely open shift,
 * resolved to this organization's own profile ids. Manager/owner-only,
 * enforced here as defense in depth beyond the UI (which already only
 * ever renders the "Pull clocked-in team" button for a manager) --
 * re-derives `organizationId` via `getCurrentUser`, never trusts a
 * client-supplied one, and computes the service date from the
 * restaurant's own primary location + timezone, never a client-supplied
 * date either (the same discipline `getTipsContext` itself already
 * follows for `serviceDate`).
 */
export async function getClockedInRosterAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<{ profileIds: string[] }>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That request is invalid." };
  }

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const currentUser = await getCurrentUser(parsed.data.restaurantSlug);
  if (!currentUser) {
    return {
      ok: false,
      error: "You need to sign in to pull the clocked-in team.",
    };
  }
  if (currentUser.role === "server") {
    return {
      ok: false,
      error: "Only a manager or owner can pull the clocked-in team.",
    };
  }

  const location = await getPrimaryLocation(currentUser.organizationId);
  if (!location) {
    return {
      ok: false,
      error: "This restaurant has no primary location configured.",
    };
  }
  const serviceDate = zonedWallTimeFromInstant(
    new Date(),
    location.time_zone,
  ).date;

  const roster = await fetchClockedInRoster(supabase, {
    organizationId: currentUser.organizationId,
    serviceDate,
  });
  if (!roster.ok) return roster;
  return { ok: true, data: { profileIds: roster.data } };
}
