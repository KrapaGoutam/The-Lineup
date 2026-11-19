"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import { fetchClockedInRoster } from "@/features/tips/data/fetch-clocked-in-roster";
import { loadTipsRange } from "@/features/tips/data/tips-data";
import { getTipsActor } from "@/features/tips/data/tips-actor";
import {
  addDays,
  resolveIntervalInstants,
} from "@/features/tips/domain/interval-times";
import {
  TIPS_UNAVAILABLE_MESSAGES,
  classifyTipsReadError,
} from "@/features/tips/domain/tips-read-model";
import type { TipsRange } from "@/features/tips/domain/tips-range-model";
import {
  MAX_PARTICIPANTS,
  MAX_TENDER_CENTS,
} from "@/features/tips/domain/tender-split";
import { MAX_TIPS_RANGE_DAYS } from "@/features/tips/domain/tips-period";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";
import type { TeamMember } from "@/lib/demo-data";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
      /** Someone else saved this interval first; the client must reload. */
      conflict?: true;
    };

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const idString = z.string().regex(/^\d{1,15}$/);

const baseShape = {
  restaurantSlug: restaurantSlugSchema,
  expectedContext: z.unknown().optional(),
  /** A claim only: checked against the server-verified location, never trusted. */
  locationId: z.string().uuid().optional(),
};

type Caller = NonNullable<Awaited<ReturnType<typeof getTipsActor>>>;
type Supabase = Awaited<ReturnType<typeof createClient>>;

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

type Authorized = {
  ok: true;
  supabase: Supabase;
  caller: Caller;
  location: { id: string; time_zone: string };
};

/**
 * The one authorization prelude every Tips action runs, in this order: live session ->
 * verified actor for the route slug -> role -> workspace expectation (stale tab) ->
 * module guard. Organization, location and time zone come ONLY from the verified
 * caller; the client supplies none of them.
 */
async function authorize(
  input: {
    restaurantSlug: string;
    expectedContext?: unknown;
    locationId?: string;
  },
  options: {
    manager: boolean;
    deniedMessage: string;
    signedOutMessage: string;
  },
): Promise<Authorized | { ok: false; result: ActionResult<never> }> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return { ok: false, result: sessionCheck };

  const caller = await getTipsActor(input.restaurantSlug);
  if (!caller) {
    return {
      ok: false,
      result: { ok: false, error: options.signedOutMessage },
    };
  }
  if (options.manager && !isManagerRole(caller.viewer.designation)) {
    return {
      ok: false,
      result: { ok: false, error: options.deniedMessage },
    };
  }

  const workspace = await checkWorkspace(
    input.expectedContext,
    caller,
    input.locationId,
  );
  if (!workspace.ok) return { ok: false, result: workspace.result };

  const blocked = await guardModule({
    module: "tips",
    organizationId: caller.organizationId,
    claimedLocationId: input.locationId,
    location: workspace.location,
  });
  if (blocked) return { ok: false, result: blocked };

  return { ok: true, supabase, caller, location: workspace.location };
}

const MANAGER_ONLY = "Only an owner, manager or assistant manager can do that.";
const SAFE_DB_CODES = new Set(["42501", "22003", "22023", "P0002", "P0409"]);
// Postgres-originated text (as opposed to the messages our functions raise on purpose).
const INTERNAL_DB_TEXT =
  /permission denied|row-level security|violates|relation "|column "|function |out of range|syntax|constraint/i;

/** Authored database messages pass through; anything unexpected becomes a generic one. */
function rpcFailure(error: {
  code?: string | null;
  message?: string | null;
}): ActionResult<never> {
  if (error.code === "P0409") {
    return {
      ok: false,
      error:
        error.message ||
        "This was changed by someone else. Reload and try again.",
      conflict: true,
    };
  }
  if (
    error.code &&
    SAFE_DB_CODES.has(error.code) &&
    error.message &&
    !INTERNAL_DB_TEXT.test(error.message)
  ) {
    return { ok: false, error: error.message };
  }
  return {
    ok: false,
    error: "Tips couldn't be saved right now. Please try again.",
  };
}

function refresh(restaurantSlug: string) {
  revalidatePath(`/r/${restaurantSlug}`);
  revalidatePath("/");
}

/** Service dates are location-local; allow history and "tomorrow morning" but not the far future. */
function serviceDateWindow(todayLocal: string) {
  return {
    min: addDays(todayLocal, -MAX_TIPS_RANGE_DAYS),
    max: addDays(todayLocal, 1),
  };
}

const saveSchema = z
  .object({
    ...baseShape,
    serviceDate: isoDate,
    /** Present = update that interval; absent = create a new one. */
    intervalId: idString.optional(),
    expectedRevision: z.number().int().min(1).optional(),
    start: hhmm,
    end: hhmm,
    cashCents: z.number().int().min(0).max(MAX_TENDER_CENTS),
    cardCents: z.number().int().min(0).max(MAX_TENDER_CENTS),
    participantIds: z.array(z.string().uuid()).min(1).max(MAX_PARTICIPANTS),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.intervalId !== undefined) {
      if (value.expectedRevision === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "A revision is required to update.",
        });
      }
      if (!value.reason || value.reason.length < 3) {
        ctx.addIssue({
          code: "custom",
          message: "A reason is required to update.",
          path: ["reason"],
        });
      }
    }
  });

export type SaveTipIntervalInput = z.input<typeof saveSchema>;

/**
 * Create (Save) or change (Update) one interval of a day. The database enforces the
 * rest: cash + card reconcile to the allocations, no overlap, eligible participants,
 * locked legacy days, and an optimistic-concurrency revision.
 */
export async function saveTipIntervalAction(
  input: SaveTipIntervalInput,
): Promise<
  ActionResult<{ intervalId: number; tipPoolId: number; revision: number }>
> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const reasonIssue = parsed.error.issues.find((i) => i.path[0] === "reason");
    return {
      ok: false,
      error: reasonIssue
        ? "Enter a short reason for the change (at least 3 characters)."
        : "That request is invalid.",
    };
  }
  const data = parsed.data;

  const auth = await authorize(data, {
    manager: true,
    deniedMessage: MANAGER_ONLY,
    signedOutMessage: "You need to sign in to save tips.",
  });
  if (!auth.ok) return auth.result;

  const timeZone = auth.location.time_zone;
  const todayLocal = zonedWallTimeFromInstant(new Date(), timeZone).date;
  const window = serviceDateWindow(todayLocal);
  if (data.serviceDate < window.min || data.serviceDate > window.max) {
    return { ok: false, error: "Choose a service date within the last year." };
  }

  let instants;
  try {
    instants = resolveIntervalInstants({
      serviceDate: data.serviceDate,
      start: data.start,
      end: data.end,
      timeZone,
    });
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Invalid interval.",
    };
  }
  if (data.cashCents + data.cardCents <= 0) {
    return {
      ok: false,
      error: "Enter a cash or card tip amount greater than zero.",
    };
  }

  const { data: result, error } = await auth.supabase.rpc(
    "tips_save_interval",
    {
      p_organization_id: auth.caller.organizationId,
      p_location_id: auth.location.id,
      p_service_date: data.serviceDate,
      p_starts_at: instants.startsAt.toISOString(),
      p_ends_at: instants.endsAt.toISOString(),
      p_cash_cents: data.cashCents,
      p_card_cents: data.cardCents,
      p_participant_ids: data.participantIds,
      p_interval_id:
        data.intervalId === undefined ? undefined : Number(data.intervalId),
      p_expected_revision: data.expectedRevision,
      p_reason: data.reason,
    },
  );
  if (error) return rpcFailure(error);

  const saved = result as {
    interval_id: number;
    tip_pool_id: number;
    revision: number;
  } | null;
  if (!saved || typeof saved.interval_id !== "number") {
    return {
      ok: false,
      error: "Tips couldn't be saved right now. Please try again.",
    };
  }
  refresh(data.restaurantSlug);
  return {
    ok: true,
    data: {
      intervalId: saved.interval_id,
      tipPoolId: saved.tip_pool_id,
      revision: saved.revision,
    },
  };
}

const voidSchema = z.object({
  ...baseShape,
  intervalId: idString,
  expectedRevision: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
});

/** Cancel an incorrect interval: an audited soft delete, never a destructive one. */
export async function voidTipIntervalAction(
  input: z.input<typeof voidSchema>,
): Promise<ActionResult<null>> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) {
    const reasonIssue = parsed.error.issues.find((i) => i.path[0] === "reason");
    return {
      ok: false,
      error: reasonIssue
        ? "Enter a short reason (3 to 500 characters)."
        : "That request is invalid.",
    };
  }
  const data = parsed.data;
  const auth = await authorize(data, {
    manager: true,
    deniedMessage: MANAGER_ONLY,
    signedOutMessage: "You need to sign in to void tips.",
  });
  if (!auth.ok) return auth.result;

  const { error } = await auth.supabase.rpc("tips_void_interval", {
    p_organization_id: auth.caller.organizationId,
    p_location_id: auth.location.id,
    p_interval_id: Number(data.intervalId),
    p_expected_revision: data.expectedRevision,
    p_reason: data.reason,
  });
  if (error) return rpcFailure(error);
  refresh(data.restaurantSlug);
  return { ok: true, data: null };
}

const recalcSchema = z.object({
  ...baseShape,
  tipPoolId: z.number().int().positive(),
});

/**
 * Explicitly re-derive a saved day's allocations from its SAVED intervals and
 * participants. Never consults attendance.
 */
export async function recalculateTipsAction(
  input: z.input<typeof recalcSchema>,
): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = recalcSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const data = parsed.data;
  const auth = await authorize(data, {
    manager: true,
    deniedMessage: MANAGER_ONLY,
    signedOutMessage: "You need to sign in to recalculate tips.",
  });
  if (!auth.ok) return auth.result;

  const { data: result, error } = await auth.supabase.rpc(
    "tips_recalculate_pool",
    {
      p_organization_id: auth.caller.organizationId,
      p_location_id: auth.location.id,
      p_tip_pool_id: data.tipPoolId,
    },
  );
  if (error) return rpcFailure(error);
  refresh(data.restaurantSlug);
  return {
    ok: true,
    data: {
      changed: Boolean((result as { changed?: boolean } | null)?.changed),
    },
  };
}

const rangeSchema = z.object({
  ...baseShape,
  from: isoDate,
  to: isoDate,
  includeRevisions: z.boolean().optional(),
});

/**
 * Saved distributions for a date range at the verified location. Managers get every
 * interval and (on request) the audit trail; staff get only their own days and shares.
 * That split is enforced by the database, not here.
 */
export async function getTipsRangeAction(
  input: z.input<typeof rangeSchema>,
): Promise<
  ActionResult<{
    range: TipsRange;
    team: TeamMember[];
    selectableIds: string[];
  }>
> {
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const data = parsed.data;
  const auth = await authorize(data, {
    manager: false,
    deniedMessage: "",
    signedOutMessage: "You need to sign in to view tips.",
  });
  if (!auth.ok) return auth.result;

  if (data.from > data.to) {
    return {
      ok: false,
      error: "The start date must be on or before the end date.",
    };
  }
  const loaded = await loadTipsRange(auth.supabase, {
    organizationId: auth.caller.organizationId,
    locationId: auth.location.id,
    from: data.from,
    to: data.to,
    includeRevisions: Boolean(data.includeRevisions),
  });
  if (!loaded.ok) {
    return { ok: false, error: TIPS_UNAVAILABLE_MESSAGES[loaded.reason] };
  }
  return {
    ok: true,
    data: {
      range: loaded.range,
      team: loaded.team,
      selectableIds: loaded.selectableIds,
    },
  };
}

export type ReopenTipsInput = {
  restaurantSlug: string;
  expectedContext?: unknown;
  locationId?: string;
  tipPoolId: number;
  reason: string;
};

/**
 * Audited correction of a day finalized by the EARLIER workflow. New days are never
 * finalized, so this only ever applies to legacy locked records (and the allocation
 * board lock they cause). A reason is required and recorded.
 */
export async function reopenTipsAction(
  input: ReopenTipsInput,
): Promise<ActionResult<null>> {
  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) {
    return {
      ok: false,
      error: "Enter a short reason (at least 3 characters).",
    };
  }
  const parsed = z
    .object({
      ...baseShape,
      tipPoolId: z.number().int().positive(),
      reason: z.string().trim().max(500),
    })
    .safeParse({ ...input, reason });
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const auth = await authorize(parsed.data, {
    manager: true,
    deniedMessage: MANAGER_ONLY,
    signedOutMessage: "You need to sign in to correct tips.",
  });
  if (!auth.ok) return auth.result;

  const { error } = await auth.supabase.rpc("tips_reopen_pool", {
    p_organization_id: auth.caller.organizationId,
    p_location_id: auth.location.id,
    p_tip_pool_id: parsed.data.tipPoolId,
    p_reason: parsed.data.reason,
  });
  if (error) return rpcFailure(error);

  refresh(parsed.data.restaurantSlug);
  return { ok: true, data: null };
}

/**
 * Feature 029 & V2-005.003: Read-only suggestion: who currently has an open shift,
 * strictly filtered to the verified location's eligible workforce. Attendance is a
 * roster SUGGESTION only; a manager approves the participants, and a saved
 * distribution is never changed by a later attendance correction.
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
        // The verified location decides the attendance source (V2-006.006).
        locationId: workspace.location.id,
      }),
      supabase.rpc("tips_location_roster", {
        p_organization_id: caller.organizationId,
        p_location_id: workspace.location.id,
      }),
    ]);

  if (!roster.ok) return roster;

  // Fail closed: attendance is an external suggestion source and must never be
  // returned unfiltered. If the location-authority roster cannot be read (old
  // schema, denial, bad response) nobody is suggested.
  if (rosterError || !Array.isArray(locationRoster)) {
    return {
      ok: false,
      error:
        TIPS_UNAVAILABLE_MESSAGES[
          rosterError ? classifyTipsReadError(rosterError) : "unavailable"
        ],
    };
  }

  // Intersect clocked-in profile IDs with the CURRENT, eligible workforce of
  // the verified location (historical-only people are not selectable).
  const eligibleSet = new Set(
    (
      locationRoster as Array<{
        profile_id: string;
        active: boolean;
        eligible: boolean;
      }>
    )
      .filter((m) => m.active && m.eligible)
      .map((m) => m.profile_id),
  );
  return {
    ok: true,
    data: { profileIds: roster.data.filter((id) => eligibleSet.has(id)) },
  };
}
