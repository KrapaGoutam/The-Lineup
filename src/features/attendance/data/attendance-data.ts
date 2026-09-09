import "server-only";

import { neon } from "@neondatabase/serverless";

export type NeonUser = {
  id: number;
  fullName: string;
  role: string;
  phone: string | null;
  createdAt: string;
  isActive: boolean;
};

export type NeonAttendanceRow = {
  id: number;
  userId: number;
  // A plain calendar date, "YYYY-MM-DD" -- see ATTENDANCE_QUERY_SQL's
  // `date::text` cast for why this is forced to a string in the query
  // itself rather than left as a driver-parsed Date object.
  date: string;
  // Full ISO instant strings (or null) -- clock_in/clock_out are
  // genuine timezone-aware instants, unlike `date` above, so converting
  // them client-side (via zonedWallTimeFromInstant, the same helper
  // every other real-mode display in this app already uses) is correct
  // and safe. Formatting to the restaurant's local wall-clock time
  // happens at render time, where the timeZone is in scope, not here.
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: number | null;
  autoClockedOut: boolean;
};

export type AttendanceFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// A hard timeout on every Neon call -- generous for a simple indexed read,
// tight enough that a manager isn't left staring at a feature that looks
// broken. Neon's driver merges `fetchOptions` into the underlying fetch()
// call, so a standard AbortSignal is the actual enforcement mechanism --
// confirmed against the installed driver's real type definitions, not
// assumed from its docs alone.
const QUERY_TIMEOUT_MS = 5000;

// The exact, explicit column list this app will ever request from Neon's
// `users` table -- deliberately never `select *`. `pin_hash` is a real
// column on that table and must never cross the wire. This string is the
// literal query text (not a separately-maintained column array that could
// drift out of sync with it), so a test asserting on it is asserting on
// what actually gets sent, not on a comment's promise about it.
export const USERS_QUERY_SQL =
  "select id, full_name, role, phone, created_at, is_active " +
  "from users where is_active = true order by full_name asc";

// `date::text` -- live-verified against the real data: the driver parses
// a plain `date` column into a JS Date object using an assumed timezone
// at parse time (confirmed distinct from clock_in/clock_out, which are
// genuine timestamptz instants and don't have this problem), which risks
// the calendar day itself shifting depending on where the code runs (a
// dev machine's local zone versus a UTC-running Vercel function could
// disagree). Casting to text in the query forces Postgres to hand back
// the exact "YYYY-MM-DD" it stores, with zero client-side reinterpretation
// possible. The WHERE clause still compares against the real `date`
// column (unaffected by the SELECT list's cast), which is what actually
// needs correct date semantics for the range filter.
export const ATTENDANCE_QUERY_SQL =
  "select id, user_id, date::text as date, clock_in, clock_out, hours_worked, auto_clocked_out " +
  "from attendance where user_id = ANY($1) and date >= $2 and date <= $3 " +
  "order by date asc, clock_in asc nulls last";

// Feature 029. "Currently clocked in" means a real, still-open shift:
// a clock_in exists, and neither a clock_out nor an auto-close has
// happened yet. Filtered by the caller's own already-computed
// `serviceDate` (the restaurant's wall-clock "today", per
// zonedWallTimeFromInstant) -- never the database server's own idea of
// "today", the same discipline every other real-mode date filter in
// this app already follows.
export const ACTIVE_CLOCK_INS_QUERY_SQL =
  "select id, user_id, date::text as date, clock_in, clock_out, hours_worked, auto_clocked_out " +
  "from attendance where date = $1 and clock_in is not null " +
  "and clock_out is null and auto_clocked_out = false " +
  "order by clock_in asc";

type RawAttendanceRow = {
  id: number;
  user_id: number;
  date: string; // forced to text by the query -- see ATTENDANCE_QUERY_SQL
  clock_in: Date | null;
  clock_out: Date | null;
  hours_worked: string | number | null;
  auto_clocked_out: boolean;
};

// Shared by every function below that maps a raw Neon row -- the one
// place the wire shape (snake_case, numeric-as-string hours,
// driver-parsed Date objects) turns into this app's own NeonAttendanceRow.
function mapAttendanceRow(row: RawAttendanceRow): NeonAttendanceRow {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    clockIn: row.clock_in ? row.clock_in.toISOString() : null,
    clockOut: row.clock_out ? row.clock_out.toISOString() : null,
    // Postgres numeric/decimal columns come back as strings over the
    // wire (avoiding float precision loss) -- converted here, once.
    hoursWorked: row.hours_worked === null ? null : Number(row.hours_worked),
    autoClockedOut: row.auto_clocked_out,
  };
}

/**
 * Never a module-level singleton -- created fresh inside each call, so
 * `process.env.NEON_DATABASE_URL` is only ever read at request time, the
 * same lazy-read rule every other data-layer module in this app already
 * follows (see docs/features/018-neon-attendance-report.md's "Read before
 * assuming this is greenfield" for why this is what keeps `npm run build`
 * passing in CI with the variable unset). Also means the query timeout's
 * AbortSignal, which starts counting the moment it's created, always
 * covers exactly the one query it's attached to.
 */
function getNeonSql() {
  const connectionString = process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error("NEON_DATABASE_URL is not set.");
  }
  return neon(connectionString, {
    fetchOptions: { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) },
  });
}

const UNAVAILABLE_ERROR = "Attendance data unavailable. Try again shortly.";

export async function getActiveNeonUsers(): Promise<
  AttendanceFetchResult<NeonUser[]>
> {
  try {
    const sql = getNeonSql();
    const rows = (await sql.query(USERS_QUERY_SQL)) as Array<{
      id: number;
      full_name: string;
      role: string;
      phone: string | null;
      // The driver parses this timestamptz column into a real JS Date --
      // unlike attendance.date (see ATTENDANCE_QUERY_SQL's comment),
      // created_at is a genuine instant, so converting it client-side is
      // safe. Not currently rendered anywhere, but kept honestly typed
      // (a real string, not a Date silently mislabeled as one) rather
      // than left to accidentally cross a JSX boundary the way the raw
      // attendance rows initially did -- caught live, not assumed fixed.
      created_at: Date;
      is_active: boolean;
    }>;
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        role: row.role,
        phone: row.phone,
        createdAt: row.created_at.toISOString(),
        isActive: row.is_active,
      })),
    };
  } catch (error) {
    console.error("getActiveNeonUsers failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
}

export async function getAttendanceRows(input: {
  userIds: number[];
  startDate: string;
  endDate: string;
}): Promise<AttendanceFetchResult<NeonAttendanceRow[]>> {
  if (input.userIds.length === 0) return { ok: true, data: [] };
  try {
    const sql = getNeonSql();
    const rows = (await sql.query(ATTENDANCE_QUERY_SQL, [
      input.userIds,
      input.startDate,
      input.endDate,
    ])) as RawAttendanceRow[];
    return { ok: true, data: rows.map(mapAttendanceRow) };
  } catch (error) {
    console.error("getAttendanceRows failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
}

/**
 * Feature 029. Read-only: who has a genuinely open shift right now, for
 * one calendar date. This is the sole real-mode data source for Tip
 * Split's "Pull clocked-in team" -- it returns Neon `user_id`s only,
 * never a profile id (resolving that is `fetch-clocked-in-roster.ts`'s
 * job, via `attendance_identity_links`, one layer up).
 */
export async function getActiveClockedInRows(input: {
  serviceDate: string;
}): Promise<AttendanceFetchResult<NeonAttendanceRow[]>> {
  try {
    const sql = getNeonSql();
    const rows = (await sql.query(ACTIVE_CLOCK_INS_QUERY_SQL, [
      input.serviceDate,
    ])) as RawAttendanceRow[];
    return { ok: true, data: rows.map(mapAttendanceRow) };
  } catch (error) {
    console.error("getActiveClockedInRows failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
}
