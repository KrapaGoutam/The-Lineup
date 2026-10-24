/**
 * Real-mode (hosted DEV) test harness for Table Rotation V2.
 *
 * Unlike the demo-mode Playwright suite and the single-actor pgTAP files,
 * this drives the real Supabase project through each synthetic user's own
 * JWT, so RLS, grants, SECURITY DEFINER boundaries and triggers all apply
 * exactly as they do for a browser session.
 *
 * Safety:
 *   - hard-aborts unless NEXT_PUBLIC_SUPABASE_URL is the the-lineup-dev ref
 *     and refuses the production ref outright;
 *   - every run creates its OWN organization / locations / users with random
 *     names and deletes them afterwards -- existing DEV data is never read
 *     or modified;
 *   - credentials are random per run, never printed, never persisted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEV_REF = "opmujepkemwcdxxorhfd";
const PROD_REF = "ftadewtkjlaotfdvtjcv";

type Env = { url: string; anonKey: string; serviceKey: string };

function loadDevEnv(): Env {
  const file = path.resolve(process.cwd(), ".env.development.local");
  const parsed: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) parsed[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  const url = parsed.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (url.includes(PROD_REF)) throw new Error("Refusing to run against PROD.");
  if (!url.includes(DEV_REF)) {
    throw new Error("Real-mode tests only run against the-lineup-dev.");
  }
  return {
    url,
    anonKey: parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    serviceKey: parsed.SUPABASE_SECRET_KEY,
  };
}

export const env = loadDevEnv();

export function adminClient(): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

export type Fixture = {
  admin: SupabaseClient;
  orgId: string;
  otherOrgId: string;
  locA: string;
  locB: string;
  otherLoc: string;
  /** label -> dining_tables.id, per location */
  tablesA: Map<string, number>;
  tablesB: Map<string, number>;
  owner: TestUser;
  manager: TestUser;
  server1: TestUser;
  server2: TestUser;
  server3: TestUser;
  outsider: TestUser;
  anon: SupabaseClient;
  teardown: () => Promise<void>;
};

export const TABLE_LABELS = Array.from({ length: 20 }, (_, i) => String(i + 1));

export function todayInChicago(offsetDays = 0): string {
  const base = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(base);
}

// Untyped on purpose: the harness drives an unparameterized client and only
// ever reads ids / labels back out of fixture inserts.
/* eslint-disable @typescript-eslint/no-explicit-any */
function must(
  result: { data: any; error: { message: string } | null },
  what: string,
): any {
  if (result.error || result.data === null) {
    throw new Error(`${what}: ${result.error?.message ?? "no data"}`);
  }
  return result.data;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function makeUser(
  admin: SupabaseClient,
  runId: string,
  key: string,
): Promise<TestUser> {
  const email = `v2h-${runId}-${key}@harness.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser ${key}: ${created.error?.message}`);
  }
  const id = created.data.user.id;
  const name = `V2H ${key} ${runId}`;
  const profile = await admin
    .from("profiles")
    .insert({ id, display_name: name });
  if (profile.error)
    throw new Error(`profile ${key}: ${profile.error.message}`);

  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { id, name, email, password, client };
}

async function signIn(user: TestUser) {
  const result = await user.client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (result.error)
    throw new Error(`sign-in ${user.email}: ${result.error.message}`);
}

export async function createFixture(): Promise<Fixture> {
  const admin = adminClient();
  const runId = crypto.randomBytes(4).toString("hex");

  const [owner, manager, server1, server2, server3, outsider] =
    await Promise.all(
      ["owner", "manager", "server1", "server2", "server3", "outsider"].map(
        (key) => makeUser(admin, runId, key),
      ),
    );

  const org = must(
    await admin
      .from("organizations")
      .insert({
        name: `V2 Harness ${runId}`,
        slug: `v2h-${runId}`,
        created_by: owner.id,
      })
      .select("id")
      .single(),
    "organization",
  );
  const otherOrg = must(
    await admin
      .from("organizations")
      .insert({
        name: `V2 Harness Other ${runId}`,
        slug: `v2ho-${runId}`,
        created_by: outsider.id,
      })
      .select("id")
      .single(),
    "other organization",
  );

  const locations = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: org.id,
          name: "Harness A",
          time_zone: "America/Chicago",
        },
        {
          organization_id: org.id,
          name: "Harness B",
          time_zone: "America/Chicago",
        },
        {
          organization_id: otherOrg.id,
          name: "Harness Other",
          time_zone: "America/Chicago",
        },
      ])
      .select("id, name"),
    "locations",
  );
  const locA = locations.find(
    (l: { id: string; name: string }) => l.name === "Harness A",
  )!.id as string;
  const locB = locations.find(
    (l: { id: string; name: string }) => l.name === "Harness B",
  )!.id as string;
  const otherLoc = locations.find(
    (l: { id: string; name: string }) => l.name === "Harness Other",
  )!.id as string;

  must(
    await admin
      .from("memberships")
      .insert([
        {
          organization_id: org.id,
          profile_id: owner.id,
          roles: ["owner"],
          active: true,
        },
        {
          organization_id: org.id,
          profile_id: manager.id,
          roles: ["general_manager"],
          active: true,
        },
        {
          organization_id: org.id,
          profile_id: server1.id,
          roles: ["server"],
          active: true,
        },
        {
          organization_id: org.id,
          profile_id: server2.id,
          roles: ["server"],
          active: true,
        },
        {
          organization_id: org.id,
          profile_id: server3.id,
          roles: ["server"],
          active: true,
        },
        {
          organization_id: otherOrg.id,
          profile_id: outsider.id,
          roles: ["owner"],
          active: true,
        },
      ])
      .select("id"),
    "memberships",
  );

  const tablesFor = async (orgId: string, locationId: string) => {
    const area = must(
      await admin
        .from("dining_areas")
        .insert({
          organization_id: orgId,
          location_id: locationId,
          name: "Main",
          area_order: 1,
        })
        .select("id")
        .single(),
      "area",
    );
    const rows = must(
      await admin
        .from("dining_tables")
        .insert(
          TABLE_LABELS.map((label, index) => ({
            organization_id: orgId,
            location_id: locationId,
            dining_area_id: area.id,
            label,
            seat_count: 4,
            sequence: index + 1,
          })),
        )
        .select("id, label"),
      "tables",
    );
    return new Map<string, number>(
      rows.map((row: { label: string; id: number }) => [row.label, row.id]),
    );
  };
  const tablesA = await tablesFor(org.id as string, locA);
  const tablesB = await tablesFor(org.id as string, locB);
  await tablesFor(otherOrg.id as string, otherLoc);

  await Promise.all(
    [owner, manager, server1, server2, server3, outsider].map(signIn),
  );

  const anon = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const orgId = org.id as string;
  const otherOrgId = otherOrg.id as string;

  async function teardown() {
    const orgIds = [orgId, otherOrgId];
    const sessions = await admin
      .from("service_sessions")
      .select("id")
      .in("organization_id", orgIds);
    const sessionIds = (sessions.data ?? []).map((s) => s.id as number);
    if (sessionIds.length > 0) {
      await admin
        .from("board_events")
        .delete()
        .in("service_session_id", sessionIds);
      await admin
        .from("section_assignments")
        .delete()
        .in("service_session_id", sessionIds);
      await admin
        .from("table_rotation_entries")
        .delete()
        .in("service_session_id", sessionIds);
      await admin
        .from("rotation_rounds")
        .delete()
        .in("service_session_id", sessionIds);
      await admin
        .from("rotation_members")
        .delete()
        .in("service_session_id", sessionIds);
      await admin.from("service_sessions").delete().in("id", sessionIds);
    }
    await admin.from("tip_pools").delete().in("organization_id", orgIds);
    await admin.from("dining_tables").delete().in("organization_id", orgIds);
    await admin.from("dining_areas").delete().in("organization_id", orgIds);
    await admin.from("memberships").delete().in("organization_id", orgIds);
    await admin.from("locations").delete().in("organization_id", orgIds);
    await admin.from("organizations").delete().in("id", orgIds);
    const users = [owner, manager, server1, server2, server3, outsider];
    await admin
      .from("profiles")
      .delete()
      .in(
        "id",
        users.map((u) => u.id),
      );
    for (const user of users) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }

  return {
    admin,
    orgId,
    otherOrgId,
    locA,
    locB,
    otherLoc,
    tablesA,
    tablesB,
    owner,
    manager,
    server1,
    server2,
    server3,
    outsider,
    anon,
    teardown,
  };
}

// ---------------------------------------------------------------------
// Board helpers (all go through the real RPC contract the app uses).
// ---------------------------------------------------------------------

export type Rpc = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

export class Board {
  constructor(
    readonly fx: Fixture,
    readonly locationId: string,
    readonly date: string = todayInChicago(),
  ) {}

  sessionId: number | null = null;

  /** Adds a server column as `as` (opens today's board on first call). */
  async addServer(
    as: TestUser,
    server: TestUser,
  ): Promise<{ memberId: number; rpc: Rpc }> {
    const rpc = (await as.client.rpc("board_add_column", {
      p_organization_id: this.fx.orgId,
      p_location_id: this.locationId,
      p_service_date: this.date,
      p_server_profile_id: server.id,
    })) as Rpc;
    if (rpc.error) throw new Error(`addServer: ${rpc.error.message}`);
    await this.refreshSession();
    return { memberId: rpc.data as number, rpc };
  }

  async refreshSession() {
    const row = await this.fx.admin
      .from("service_sessions")
      .select("id")
      .eq("location_id", this.locationId)
      .eq("service_date", this.date)
      .eq("status", "active")
      .maybeSingle();
    this.sessionId = (row.data?.id as number | undefined) ?? null;
    return this.sessionId;
  }

  /** Wipes this location/date's board (service-role; no JWT, so guards skip). */
  async reset() {
    const rows = await this.fx.admin
      .from("service_sessions")
      .select("id")
      .eq("location_id", this.locationId)
      .eq("service_date", this.date);
    const ids = (rows.data ?? []).map((r) => r.id as number);
    if (ids.length > 0) {
      await this.fx.admin
        .from("board_events")
        .delete()
        .in("service_session_id", ids);
      await this.fx.admin
        .from("section_assignments")
        .delete()
        .in("service_session_id", ids);
      await this.fx.admin
        .from("table_rotation_entries")
        .delete()
        .in("service_session_id", ids);
      await this.fx.admin
        .from("rotation_rounds")
        .delete()
        .in("service_session_id", ids);
      await this.fx.admin
        .from("rotation_members")
        .delete()
        .in("service_session_id", ids);
      await this.fx.admin.from("service_sessions").delete().in("id", ids);
    }
    this.sessionId = null;
  }

  get sid(): number {
    if (this.sessionId === null) throw new Error("board not opened");
    return this.sessionId;
  }

  /** Round ids in sequence order. */
  async rounds(): Promise<{ id: number; sequence: number }[]> {
    const rows = await this.fx.admin
      .from("rotation_rounds")
      .select("id, sequence")
      .eq("service_session_id", this.sid)
      .order("sequence");
    return (rows.data ?? []) as { id: number; sequence: number }[];
  }

  /** First round in which `memberId` has no entry. */
  async freeRound(memberId: number): Promise<number> {
    const rounds = await this.rounds();
    const used = await this.fx.admin
      .from("table_rotation_entries")
      .select("rotation_round_id")
      .eq("rotation_member_id", memberId);
    const taken = new Set(
      (used.data ?? []).map((r) => r.rotation_round_id as number),
    );
    const free = rounds.find((round) => !taken.has(round.id));
    if (!free) throw new Error("no free round");
    return free.id;
  }

  async assign(
    as: TestUser,
    memberId: number,
    label: string,
    options: { confirm?: boolean; roundId?: number } = {},
  ): Promise<Rpc> {
    const roundId = options.roundId ?? (await this.freeRound(memberId));
    return (await as.client.rpc("board_assign", {
      p_organization_id: this.fx.orgId,
      p_location_id: this.locationId,
      p_service_date: this.date,
      p_round_id: roundId,
      p_member_id: memberId,
      p_table_label: label,
      p_confirm_transfer: options.confirm ?? false,
    })) as Rpc;
  }

  async rpc(
    as: TestUser,
    name: string,
    args: Record<string, unknown>,
  ): Promise<Rpc> {
    return (await as.client.rpc(name, {
      p_organization_id: this.fx.orgId,
      ...args,
    })) as Rpc;
  }

  /** Entry rows for the session, newest first by id. */
  async entries() {
    const rows = await this.fx.admin
      .from("table_rotation_entries")
      .select(
        "id, rotation_round_id, rotation_member_id, table_label, status, assigned_by, ended_by, ended_at, service_session_id",
      )
      .eq("service_session_id", this.sid)
      .order("id");
    return (rows.data ?? []) as {
      id: number;
      rotation_round_id: number;
      rotation_member_id: number;
      table_label: string | null;
      status: string;
      assigned_by: string;
      ended_by: string | null;
      ended_at: string | null;
      service_session_id: number;
    }[];
  }

  /** Active physical claims: table label -> owning member id. */
  async claims(): Promise<Map<string, number>> {
    const rows = await this.fx.admin
      .from("section_assignments")
      .select(
        "rotation_member_id, dining_tables!section_assignments_dining_table_id_fkey(label)",
      )
      .eq("service_session_id", this.sid)
      .is("released_at", null);
    const out = new Map<string, number>();
    for (const row of rows.data ?? []) {
      const embed = row.dining_tables as unknown as
        | { label: string }
        | { label: string }[];
      const label = Array.isArray(embed) ? embed[0].label : embed.label;
      out.set(label, row.rotation_member_id as number);
    }
    return out;
  }

  /** Active entry labels per member (what Grid shows as ACTIVE). */
  async activeByMember(): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    for (const entry of await this.entries()) {
      if (entry.status !== "active" || !entry.table_label) continue;
      const list = map.get(entry.rotation_member_id) ?? [];
      list.push(entry.table_label);
      map.set(entry.rotation_member_id, list);
    }
    return map;
  }

  async events() {
    const rows = await this.fx.admin
      .from("board_events")
      .select(
        "id, event_type, actor_profile_id, payload, inverse_payload, undone_at",
      )
      .eq("service_session_id", this.sid)
      .order("id");
    return rows.data ?? [];
  }

  async undo(as: TestUser): Promise<Rpc> {
    return this.rpc(as, "board_undo", { p_service_session_id: this.sid });
  }
  async redo(as: TestUser): Promise<Rpc> {
    return this.rpc(as, "board_redo", { p_service_session_id: this.sid });
  }
}

export function sorted(values: string[] | undefined): string[] {
  return [...(values ?? [])].sort((a, b) => Number(a) - Number(b));
}
