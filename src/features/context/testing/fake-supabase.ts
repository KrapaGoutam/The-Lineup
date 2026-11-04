/**
 * Test-only in-memory Supabase double for the V2-003.001 context boundary.
 *
 * It is intentionally NOT a mock that returns a canned context: it holds
 * table rows, answers the exact PostgREST-style chains the real loader issues
 * (`select/eq/in/order/maybeSingle`), and (by default) applies the same
 * row-visibility rules as the real RLS policies, so a revoked member or a
 * non-member genuinely cannot see the rows a privileged reader could.
 *
 *   organizations        : Overall role holder OR ACTIVE org member
 *   locations            : Overall role holder OR ACTIVE org member
 *   memberships          : own ACTIVE membership rows only (has_org_role)
 *                          (+ every row for Overall holders)
 *   location_memberships : own rows (+ every row for Overall holders)
 *   overall_roles        : own row
 *
 * The real resolver/loader code runs unmodified on top of it.
 */

type Row = Record<string, unknown>;

export interface FakeDb {
  organizations: Row[];
  locations: Row[];
  memberships: Row[];
  location_memberships: Row[];
  overall_roles: Row[];
  profiles: Row[];
}

export interface FakeSupabaseOptions {
  /** Authenticated user id; null = no session. */
  userId: string | null;
  authError?: { name?: string; status?: number; message?: string } | null;
  db: FakeDb;
  /** table -> error returned for any query against it. */
  tableErrors?: Partial<Record<keyof FakeDb, { message: string }>>;
  /** Disable RLS emulation (privileged reader). Default true = RLS on. */
  rls?: boolean;
}

export interface QueryLog {
  table: string;
  filters: Array<{ op: "eq" | "in"; column: string; value: unknown }>;
}

function isOverall(db: FakeDb, userId: string | null): boolean {
  return db.overall_roles.some((r) => r.profile_id === userId);
}

function activeMember(
  db: FakeDb,
  userId: string | null,
  organizationId: unknown,
): boolean {
  return db.memberships.some(
    (m) =>
      m.profile_id === userId &&
      m.organization_id === organizationId &&
      m.active === true,
  );
}

function visible(
  db: FakeDb,
  userId: string | null,
  table: string,
  row: Row,
): boolean {
  if (!userId) return false;
  const overall = isOverall(db, userId);
  switch (table) {
    case "organizations":
      return overall || activeMember(db, userId, row.id);
    case "locations":
      return overall || activeMember(db, userId, row.organization_id);
    case "memberships":
      return (
        (overall && row.profile_id === userId) ||
        (row.profile_id === userId && row.active === true)
      );
    case "location_memberships":
      return row.profile_id === userId || overall;
    case "overall_roles":
      return row.profile_id === userId;
    case "profiles":
      return row.id === userId;
    default:
      return false;
  }
}

export function createFakeSupabase(options: FakeSupabaseOptions) {
  const { db, userId } = options;
  const rls = options.rls ?? true;
  const queries: QueryLog[] = [];

  function from(table: keyof FakeDb) {
    const log: QueryLog = { table, filters: [] };
    queries.push(log);
    const predicates: Array<(row: Row) => boolean> = [];

    const run = () => {
      const error = options.tableErrors?.[table];
      if (error) return { data: null, error };
      let rows = db[table].filter((row) =>
        rls ? visible(db, userId, table, row) : true,
      );
      for (const predicate of predicates) rows = rows.filter(predicate);
      if (table === "location_memberships") {
        rows = rows.map((row) => ({
          ...row,
          locations: {
            organization_id: db.locations.find((l) => l.id === row.location_id)
              ?.organization_id,
          },
        }));
      }
      return { data: rows, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        log.filters.push({ op: "eq", column, value });
        predicates.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        log.filters.push({ op: "in", column, value: values });
        predicates.push((row) => values.includes(row[column]));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        const { data, error } = run();
        if (error) return { data: null, error };
        const rows = (data ?? []) as Row[];
        return { data: rows[0] ?? null, error: null };
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: async () => {
        if (options.authError) {
          return { data: { user: null }, error: options.authError };
        }
        return {
          data: { user: userId ? { id: userId } : null },
          error: userId
            ? null
            : { name: "AuthSessionMissingError", status: 400 },
        };
      },
    },
    from,
  };

  return { client: client as never, queries };
}

// ── Canonical fixtures ──────────────────────────────────────────────────────

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const IDS = {
  orgMonks: id(1),
  orgLiquorTap: id(2),
  locWebster: id(11),
  locNasa: id(12),
  locLeagueCity: id(13),
  locOldKemah: id(14), // inactive
  locArchived: id(15), // archived
  locMonksSecond: id(16), // second Monks branch (active)
  jack: id(101),
  sam: id(102),
  tom: id(103),
  jerry: id(104),
  overallOwner: id(201),
  overallManager: id(202),
  overallAssistant: id(203),
  orgOwnerLiquor: id(204),
  revokedCreator: id(205),
  stranger: id(206),
} as const;

export function baseDb(): FakeDb {
  const loc = (
    locId: string,
    organizationId: string,
    name: string,
    extra: Row = {},
  ): Row => ({
    id: locId,
    organization_id: organizationId,
    name,
    time_zone: "America/Chicago",
    active: true,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  });

  return {
    organizations: [
      { id: IDS.orgMonks, name: "Monks", slug: "the-monks" },
      { id: IDS.orgLiquorTap, name: "Liquor Tap", slug: "liquor-tap" },
    ],
    locations: [
      loc(IDS.locWebster, IDS.orgMonks, "Webster"),
      loc(IDS.locNasa, IDS.orgLiquorTap, "NASA", {
        time_zone: "America/Chicago",
      }),
      loc(IDS.locLeagueCity, IDS.orgLiquorTap, "League City"),
      loc(IDS.locOldKemah, IDS.orgLiquorTap, "Old Kemah", { active: false }),
      loc(IDS.locArchived, IDS.orgLiquorTap, "Closed Annex", {
        active: false,
        archived_at: "2026-10-01T00:00:00Z",
      }),
    ],
    memberships: [],
    location_memberships: [],
    overall_roles: [],
    profiles: [],
  };
}

let membershipSeq = 0;

export function addMembership(
  db: FakeDb,
  profileId: string,
  organizationId: string,
  roles: string[] = ["server"],
  active = true,
): void {
  db.memberships.push({
    id: ++membershipSeq,
    organization_id: organizationId,
    profile_id: profileId,
    roles,
    active,
    created_at: "2026-01-01T00:00:00Z",
  });
}

export function addAssignment(
  db: FakeDb,
  profileId: string,
  locationId: string,
  role: string = "staff",
  active = true,
): void {
  db.location_memberships.push({
    id: ++membershipSeq,
    location_id: locationId,
    profile_id: profileId,
    role,
    active,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
}

export function addOverall(db: FakeDb, profileId: string, role: string): void {
  db.overall_roles.push({ profile_id: profileId, role });
}
