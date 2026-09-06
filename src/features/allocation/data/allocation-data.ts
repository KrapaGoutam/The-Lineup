import "server-only";

import type {
  ColumnStatus,
  RotationBoard,
} from "@/features/allocation/domain/rotation-board";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import type { TeamMember } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

export type CrossEditEntry = {
  at: string;
  actorName: string;
  columnName: string;
};

export type AllocationContext = {
  locationId: string;
  timeZone: string;
  // null until a manager/owner/host's first board action creates today's
  // session (board_add_column, typically) -- see the migration's
  // get_or_create_active_session for why this read never creates one
  // itself: a plain server reading the board before anyone has opened the
  // floor should see an empty board, not trigger a write.
  serviceSessionId: number | null;
  team: TeamMember[];
  board: RotationBoard;
  crossEditLog: CrossEditEntry[];
  eventCount: number;
  canUndo: boolean;
  canRedo: boolean;
};

// The demo model's 3-value ColumnStatus collapses the DB's 4-value
// rotation_status. "closing" has no UI concept yet and nothing in this
// feature ever writes it -- mapped to "paused" defensively (reduced
// availability is the closer fit than "active") rather than throwing if
// it somehow appears.
const STATUS_FROM_DB: Record<string, ColumnStatus> = {
  active: "active",
  paused: "paused",
  unavailable: "removed",
  closing: "paused",
};

const EMPTY_BOARD: RotationBoard = {
  columns: [],
  rounds: [],
  nextRoundNumber: 1,
};

export async function getAllocationContext(
  organizationId: string,
): Promise<AllocationContext | null> {
  const supabase = await createClient();
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const team = await getOrganizationRoster(organizationId);
  const serviceDate = zonedWallTimeFromInstant(
    new Date(),
    location.time_zone,
  ).date;

  const { data: session, error: sessionError } = await supabase
    .from("service_sessions")
    .select("id")
    .eq("location_id", location.id)
    .eq("service_date", serviceDate)
    .eq("meal_period", "service")
    .eq("status", "active")
    .maybeSingle();
  if (sessionError)
    console.error("getAllocationContext: service_sessions", sessionError);

  if (!session) {
    return {
      locationId: location.id,
      timeZone: location.time_zone,
      serviceSessionId: null,
      team,
      board: EMPTY_BOARD,
      crossEditLog: [],
      eventCount: 0,
      canUndo: false,
      canRedo: false,
    };
  }

  const [
    { data: memberRows, error: memberError },
    { data: roundRows, error: roundError },
  ] = await Promise.all([
    supabase
      .from("rotation_members")
      .select("id, server_profile_id, status, position")
      .eq("service_session_id", session.id),
    supabase
      .from("rotation_rounds")
      .select("id, sequence")
      .eq("service_session_id", session.id)
      .order("sequence", { ascending: true }),
  ]);
  if (memberError)
    console.error("getAllocationContext: rotation_members", memberError);
  if (roundError)
    console.error("getAllocationContext: rotation_rounds", roundError);

  const roundIds = (roundRows ?? []).map((round) => round.id);
  const [
    { data: entryRows, error: entryError },
    { data: eventRows, error: eventError },
  ] = await Promise.all([
    roundIds.length > 0
      ? supabase
          .from("table_rotation_entries")
          .select("rotation_round_id, rotation_member_id, table_label")
          .in("rotation_round_id", roundIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("board_events")
      .select("event_type, actor_profile_id, payload, created_at, undone_at")
      .eq("service_session_id", session.id)
      .order("created_at", { ascending: true }),
  ]);
  if (entryError)
    console.error("getAllocationContext: table_rotation_entries", entryError);
  if (eventError)
    console.error("getAllocationContext: board_events", eventError);

  // RotationColumn.id is a person's profile id in the pure domain model
  // (isCrossColumnEdit compares it directly against the signed-in user's
  // profileId) -- not rotation_members.id, which only exists to give a
  // session-scoped row for table_rotation_entries to reference. Actions
  // resolve profile id back to member id server-side before calling an
  // RPC; this read does the same translation in the other direction.
  const nameByProfileId = new Map(
    team.map((member) => [member.id, member.name]),
  );
  const memberIdToProfileId = new Map(
    (memberRows ?? []).map((row) => [row.id, row.server_profile_id]),
  );

  const columns = (memberRows ?? [])
    .map((row) => ({
      id: row.server_profile_id,
      name: nameByProfileId.get(row.server_profile_id) ?? "Unknown",
      position: row.position,
      status: STATUS_FROM_DB[row.status] ?? "paused",
    }))
    .sort((a, b) => a.position - b.position);

  const rounds = (roundRows ?? []).map((round) => ({
    id: String(round.id),
    sequence: round.sequence,
    cells: (entryRows ?? [])
      .filter((entry) => entry.rotation_round_id === round.id)
      .map((entry) => ({
        columnId: memberIdToProfileId.get(entry.rotation_member_id) ?? "",
        tableLabel: entry.table_label,
      }))
      .filter((cell) => cell.columnId !== ""),
  }));

  const board: RotationBoard = {
    columns,
    rounds,
    nextRoundNumber: (roundRows?.at(-1)?.sequence ?? 0) + 1,
  };

  // The demo model only ever logs a cross-column edit for the "assign"
  // action (see allocation-workspace.tsx's TableEntry onSubmit) -- every
  // other action type is manager-only already, so this stays scoped to
  // exactly the case that needs it.
  const crossEditLog: CrossEditEntry[] = (eventRows ?? [])
    .filter((event) => event.event_type === "assign")
    .map((event) => {
      const payload = event.payload as { member_id?: number } | null;
      const targetProfileId = payload?.member_id
        ? memberIdToProfileId.get(payload.member_id)
        : undefined;
      if (!targetProfileId || targetProfileId === event.actor_profile_id) {
        return null;
      }
      return {
        at: event.created_at,
        actorName: nameByProfileId.get(event.actor_profile_id) ?? "Unknown",
        columnName: nameByProfileId.get(targetProfileId) ?? "Unknown",
      };
    })
    .filter((entry): entry is CrossEditEntry => entry !== null);

  // Mirrors board_undo/board_redo's own target-selection logic exactly
  // (see the migration) so the buttons are disabled precisely when the
  // RPC would otherwise reject with "Nothing to undo/redo" -- computed
  // here from the same event rows already fetched above, not a third
  // round trip.
  const realEvents = (eventRows ?? []).filter(
    (event) => event.event_type !== "undo" && event.event_type !== "redo",
  );
  const canUndo = realEvents.some((event) => event.undone_at === null);
  const latestForward = realEvents
    .filter((event) => event.undone_at === null)
    .map((event) => event.created_at)
    .sort()
    .at(-1);
  const canRedo = (eventRows ?? []).some(
    (event) =>
      event.undone_at !== null &&
      (!latestForward || event.undone_at > latestForward),
  );

  return {
    locationId: location.id,
    timeZone: location.time_zone,
    serviceSessionId: session.id,
    team,
    board,
    crossEditLog,
    eventCount: (eventRows ?? []).length,
    canUndo,
    canRedo,
  };
}
