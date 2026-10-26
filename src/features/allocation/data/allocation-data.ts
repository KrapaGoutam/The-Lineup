import "server-only";

import {
  findClaimDivergences,
  type ClaimDivergence,
  type PhysicalClaim,
} from "@/features/allocation/domain/board-read-model";
import {
  buildRecentActivity,
  type BoardActivityEntry,
} from "@/features/allocation/domain/board-activity";
import type {
  FloorLayoutEntry,
  RegistryTable,
} from "@/features/allocation/domain/floor-layout";
import type {
  ColumnStatus,
  RotationBoard,
} from "@/features/allocation/domain/rotation-board";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { fetchClockedInRoster } from "@/features/tips/data/fetch-clocked-in-roster";
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
  // #109 U2: the newest board events, rendered from the complete supported
  // event model (Dashboard "Recent activity"), newest first.
  recentActivity: BoardActivityEntry[];
  eventCount: number;
  canUndo: boolean;
  canRedo: boolean;
  // Feature 028: the wall-clock service date this context was read for
  // (the requested date, or today when omitted), and whether that date is
  // strictly before today in the location's own time zone. isHistorical
  // is what allocation-workspace.tsx forces canWrite to false on --
  // deliberately independent of session status, so even a session that
  // was somehow left "active" on a past date still renders read-only.
  serviceDate: string;
  isHistorical: boolean;
  // Table Rotation Multi-View: Quick Add's clocked-in prioritization
  // signal only -- reuses Tip Split's own fetchClockedInRoster (Feature
  // 029) rather than a second attendance query. Never used to auto-add
  // anyone; see allocation-workspace.tsx's availableMembers sort.
  clockedInProfileIds: string[];
  // Table Rotation Multi-View: the location's registered physical tables
  // (public.dining_tables, now connected -- IMPLEMENTATION_CONTRACT.md
  // section 3/10), for the Floor/Picker map. Empty until an organization
  // has actually registered its floor plan -- no data is seeded by this
  // feature (there's no stable fixture to attach it to; see
  // IMPLEMENTATION_LOG.md). Demo mode never reads this -- it uses the
  // static DEMO_FLOOR_LAYOUT instead.
  physicalTables: FloorLayoutEntry[];
  // Cross-view integrity (X1): EVERY active registered table, including the
  // ones with no map position (position_x/y null). `physicalTables` above is
  // the drawable subset; this is the registry the read model resolves table
  // identity against so an unpositioned table is represented (off-map)
  // instead of silently dropped.
  registeredTables: RegistryTable[];
  // Production stability hotfix: true only when the dining_tables query
  // itself failed (network/PostgREST/RLS error, already console.error'd
  // above) -- distinct from a legitimate zero rows result. Lets the
  // Floor/Picker/Server empty-state message say "couldn't load" instead
  // of incorrectly claiming "no tables are configured" for what's
  // actually a query failure (see table-map.tsx).
  physicalTablesQueryFailed: boolean;
  // Table Rotation V2 Part 1 (1C): the authoritative physical ledger -- the
  // ACTIVE rows of public.section_assignments for this session, read in the
  // same snapshot as the board. Grid history comes from `board` (entries);
  // current physical ownership is what these claims say.
  claims: PhysicalClaim[];
  // Disagreements between the board-derived occupancy and `claims`. Empty
  // when consistent; surfaced to the user instead of silently picking a side.
  claimDivergences: ClaimDivergence[];
  // DATA-004: set when any segment of the board read failed (members, rounds,
  // entries, events, claims). A failed read must never render as a plausible
  // empty board -- the workspace shows an error state instead.
  boardLoadError: string | null;
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

// Production hotfix: dining_tables carries TWO foreign keys to
// dining_areas -- dining_tables_dining_area_id_fkey (the plain "which
// area is this table in" relationship, ON DELETE CASCADE) and
// dining_tables_area_tenant_fk (a composite (dining_area_id,
// organization_id) FK, tenant-isolation integrity only -- guarantees a
// table's area belongs to the same org, never a display relationship on
// its own). Both are legitimate and neither is redundant (only the
// plain FK cascades; the tenant FK doesn't), so neither should be
// dropped. Without qualifying which one to embed, PostgREST can't
// choose and returns PGRST201 ("more than one relationship was found")
// -- undetected until production actually had dining_tables rows to
// return (see docs/features/table-rotation-multi-view/IMPLEMENTATION_LOG.md's
// "PGRST201" entry). `!dining_tables_dining_area_id_fkey` explicitly
// selects the plain relationship -- the correct one for "what area is
// this table displayed under" -- without renaming the response key, so
// the row-mapping code below needs no changes. Exported as a named
// constant (not an inline string) so a regression test can assert the
// relationship stays explicitly qualified.
export const DINING_TABLES_SELECT =
  "id, label, position_x, position_y, active, dining_areas!dining_tables_dining_area_id_fkey(name)";

// A many-to-one PostgREST embed (many dining_tables -> one dining_areas)
// resolves to a single object at runtime, never an array -- see the
// resourceType inference below for why this matters. Typed to accept
// either shape anyway (defensive, not just runtime-correct): Supabase's
// generated types for a `!fkey`-qualified embed have been observed to
// still describe it as an array in this codebase's own
// database.generated.ts, so narrowing only to the object shape would
// fight the generated type rather than the actual PostgREST response.
export function diningAreaName(
  embed: { name: string | null } | { name: string | null }[] | null,
): string | null {
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0]?.name ?? null) : embed.name;
}

export async function getAllocationContext(
  organizationId: string,
  requestedServiceDate?: string,
): Promise<AllocationContext | null> {
  const supabase = await createClient();
  const location = await getPrimaryLocation(organizationId);
  if (!location) return null;

  const team = await getOrganizationRoster(organizationId);
  const today = zonedWallTimeFromInstant(new Date(), location.time_zone).date;
  const serviceDate = requestedServiceDate ?? today;
  const isHistorical = serviceDate < today;

  const clockedInResult = await fetchClockedInRoster(supabase, {
    organizationId,
    serviceDate,
  });
  // Prioritization only, never a hard dependency -- an attendance-lookup
  // failure shouldn't take down the whole board read.
  const clockedInProfileIds = clockedInResult.ok ? clockedInResult.data : [];

  const { data: tableRows, error: tableError } = await supabase
    .from("dining_tables")
    .select(DINING_TABLES_SELECT)
    .eq("location_id", location.id)
    .eq("active", true);
  if (tableError)
    console.error("getAllocationContext: dining_tables", tableError);
  const physicalTablesQueryFailed = tableError !== null;
  const registeredTables: RegistryTable[] = (tableRows ?? []).map((row) => ({
    diningTableId: row.id as number,
    label: row.label,
    x: row.position_x === null ? null : Number(row.position_x),
    y: row.position_y === null ? null : Number(row.position_y),
    resourceType: /bar/i.test(diningAreaName(row.dining_areas) ?? "")
      ? "bar_seat"
      : "table",
  }));
  const physicalTables: FloorLayoutEntry[] = (tableRows ?? [])
    .filter((row) => row.position_x !== null && row.position_y !== null)
    .map((row) => ({
      diningTableId: row.id as number,
      label: row.label,
      x: Number(row.position_x),
      y: Number(row.position_y),
      // No dedicated resource-type column on dining_tables -- inferred
      // from the dining area's own name until/unless a real onboarding
      // flow needs a first-class field for it.
      //
      // Production stability hotfix (bar-seat visual bug): PostgREST
      // embeds a many-to-one relationship (many dining_tables -> one
      // dining_areas) as a single object, e.g. `{ name: "Bar" }` --
      // never an array. `row.dining_areas?.[0]?.name` always missed
      // (index 0 of an object is undefined), so `name` was always
      // undefined and resourceType always fell back to "table" -- B1-B8
      // rendered with the square dining-table shape instead of the
      // round bar-seat one. Confirmed against the actual qualified
      // embed's shape (DINING_TABLES_SELECT), not assumed.
      resourceType: /bar/i.test(diningAreaName(row.dining_areas) ?? "")
        ? "bar_seat"
        : "table",
    }));

  // Feature 028: dropped the `.eq("status", "active")` filter that used to
  // scope this to only today's session. location_id + service_date +
  // meal_period is already a unique-enough combination in practice (the
  // DB's own partial unique index only enforces uniqueness among *active*
  // rows, so a historical date could in principle have been reopened and
  // reclosed more than once) -- order + limit defensively so a past date
  // with an unusual history still resolves to exactly one row rather than
  // erroring on `.maybeSingle()`.
  const { data: sessionRows, error: sessionError } = await supabase
    .from("service_sessions")
    .select("id")
    .eq("location_id", location.id)
    .eq("service_date", serviceDate)
    .eq("meal_period", "service")
    .order("id", { ascending: false })
    .limit(1);
  if (sessionError)
    console.error("getAllocationContext: service_sessions", sessionError);
  const session = sessionRows?.[0] ?? null;

  if (!session) {
    return {
      locationId: location.id,
      timeZone: location.time_zone,
      serviceSessionId: null,
      team,
      board: EMPTY_BOARD,
      crossEditLog: [],
      recentActivity: [],
      eventCount: 0,
      canUndo: false,
      canRedo: false,
      serviceDate,
      isHistorical,
      clockedInProfileIds,
      physicalTables,
      registeredTables,
      physicalTablesQueryFailed,
      claims: [],
      claimDivergences: [],
      boardLoadError: sessionError
        ? "We couldn't load today's board. Refresh to try again."
        : null,
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
    { data: claimRows, error: claimError },
  ] = await Promise.all([
    roundIds.length > 0
      ? supabase
          .from("table_rotation_entries")
          .select("rotation_round_id, rotation_member_id, table_label, status")
          .in("rotation_round_id", roundIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("board_events")
      .select(
        "id, event_type, actor_profile_id, payload, created_at, undone_at",
      )
      .eq("service_session_id", session.id)
      // id breaks created_at ties so the order is the write order, always.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("section_assignments")
      .select(
        "dining_table_id, server_profile_id, rotation_member_id, table_rotation_entry_id, dining_tables!section_assignments_dining_table_id_fkey(label)",
      )
      .eq("service_session_id", session.id)
      .is("released_at", null),
  ]);
  if (entryError)
    console.error("getAllocationContext: table_rotation_entries", entryError);
  if (eventError)
    console.error("getAllocationContext: board_events", eventError);
  if (claimError)
    console.error("getAllocationContext: section_assignments", claimError);
  const boardLoadError =
    memberError || roundError || entryError || eventError || claimError
      ? "Part of today's board couldn't be loaded, so what you see may be incomplete. Refresh to try again."
      : null;

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
        // A row's mere existence means "active" pre-Upgrade-1.1; the DB
        // column's values (active/ended/skipped) already match
        // RotationCellStatus directly, no translation needed.
        status: (entry.status ?? "active") as "active" | "ended" | "skipped",
      }))
      .filter((cell) => cell.columnId !== ""),
  }));

  const board: RotationBoard = {
    columns,
    rounds,
    nextRoundNumber: (roundRows?.at(-1)?.sequence ?? 0) + 1,
  };

  const claims: PhysicalClaim[] = (claimRows ?? []).map((row) => ({
    diningTableId: row.dining_table_id,
    label: claimLabel(row.dining_tables),
    serverProfileId: row.server_profile_id,
    rotationMemberId: row.rotation_member_id,
    entryId: row.table_rotation_entry_id,
  }));
  const registeredLabels = (tableRows ?? []).map((row) => row.label);
  // Only meaningful when both halves loaded; a failed read is reported via
  // boardLoadError instead of being mistaken for a divergence.
  const claimDivergences =
    claimError || tableError || entryError
      ? []
      : findClaimDivergences({ board, registeredLabels, claims });

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

  const roundSequenceById = new Map(
    (roundRows ?? []).map((round) => [round.id, round.sequence]),
  );
  const recentActivity = buildRecentActivity(eventRows ?? [], {
    actorName: (profileId) => nameByProfileId.get(profileId),
    memberName: (memberId) => {
      const profileId = memberIdToProfileId.get(memberId);
      return profileId ? nameByProfileId.get(profileId) : undefined;
    },
    roundSequence: (roundId) => roundSequenceById.get(roundId),
  });

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
    recentActivity,
    eventCount: (eventRows ?? []).length,
    canUndo,
    canRedo,
    serviceDate,
    isHistorical,
    clockedInProfileIds,
    physicalTables,
    registeredTables,
    physicalTablesQueryFailed,
    claims,
    claimDivergences,
    boardLoadError,
  };
}

// A many-to-one PostgREST embed arrives as an object (see diningAreaName).
function claimLabel(
  embed: { label: string } | { label: string }[] | null,
): string {
  if (!embed) return "";
  return Array.isArray(embed) ? (embed[0]?.label ?? "") : embed.label;
}
