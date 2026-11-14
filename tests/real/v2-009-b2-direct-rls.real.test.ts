import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Board,
  createFixture,
  env,
  type Fixture,
  type TestUser,
} from "./support/harness";

type Tier = "owner" | "manager" | "assistant_manager";
type RowId = { id: number };

let fx: Fixture;
let floorA: RowId;
let floorB: RowId;
let seatingA: RowId;
let seatingB: RowId;
let bDate: string;
const overall = new Map<Tier, TestUser>();

async function insertRow(
  table: "floor_templates" | "seatings",
  row: Record<string, unknown>,
): Promise<RowId> {
  const result = await fx.admin.from(table).insert(row).select("id").single();
  expect(result.error).toBeNull();
  return result.data as RowId;
}

async function readIds(
  user: TestUser,
  table:
    | "floor_templates"
    | "seatings"
    | "seating_tables"
    | "location_memberships",
  column: string,
  value: string | number,
) {
  const result = await user.client.from(table).select("*").eq(column, value);
  expect(result.error, table).toBeNull();
  return result.data ?? [];
}

beforeAll(async () => {
  if (process.env.LINEUP_REAL_LOCAL !== "1") {
    throw new Error("B2 real-JWT test requires verified disposable-local mode");
  }
  fx = await createFixture();
  const a = new Board(fx, fx.locA);
  const b = new Board(fx, fx.locB);
  bDate = b.date;
  await a.addServer(fx.owner, fx.server1);
  await b.addServer(fx.owner, fx.manager);

  floorA = await insertRow("floor_templates", {
    organization_id: fx.orgId,
    location_id: fx.locA,
    name: "B2 A floor",
    meal_period: "service",
    server_count: 2,
  });
  floorB = await insertRow("floor_templates", {
    organization_id: fx.orgId,
    location_id: fx.locB,
    name: "B2 B floor",
    meal_period: "service",
    server_count: 2,
  });
  seatingA = await insertRow("seatings", {
    organization_id: fx.orgId,
    location_id: fx.locA,
    service_session_id: a.sid,
    server_profile_id: fx.server1.id,
    party_size: 2,
    decided_by: fx.owner.id,
    idempotency_key: crypto.randomUUID(),
  });
  seatingB = await insertRow("seatings", {
    organization_id: fx.orgId,
    location_id: fx.locB,
    service_session_id: b.sid,
    server_profile_id: fx.manager.id,
    party_size: 2,
    decided_by: fx.owner.id,
    idempotency_key: crypto.randomUUID(),
  });
  expect(
    (
      await fx.admin.from("seating_tables").insert([
        {
          organization_id: fx.orgId,
          seating_id: seatingA.id,
          dining_table_id: fx.tablesA.get("1"),
        },
        {
          organization_id: fx.orgId,
          seating_id: seatingB.id,
          dining_table_id: fx.tablesB.get("1"),
        },
      ])
    ).error,
  ).toBeNull();

  // Manager retains organization administration but loses B operational scope.
  expect(
    (
      await fx.admin
        .from("location_memberships")
        .delete()
        .eq("location_id", fx.locB)
        .eq("profile_id", fx.manager.id)
    ).error,
  ).toBeNull();

  for (const role of ["assistant_manager", "manager", "owner"] as const) {
    const email = `b2-overall-${crypto.randomUUID()}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const created = await fx.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    expect(
      (
        await fx.admin
          .from("profiles")
          .insert({ id, display_name: `B2 Overall ${role}` })
      ).error,
    ).toBeNull();
    expect(
      (await fx.admin.from("overall_roles").insert({ profile_id: id, role }))
        .error,
    ).toBeNull();
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(
      (await client.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    overall.set(role, { id, name: role, email, password, client });
  }
});

afterAll(async () => {
  if (!fx) return;
  if (seatingA && seatingB) {
    await fx.admin
      .from("seating_tables")
      .delete()
      .in("seating_id", [seatingA.id, seatingB.id]);
    await fx.admin
      .from("seatings")
      .delete()
      .in("id", [seatingA.id, seatingB.id]);
  }
  if (floorA && floorB) {
    await fx.admin
      .from("floor_templates")
      .delete()
      .in("id", [floorA.id, floorB.id]);
  }
  await fx.teardown();
  for (const user of overall.values()) {
    expect(
      (await fx.admin.from("overall_roles").delete().eq("profile_id", user.id))
        .error,
    ).toBeNull();
    expect(
      (await fx.admin.from("profiles").delete().eq("id", user.id)).error,
    ).toBeNull();
    expect((await fx.admin.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
  expect(
    (
      await fx.admin
        .from("organizations")
        .select("id")
        .in("id", [fx.orgId, fx.otherOrgId])
    ).data,
  ).toEqual([]);
});

describe("V2-009 B2 direct-table access with real local JWTs", () => {
  it("denies anon database grants through PostgREST", async () => {
    const result = await fx.anon.from("location_memberships").select("id");
    expect(result.error?.code).toBe("42501");
    expect(result.data).toBeNull();
  });

  it("keeps A-only staff in A and an unassigned GM out of B operations", async () => {
    expect(
      await readIds(fx.server1, "floor_templates", "id", floorA.id),
    ).toHaveLength(1);
    expect(
      await readIds(fx.server1, "floor_templates", "id", floorB.id),
    ).toHaveLength(0);
    expect(
      await readIds(fx.server1, "seatings", "id", seatingA.id),
    ).toHaveLength(1);
    expect(
      await readIds(fx.server1, "seatings", "id", seatingB.id),
    ).toHaveLength(0);
    expect(
      await readIds(fx.server1, "seating_tables", "seating_id", seatingA.id),
    ).toHaveLength(1);
    expect(
      await readIds(fx.server1, "seating_tables", "seating_id", seatingB.id),
    ).toHaveLength(0);
    expect(
      await readIds(fx.server1, "location_memberships", "location_id", fx.locB),
    ).toHaveLength(0);

    expect(
      await readIds(fx.manager, "floor_templates", "id", floorB.id),
    ).toHaveLength(0);
    expect(
      await readIds(fx.manager, "location_memberships", "location_id", fx.locB),
    ).toHaveLength(1);
    const before = await fx.admin
      .from("floor_templates")
      .select("name")
      .eq("id", floorB.id)
      .single();
    const denied = await fx.manager.client
      .from("floor_templates")
      .update({ name: "cross-location write" })
      .eq("id", floorB.id)
      .select("id");
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual([]);
    const after = await fx.admin
      .from("floor_templates")
      .select("name")
      .eq("id", floorB.id)
      .single();
    expect(after.data).toEqual(before.data);
    const rpc = await fx.manager.client.rpc("board_add_column", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locB,
      p_service_date: bDate,
      p_server_profile_id: fx.manager.id,
    });
    expect(rpc.error?.code).toBe("42501");
  });

  it.each(["assistant_manager", "manager", "owner"] as const)(
    "aligns Overall %s reads without direct writes",
    async (role) => {
      const user = overall.get(role)!;
      expect(
        await readIds(user, "floor_templates", "id", floorB.id),
      ).toHaveLength(1);
      expect(await readIds(user, "seatings", "id", seatingB.id)).toHaveLength(
        1,
      );
      expect(
        await readIds(user, "seating_tables", "seating_id", seatingB.id),
      ).toHaveLength(1);
      const write = await user.client
        .from("floor_templates")
        .update({ name: "unapproved Overall write" })
        .eq("id", floorB.id)
        .select("id");
      expect(write.error).toBeNull();
      expect(write.data).toEqual([]);
    },
  );
});
