"use server";

import { revalidatePath } from "next/cache";

import type { BoardAction } from "@/features/allocation/domain/rotation-board";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

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
  const serviceDate = zonedWallTimeFromInstant(new Date(), input.timeZone).date;
  const { action } = input;

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
        const { data, error } = await supabase.rpc("board_assign", {
          p_organization_id: input.organizationId,
          p_location_id: input.locationId,
          p_service_date: serviceDate,
          p_round_id: Number(action.roundId),
          p_member_id: memberId,
          p_table_label: action.tableLabel,
        });
        if (error) return { ok: false, error: error.message };
        revalidatePath(`/r/${input.restaurantSlug}`);
        return { ok: true, data: { serviceSessionId: data as number } };
      }

      case "add-column": {
        const { data, error } = await supabase.rpc("board_add_column", {
          p_organization_id: input.organizationId,
          p_location_id: input.locationId,
          p_service_date: serviceDate,
          p_server_profile_id: action.column.id,
          p_position: action.column.position,
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
        revalidatePath(`/r/${input.restaurantSlug}`);
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
  const { error } = await supabase.rpc("board_undo", {
    p_organization_id: input.organizationId,
    p_service_session_id: input.serviceSessionId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}

export async function redoBoardAction(input: {
  restaurantSlug: string;
  organizationId: string;
  serviceSessionId: number;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("board_redo", {
    p_organization_id: input.organizationId,
    p_service_session_id: input.serviceSessionId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}
