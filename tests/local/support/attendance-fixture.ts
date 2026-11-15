import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

function resolveLocalEnv() {
  let url =
    process.env.LOCAL_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  let anon =
    process.env.LOCAL_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  let secret =
    process.env.LOCAL_SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";

  if (!anon || !secret) {
    try {
      const out = execSync("npx supabase status -o env", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (!anon) {
        const m =
          out.match(/PUBLISHABLE_KEY=["']?([^"'\r\n]+)/) ||
          out.match(/ANON_KEY=["']?([^"'\r\n]+)/);
        if (m) anon = m[1].trim();
      }
      if (!secret) {
        const m =
          out.match(/SECRET_KEY=["']?([^"'\r\n]+)/) ||
          out.match(/SERVICE_ROLE_KEY=["']?([^"'\r\n]+)/);
        if (m) secret = m[1].trim();
      }
      if (!url) {
        const m = out.match(/API_URL=["']?([^"'\r\n]+)/);
        if (m) url = m[1].trim();
      }
    } catch {
      // ignore
    }
  }

  return {
    url: url || "http://127.0.0.1:54321",
    anon,
    secret,
  };
}

export const attendanceEnv = resolveLocalEnv();

export type AttendanceTestUser = {
  id: string;
  name: string;
  email: string;
  client: SupabaseClient<Database>;
};

export function must<
  R extends { data: unknown; error: { message: string } | null },
>(r: R): NonNullable<R["data"]> {
  if (r.error) throw Error(r.error.message);
  return r.data as NonNullable<R["data"]>;
}

export type AttendanceFixture = {
  run: string;
  admin: SupabaseClient<Database>;
  orgA: { id: string; name: string; slug: string };
  orgB: { id: string; name: string; slug: string };
  locInternal: string;
  locExternal: string;
  locDisabled: string;
  locUnconfigured: string;
  locB: string;
  locForeign: string;
  overallManager: AttendanceTestUser;
  orgGM: AttendanceTestUser;
  managerA: AttendanceTestUser;
  managerB: AttendanceTestUser;
  staffA: AttendanceTestUser;
  staffA2: AttendanceTestUser;
  staffB: AttendanceTestUser;
  revokedMgr: AttendanceTestUser;
  foreignUser: AttendanceTestUser;
  session1Id: string;
  session2Id: string;
  session3Id: string;
  session4Id: string;
  teardown: () => Promise<void>;
};

export async function createAttendanceFixture(): Promise<AttendanceFixture> {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(attendanceEnv.url) ||
    !attendanceEnv.secret ||
    !attendanceEnv.anon
  ) {
    throw Error("Disposable loopback Supabase credentials required");
  }

  const admin = createClient<Database>(
    attendanceEnv.url,
    attendanceEnv.secret,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const run = crypto.randomUUID().slice(0, 8);
  const users: AttendanceTestUser[] = [];

  async function makeUser(
    key: string,
    displayName: string,
  ): Promise<AttendanceTestUser> {
    const email = `att-${run}-${key}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const result = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = result.user!.id;
    must(
      await admin.from("profiles").insert({ id, display_name: displayName }),
    );
    const client = createClient<Database>(
      attendanceEnv.url,
      attendanceEnv.anon,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    must(await client.auth.signInWithPassword({ email, password }));
    const user = { id, name: displayName, email, client };
    users.push(user);
    return user;
  }

  const overallManager = await makeUser("overall", "Olive Overall");
  const orgGM = await makeUser("org-gm", "Gail GeneralManager");
  const managerA = await makeUser("mgr-a", "Maya Manager A");
  const managerB = await makeUser("mgr-b", "Ben Manager B");
  const staffA = await makeUser("staff-a", "Sam Staff A");
  const staffA2 = await makeUser("staff-a2", "Sara Staff A2");
  const staffB = await makeUser("staff-b", "Bob Staff B");
  const revokedMgr = await makeUser("revoked-mgr", "Rita Revoked");
  const foreignUser = await makeUser("foreign", "Fay Foreign");

  // Overall Role
  must(
    await admin.from("overall_roles").insert({
      profile_id: overallManager.id,
      role: "manager",
    }),
  );

  // Organizations
  const orgA = must(
    await admin
      .from("organizations")
      .insert({
        name: `Attendance Org ${run}`,
        slug: `att-org-${run}`,
        created_by: orgGM.id,
      })
      .select()
      .single(),
  )!;

  const orgB = must(
    await admin
      .from("organizations")
      .insert({
        name: `Attendance Foreign ${run}`,
        slug: `att-foreign-${run}`,
        created_by: foreignUser.id,
      })
      .select()
      .single(),
  )!;

  // Locations
  const locRows = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: orgA.id,
          name: "Attendance Loc Internal",
          time_zone: "America/Chicago",
          attendance_mode: "internal_the_lineup",
          active: true,
        },
        {
          organization_id: orgA.id,
          name: "Attendance Loc External",
          time_zone: "America/Chicago",
          attendance_mode: "external",
          active: true,
        },
        {
          organization_id: orgA.id,
          name: "Attendance Loc Disabled",
          time_zone: "America/Chicago",
          attendance_mode: "disabled",
          active: true,
        },
        {
          organization_id: orgA.id,
          name: "Attendance Loc Unconfigured",
          time_zone: "America/Chicago",
          attendance_mode: null,
          active: true,
        },
        {
          organization_id: orgA.id,
          name: "Attendance Loc B",
          time_zone: "America/New_York",
          attendance_mode: "internal_the_lineup",
          active: true,
        },
        {
          organization_id: orgB.id,
          name: "Attendance Foreign Loc",
          time_zone: "America/Chicago",
          attendance_mode: "internal_the_lineup",
          active: true,
        },
      ])
      .select(),
  )!;

  const locInternal = locRows.find(
    (l) => l.name === "Attendance Loc Internal",
  )!.id;
  const locExternal = locRows.find(
    (l) => l.name === "Attendance Loc External",
  )!.id;
  const locDisabled = locRows.find(
    (l) => l.name === "Attendance Loc Disabled",
  )!.id;
  const locUnconfigured = locRows.find(
    (l) => l.name === "Attendance Loc Unconfigured",
  )!.id;
  const locB = locRows.find((l) => l.name === "Attendance Loc B")!.id;
  const locForeign = locRows.find(
    (l) => l.name === "Attendance Foreign Loc",
  )!.id;

  // Module configs: enable attendance module for all locations
  must(
    await admin.from("location_module_configs").insert([
      { location_id: locInternal, module_key: "attendance", is_enabled: true },
      { location_id: locExternal, module_key: "attendance", is_enabled: true },
      { location_id: locDisabled, module_key: "attendance", is_enabled: true },
      {
        location_id: locUnconfigured,
        module_key: "attendance",
        is_enabled: true,
      },
      { location_id: locB, module_key: "attendance", is_enabled: true },
      { location_id: locForeign, module_key: "attendance", is_enabled: true },
    ]),
  );

  // Memberships
  must(
    await admin.from("memberships").insert([
      {
        organization_id: orgA.id,
        profile_id: orgGM.id,
        roles: ["general_manager"],
        active: true,
      },
      {
        organization_id: orgA.id,
        profile_id: managerA.id,
        roles: ["server"],
        active: true,
      },
      {
        organization_id: orgA.id,
        profile_id: managerB.id,
        roles: ["server"],
        active: true,
      },
      {
        organization_id: orgA.id,
        profile_id: staffA.id,
        roles: ["server"],
        active: true,
      },
      {
        organization_id: orgA.id,
        profile_id: staffA2.id,
        roles: ["server"],
        active: true,
      },
      {
        organization_id: orgA.id,
        profile_id: staffB.id,
        roles: ["server"],
        active: true,
      },
      {
        organization_id: orgA.id,
        profile_id: revokedMgr.id,
        roles: ["server"],
        active: false, // Revoked!
      },
      {
        organization_id: orgB.id,
        profile_id: foreignUser.id,
        roles: ["owner"],
        active: true,
      },
    ]),
  );

  // Location memberships
  must(
    await admin.from("location_memberships").insert([
      { location_id: locInternal, profile_id: managerA.id, role: "manager" },
      { location_id: locExternal, profile_id: managerA.id, role: "manager" },
      { location_id: locDisabled, profile_id: managerA.id, role: "manager" },
      {
        location_id: locUnconfigured,
        profile_id: managerA.id,
        role: "manager",
      },
      { location_id: locB, profile_id: managerB.id, role: "manager" },
      { location_id: locInternal, profile_id: staffA.id, role: "staff" },
      { location_id: locInternal, profile_id: staffA2.id, role: "staff" },
      { location_id: locB, profile_id: staffB.id, role: "staff" },
      { location_id: locInternal, profile_id: revokedMgr.id, role: "manager" },
      { location_id: locForeign, profile_id: foreignUser.id, role: "manager" },
    ]),
  );

  // Seed attendance sessions in locInternal
  const session1Id = crypto.randomUUID();
  const session2Id = crypto.randomUUID();
  const session3Id = crypto.randomUUID();
  const session4Id = crypto.randomUUID();

  // Session 1: Completed with unclassified breaks (Sam Staff A)
  // Clock in: 2026-11-09T14:00:00Z (08:00 CST), Clock out: 2026-11-09T22:00:00Z (16:00 CST)
  // Gross: 28800s, Break: 2700s (unclassified) -> net payable NULL (Pending)
  must(
    await admin.from("attendance_sessions").insert({
      id: session1Id,
      organization_id: orgA.id,
      location_id: locInternal,
      profile_id: staffA.id,
      service_date: "2026-11-09",
      status: "completed",
      clock_in_at: "2026-11-09T14:00:00Z",
      clock_out_at: "2026-11-09T22:00:00Z",
      gross_elapsed_seconds: 28800,
      total_break_seconds: 2700,
      created_by: staffA.id,
      version: 1,
    }),
  );

  must(
    await admin.from("attendance_breaks").insert([
      {
        session_id: session1Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        start_time: "2026-11-09T17:00:00Z",
        end_time: "2026-11-09T17:30:00Z",
        duration_seconds: 1800,
        pay_classification: "unclassified",
      },
      {
        session_id: session1Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        start_time: "2026-11-09T19:00:00Z",
        end_time: "2026-11-09T19:15:00Z",
        duration_seconds: 900,
        pay_classification: "unclassified",
      },
    ]),
  );

  must(
    await admin.from("attendance_events").insert([
      {
        session_id: session1Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        event_type: "clock_in",
        event_time: "2026-11-09T14:00:00Z",
        service_date: "2026-11-09",
        source: "web",
        actor_profile_id: staffA.id,
      },
      {
        session_id: session1Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        event_type: "clock_out",
        event_time: "2026-11-09T22:00:00Z",
        service_date: "2026-11-09",
        source: "web",
        actor_profile_id: staffA.id,
      },
    ]),
  );

  // Session 2: Active / Open session (Sara Staff A2)
  must(
    await admin.from("attendance_sessions").insert({
      id: session2Id,
      organization_id: orgA.id,
      location_id: locInternal,
      profile_id: staffA2.id,
      service_date: "2026-11-09",
      status: "active",
      clock_in_at: "2026-11-09T15:00:00Z",
      clock_out_at: null,
      gross_elapsed_seconds: null,
      total_break_seconds: 0,
      created_by: staffA2.id,
      version: 1,
    }),
  );

  must(
    await admin.from("attendance_events").insert({
      session_id: session2Id,
      organization_id: orgA.id,
      location_id: locInternal,
      profile_id: staffA2.id,
      event_type: "clock_in",
      event_time: "2026-11-09T15:00:00Z",
      service_date: "2026-11-09",
      source: "web",
      actor_profile_id: staffA2.id,
    }),
  );

  // Session 3: Manager A's own session (completed, paid break -> resolved payable)
  must(
    await admin.from("attendance_sessions").insert({
      id: session3Id,
      organization_id: orgA.id,
      location_id: locInternal,
      profile_id: managerA.id,
      service_date: "2026-11-09",
      status: "completed",
      clock_in_at: "2026-11-09T13:00:00Z",
      clock_out_at: "2026-11-09T21:00:00Z",
      gross_elapsed_seconds: 28800,
      total_break_seconds: 1800,
      created_by: managerA.id,
      version: 1,
    }),
  );

  must(
    await admin.from("attendance_breaks").insert({
      session_id: session3Id,
      organization_id: orgA.id,
      location_id: locInternal,
      profile_id: managerA.id,
      start_time: "2026-11-09T16:00:00Z",
      end_time: "2026-11-09T16:30:00Z",
      duration_seconds: 1800,
      pay_classification: "paid",
      classified_by: managerA.id,
      classified_at: "2026-11-09T16:30:00Z",
    }),
  );

  must(
    await admin.from("attendance_events").insert([
      {
        session_id: session3Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: managerA.id,
        event_type: "clock_in",
        event_time: "2026-11-09T13:00:00Z",
        service_date: "2026-11-09",
        source: "web",
        actor_profile_id: managerA.id,
      },
      {
        session_id: session3Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: managerA.id,
        event_type: "clock_out",
        event_time: "2026-11-09T21:00:00Z",
        service_date: "2026-11-09",
        source: "web",
        actor_profile_id: managerA.id,
      },
    ]),
  );

  // Session 4: Already corrected session (Sam Staff A, service_date 2026-11-08)
  must(
    await admin.from("attendance_sessions").insert({
      id: session4Id,
      organization_id: orgA.id,
      location_id: locInternal,
      profile_id: staffA.id,
      service_date: "2026-11-08",
      status: "completed",
      clock_in_at: "2026-11-08T14:00:00Z",
      clock_out_at: "2026-11-08T18:00:00Z",
      gross_elapsed_seconds: 14400,
      total_break_seconds: 0,
      created_by: staffA.id,
      version: 2,
      correction_count: 1,
      last_corrected_at: "2026-11-08T19:00:00Z",
    }),
  );

  must(
    await admin.from("attendance_events").insert([
      {
        session_id: session4Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        event_type: "clock_in",
        event_time: "2026-11-08T14:00:00Z",
        service_date: "2026-11-08",
        source: "web",
        actor_profile_id: staffA.id,
        is_manager_correction: false,
        metadata: {},
      },
      {
        session_id: session4Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        event_type: "clock_out",
        event_time: "2026-11-08T18:00:00Z",
        service_date: "2026-11-08",
        source: "web",
        actor_profile_id: staffA.id,
        is_manager_correction: false,
        metadata: {},
      },
      {
        session_id: session4Id,
        organization_id: orgA.id,
        location_id: locInternal,
        profile_id: staffA.id,
        event_type: "manager_edit",
        event_time: "2026-11-08T19:00:00Z",
        service_date: "2026-11-08",
        source: "manager",
        actor_profile_id: managerA.id,
        is_manager_correction: true,
        correction_reason: "Added missing clock-out",
        metadata: {
          version_before: 1,
          version_after: 2,
          changed_fields: ["clock_out_at"],
        },
      },
    ]),
  );

  return {
    run,
    admin,
    orgA,
    orgB,
    locInternal,
    locExternal,
    locDisabled,
    locUnconfigured,
    locB,
    locForeign,
    overallManager,
    orgGM,
    managerA,
    managerB,
    staffA,
    staffA2,
    staffB,
    revokedMgr,
    foreignUser,
    session1Id,
    session2Id,
    session3Id,
    session4Id,
    async teardown() {
      // Clean up overall roles for synthetic test users
      await admin
        .from("overall_roles")
        .delete()
        .in(
          "profile_id",
          users.map((u) => u.id),
        );
      // Module configs
      await admin
        .from("location_module_configs")
        .delete()
        .in("location_id", [
          locInternal,
          locExternal,
          locDisabled,
          locUnconfigured,
          locB,
          locForeign,
        ]);
    },
  };
}
