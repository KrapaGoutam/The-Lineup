"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getAllocationContext,
  type AllocationContext,
} from "@/features/allocation/data/allocation-data";
import type { BoardAction } from "@/features/allocation/domain/rotation-board";
import type { TableConflictInfo } from "@/features/allocation/domain/table-conflict";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const localDateSchema = z.iso.date();

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      // Feature 017: see requireLiveSession's doc comment.
      sessionInvalid?: true;
      // Cross-view integrity (X2): the database refused an assign because the
      // table is already held (PT409). Carries who holds it so the client can
      // open the same Transfer / End + Assign / Cancel decision it would have
      // shown with fresh state.
      conflict?: TableConflictInfo;
    };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The board is served from BOTH entry routes (`/` and `/r/[restaurantSlug]`,
 * which share one loader). Revalidating only the slug route left the root
 * route showing the pre-mutation snapshot (FRONT-006), so both are
 * invalidated together.
 */
function revalidateBoard(restaurantSlug: string) {
  revalidatePath(`/r/${restaurantSlug}`);
  revalidatePath("/");
}

/**
 * RotationColumn.id is a person's profile id in the pure domain model
 * (rotation-board.ts), never rotation_members.id -- see allocation-data.ts
 * for the read-side half of this mapping. Every RPC that targets an
 * existing column needs the row id, not the profile id, so every action
 * below resolves it here rather than trusting a client-supplied number.
 */
async function resolveMemberId(
  supabase: Supabase,
  serviceSessionId: number,
  profileId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("rotation_members")
    .select("id")
    .eq("service_session_id", serviceSessionId)
    .eq("server_profile_id", profileId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The client applies an action optimistically, including the automatic
 * trailing row the board opens after a fill -- that row only has a local id
 * ("round-3") until the next authoritative refresh delivers the database id.
 * A fast follow-up action on it would otherwise send a non-numeric id. The
 * local id's number IS the row's sequence (the database numbers trailing rows
 * with the same max+1 rule), so resolve it to the real row server-side. A row
 * that does not exist yet is reported honestly instead of being guessed.
 */
async function resolveRoundId(
  supabase: Supabase,
  serviceSessionId: number | null,
  roundId: string,
): Promise<string | null> {
  if (/^\d+$/.test(roundId)) return roundId;
  const sequence = /^round-(\d+)$/.exec(roundId)?.[1];
  if (!sequence || serviceSessionId === null) return null;
  const { data } = await supabase
    .from("rotation_rounds")
    .select("id")
    .eq("service_session_id", serviceSessionId)
    .eq("sequence", Number(sequence))
    .maybeSingle();
  return data ? String(data.id) : null;
}

async function withResolvedRounds(
  supabase: Supabase,
  serviceSessionId: number | null,
  action: BoardAction,
): Promise<BoardAction | null> {
  const resolve = (id: string) =>
    resolveRoundId(supabase, serviceSessionId, id);
  switch (action.type) {
    case "assign":
    case "clear-cell":
    case "clear-row":
    case "delete-row":
    case "end-table":
    case "skip-turn": {
      const roundId = await resolve(action.roundId);
      return roundId === null ? null : { ...action, roundId };
    }
    case "transfer": {
      const sourceRoundId = await resolve(action.sourceRoundId);
      return sourceRoundId === null ? null : { ...action, sourceRoundId };
    }
    case "end-and-assign": {
      const ids = await Promise.all(action.endRoundIds.map(resolve));
      return ids.some((id) => id === null)
        ? null
        : { ...action, endRoundIds: ids as string[] };
    }
    default:
      return action;
  }
}

/**
 * board_assign raises PT409 (HTTP 409) with a JSON `detail` when the table is
 * already held (see 20261026090000_table_allocation_conflict_resolution.sql).
 * The detail holds ids and labels only; member ids are mapped to profile ids
 * here (RotationColumn.id is a profile id) and never trusted from the client.
 */
async function conflictFromError(
  supabase: Supabase,
  serviceSessionId: number | null,
  error: { code?: string; details?: string | null },
): Promise<TableConflictInfo | undefined> {
  if (error.code !== "PT409" || !error.details) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(error.details);
  } catch {
    return undefined;
  }
  const detail = raw as {
    kind?: string;
    label?: string;
    holders?: {
      member_id?: number;
      round_id?: number;
      assignment_label?: string;
    }[];
  };
  const holders = detail.holders ?? [];
  const profileByMember = new Map<number, string>();
  if (serviceSessionId !== null && holders.length > 0) {
    const { data } = await supabase
      .from("rotation_members")
      .select("id, server_profile_id")
      .eq("service_session_id", serviceSessionId)
      .in(
        "id",
        holders.flatMap((h) =>
          typeof h.member_id === "number" ? [h.member_id] : [],
        ),
      );
    for (const row of data ?? [])
      profileByMember.set(row.id, row.server_profile_id);
  }
  return {
    kind:
      detail.kind === "same_server" || detail.kind === "same_server_repeat"
        ? detail.kind
        : "held",
    label: detail.label ?? "",
    holders: holders.flatMap((h) => {
      const columnId = profileByMember.get(h.member_id ?? -1);
      return columnId && h.round_id !== undefined
        ? [
            {
              columnId,
              roundId: String(h.round_id),
              assignmentLabel: h.assignment_label ?? "",
            },
          ]
        : [];
    }),
  };
}

export type ExecuteBoardActionInput = {
  restaurantSlug: string;
  organizationId: string;
  locationId: string;
  timeZone: string;
  serviceSessionId: number | null;
  action: BoardAction;
};

export async function executeBoardActionRemote(
  input: ExecuteBoardActionInput,
): Promise<ActionResult<{ serviceSessionId: number }>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const serviceDate = zonedWallTimeFromInstant(new Date(), input.timeZone).date;
  const resolvedAction = await withResolvedRounds(
    supabase,
    input.serviceSessionId,
    input.action,
  );
  if (!resolvedAction) {
    return {
      ok: false,
      error: "That row isn't ready yet -- give it a moment and try again.",
    };
  }
  const action = resolvedAction;

  try {
    switch (action.type) {
      case "assign": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        // Same-server repeat (#166): the explicit confirmation is its own
        // trusted RPC; every other assign keeps going through board_assign.
        const { data, error } = await supabase.rpc(
          action.endPrevious ? "board_end_previous_and_assign" : "board_assign",
          {
            p_organization_id: input.organizationId,
            p_location_id: input.locationId,
            p_service_date: serviceDate,
            p_round_id: Number(action.roundId),
            p_member_id: memberId,
            p_table_label: action.tableLabel,
            p_confirm_transfer: action.confirmTransfer ?? false,
            p_end_whole_assignment: action.endWholeAssignment ?? false,
          },
        );
        if (error) {
          const conflict = await conflictFromError(
            supabase,
            input.serviceSessionId,
            error,
          );
          return conflict
            ? { ok: false, error: error.message, conflict }
            : { ok: false, error: error.message };
        }
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: data as number } };
      }

      // Feature 028: the per-cell counterpart to clear-column, open to
      // any active member (see board_clear_cell's own migration comment)
      // -- unlike clear-row/clear-column/clear-board below, this one is
      // never gated on isManager anywhere in the call chain.
      case "clear-cell": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_clear_cell", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_round_id: Number(action.roundId),
          p_member_id: memberId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "add-column": {
        // Position is computed server-side (concurrency-safe row lock +
        // max(position)+1) -- action.column.position exists only for the
        // demo-mode reducer's own in-memory shape and is intentionally
        // not sent here. See the concurrency-safe-positions migration.
        const { data, error } = await supabase.rpc("board_add_column", {
          p_organization_id: input.organizationId,
          p_location_id: input.locationId,
          p_service_date: serviceDate,
          p_server_profile_id: action.column.id,
        });
        if (error) return { ok: false, error: error.message };
        // board_add_column returns the new member id, not the session id --
        // re-resolve it the same way the initial read would, so the client
        // always has one to pass into the next action.
        const { data: memberRow } = await supabase
          .from("rotation_members")
          .select("service_session_id")
          .eq("id", data as number)
          .maybeSingle();
        if (!memberRow) {
          return { ok: false, error: "Could not confirm the new column." };
        }
        revalidateBoard(input.restaurantSlug);
        return {
          ok: true,
          data: { serviceSessionId: memberRow.service_session_id },
        };
      }

      case "set-column-status": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_set_column_status", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_member_id: memberId,
          p_status: action.status,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "clear-row": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const { error } = await supabase.rpc("board_clear_row", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_round_id: Number(action.roundId),
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "clear-column": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_clear_column", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_member_id: memberId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "clear-board": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const { error } = await supabase.rpc("board_clear_board", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "move-column": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_move_column", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_member_id: memberId,
          p_direction: action.direction,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "add-row": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const { error } = await supabase.rpc("board_add_row", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      case "delete-row": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const { error } = await supabase.rpc("board_delete_row", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_round_id: Number(action.roundId),
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      // Upgrade 1.1: moves the SAME active assignment to another server's
      // earliest genuinely empty round -- see board_transfer's own
      // migration comment. Distinct from "assign" + confirmTransfer,
      // which is for resolving a true occupancy conflict, not for moving
      // an existing assignment.
      case "transfer": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const [sourceMemberId, destMemberId] = await Promise.all([
          resolveMemberId(supabase, sessionId, action.sourceColumnId),
          resolveMemberId(supabase, sessionId, action.destColumnId),
        ]);
        if (sourceMemberId === null || destMemberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_transfer", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_source_round_id: Number(action.sourceRoundId),
          p_source_member_id: sourceMemberId,
          p_dest_member_id: destMemberId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      // Upgrade 1.1: completes service. The table becomes available; the
      // historical entry is preserved (marked ended), never deleted.
      case "end-table": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_end_table", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_round_id: Number(action.roundId),
          p_member_id: memberId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }

      // Upgrade 1.1: records a turn with no table. Occupies nothing;
      // counts as a used cell for the auto-row rule the same as any other
      // real entry.
      case "skip-turn": {
        const memberId =
          input.serviceSessionId !== null
            ? await resolveMemberId(
                supabase,
                input.serviceSessionId,
                action.columnId,
              )
            : null;
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { data, error } = await supabase.rpc("board_skip_turn", {
          p_organization_id: input.organizationId,
          p_location_id: input.locationId,
          p_service_date: serviceDate,
          p_round_id: Number(action.roundId),
          p_member_id: memberId,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: data as number } };
      }

      // Upgrade 1.1 (multi-table): the Floor decision dialog's "End
      // existing table(s) & assign" choice -- one atomic RPC (ends every
      // selected round in place, all-or-nothing, then creates one new
      // active row at this column's earliest genuinely empty round)
      // rather than sequential per-round calls, so a partial failure
      // can't end some of the old tables without ever assigning the new
      // one. `endRoundIds` may be one, several, or every one of the
      // column's active rounds.
      case "end-and-assign": {
        const sessionId = input.serviceSessionId;
        if (sessionId === null) {
          return { ok: false, error: "No active floor yet for today." };
        }
        const memberId = await resolveMemberId(
          supabase,
          sessionId,
          action.columnId,
        );
        if (memberId === null) {
          return { ok: false, error: "That column no longer exists." };
        }
        const { error } = await supabase.rpc("board_end_and_assign", {
          p_organization_id: input.organizationId,
          p_service_session_id: sessionId,
          p_end_round_ids: action.endRoundIds.map(Number),
          p_member_id: memberId,
          p_table_label: action.tableLabel,
        });
        if (error) return { ok: false, error: error.message };
        revalidateBoard(input.restaurantSlug);
        return { ok: true, data: { serviceSessionId: sessionId } };
      }
    }
  } catch (caught) {
    return {
      ok: false,
      error:
        caught instanceof Error
          ? caught.message
          : "Unable to update the board.",
    };
  }
}

export async function undoBoardAction(input: {
  restaurantSlug: string;
  organizationId: string;
  serviceSessionId: number;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const { error } = await supabase.rpc("board_undo", {
    p_organization_id: input.organizationId,
    p_service_session_id: input.serviceSessionId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBoard(input.restaurantSlug);
  return { ok: true, data: null };
}

export async function redoBoardAction(input: {
  restaurantSlug: string;
  organizationId: string;
  serviceSessionId: number;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const { error } = await supabase.rpc("board_redo", {
    p_organization_id: input.organizationId,
    p_service_session_id: input.serviceSessionId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBoard(input.restaurantSlug);
  return { ok: true, data: null };
}

/**
 * Feature 028. Client-triggered read for the date/month navigator --
 * mirrors Attendance's own client-triggered action pattern
 * (getAttendanceReportAction et al.) rather than a route param, since the
 * board is a Server Component's initial data plus client-side history, not
 * a separately routed page. Re-resolves the signed-in user and their
 * organization itself; never trusts a client-supplied organizationId.
 */
export async function getAllocationContextForDateAction(input: {
  restaurantSlug: string;
  serviceDate: string;
}): Promise<ActionResult<AllocationContext>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      serviceDate: localDateSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That date request is invalid." };
  }

  const currentUser = await getCurrentUser(parsed.data.restaurantSlug);
  if (!currentUser) {
    return { ok: false, error: "You need to sign in to see the board." };
  }

  const location = await getPrimaryLocation(currentUser.organizationId);
  if (!location) {
    return { ok: false, error: "No location is set up yet." };
  }
  const today = zonedWallTimeFromInstant(new Date(), location.time_zone).date;
  if (parsed.data.serviceDate > today) {
    return { ok: false, error: "You can't browse to a date in the future." };
  }

  const context = await getAllocationContext(
    currentUser.organizationId,
    parsed.data.serviceDate,
  );
  if (!context) {
    return { ok: false, error: "No location is set up yet." };
  }
  return { ok: true, data: context };
}
