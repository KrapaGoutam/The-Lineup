/**
 * V2-005.001 Table Allocation / Rotation Location Scoping
 * Real Supabase Auth JWT verification suite (AL-01 to AL-28).
 *
 * Verifies that:
 * 1. Floor staff can only view and operate Table Allocation data for their active location.
 * 2. Unassigned locations in the same organization refuse floor staff access.
 * 3. Cross-organization access is strictly rejected.
 * 4. Inactive or archived locations refuse operations.
 * 5. Direct PostgREST queries on sessions, tables, and rotation data respect location scoping.
 * 6. Managerial roles (Org Owner, Org GM, Overall roles) maintain canonical cross-location access.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  Board,
  createFixture,
  type Fixture,
  type Rpc,
} from "./support/harness";

let fx: Fixture;
let boardA: Board;
let boardB: Board;
let memberA1: number;
let memberB1: number;

function ok(result: Rpc) {
  expect(result.error?.message, "rpc should succeed").toBeUndefined();
}

function denied(result: Rpc, pattern?: RegExp) {
  expect(result.error, "rpc should be rejected").not.toBeNull();
  if (pattern) {
    expect(result.error!.message).toMatch(pattern);
  }
}

beforeAll(async () => {
  fx = await createFixture();
  boardA = new Board(fx, fx.locA);
  boardB = new Board(fx, fx.locB);
});

afterAll(async () => {
  if (fx) {
    await fx.teardown();
  }
});

beforeEach(async () => {
  await boardA.reset();
  await boardB.reset();
  // Location A: server1 assigned and added as column
  memberA1 = (await boardA.addServer(fx.owner, fx.server1)).memberId;
});

describe("AL-01..AL-08 Positive Access: Authorized Staff and Managerial Hierarchy", () => {
  it("AL-01 & AL-02: Authorized server can read and operate Location A board", async () => {
    // server1 assigns table 10 to themselves on Location A
    ok(await boardA.assign(fx.server1, memberA1, "10"));

    const entries = await boardA.entries();
    expect(entries.length).toBeGreaterThan(0);
    const [entry] = entries;
    expect(entry.table_label).toBe("10");
    expect(entry.status).toBe("active");

    // PostgREST read: server1 can query service_sessions for Location A
    const { data: sessions, error } = await fx.server1.client
      .from("service_sessions")
      .select("id, location_id")
      .eq("id", boardA.sid!);
    expect(error).toBeNull();
    expect(sessions?.length).toBe(1);
    expect(sessions?.[0].location_id).toBe(fx.locA);
  });

  it("AL-03 & AL-28: Org Owner and GM can operate across multiple locations without location_memberships", async () => {
    // Owner can add a server and assign on Location B (where server1 is not assigned, but owner has canonical authority)
    // First, give server2 assignment to locB so they are eligible on locB
    await fx.admin.from("location_memberships").insert({
      organization_id: fx.orgId,
      location_id: fx.locB,
      profile_id: fx.server2.id,
      active: true,
    });

    try {
      const added = await boardB.addServer(fx.manager, fx.server2);
      expect(added.memberId).toBeGreaterThan(0);
      memberB1 = added.memberId;

      // Owner can assign on Location B
      ok(await boardB.assign(fx.owner, memberB1, "1"));
      // Manager can end table on Location B
      const entries = await boardB.entries();
      const [entry] = entries;
      ok(
        await boardB.rpc(fx.manager, "board_end_table", {
          p_service_session_id: boardB.sid,
          p_round_id: entry.rotation_round_id,
          p_member_id: memberB1,
        }),
      );
    } finally {
      await fx.admin
        .from("location_memberships")
        .delete()
        .eq("location_id", fx.locB)
        .eq("profile_id", fx.server2.id);
    }
  });

  it("AL-08: Undo and redo work within authorized location", async () => {
    ok(await boardA.assign(fx.owner, memberA1, "15"));
    expect((await boardA.claims()).get("15")).toBe(memberA1);

    ok(await boardA.undo(fx.server1));
    expect((await boardA.claims()).has("15")).toBe(false);

    ok(await boardA.redo(fx.server1));
    expect((await boardA.claims()).get("15")).toBe(memberA1);
  });
});

describe("AL-09..AL-22 Security Denials & Boundary Enforcement", () => {
  it("AL-10: Foreign organization user cannot operate or read Location A", async () => {
    // outsider is owner of otherOrg
    const rpcResult = (await fx.outsider.client.rpc("board_add_column", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locA,
      p_service_date: boardA.date,
      p_server_profile_id: fx.outsider.id,
    })) as Rpc;
    denied(rpcResult);

    // PostgREST: outsider sees 0 sessions
    const { data: sessions } = await fx.outsider.client
      .from("service_sessions")
      .select("id")
      .eq("location_id", fx.locA);
    expect(sessions?.length ?? 0).toBe(0);
  });

  it("AL-11 & AL-23: Server assigned to Location A cannot add column or operate Location B", async () => {
    // server1 has no assignment to Location B
    const rpcResult = (await fx.server1.client.rpc("board_add_column", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locB,
      p_service_date: boardB.date,
      p_server_profile_id: fx.server1.id,
    })) as Rpc;
    denied(rpcResult);
  });

  it("AL-24 & AL-26: Server assigned to Location A cannot read Location B data via PostgREST", async () => {
    // Ensure Location B has a session created by manager
    // Temporarily give server2 assignment to locB
    await fx.admin.from("location_memberships").insert({
      organization_id: fx.orgId,
      location_id: fx.locB,
      profile_id: fx.server2.id,
      active: true,
    });

    try {
      await boardB.addServer(fx.manager, fx.server2);

      // server1 queries Location B's sessions -> 0 rows
      const { data: sessions } = await fx.server1.client
        .from("service_sessions")
        .select("id")
        .eq("location_id", fx.locB);
      expect(sessions?.length ?? 0).toBe(0);

      // server1 queries Location B's dining tables -> 0 rows
      const { data: tables } = await fx.server1.client
        .from("dining_tables")
        .select("id")
        .eq("location_id", fx.locB);
      expect(tables?.length ?? 0).toBe(0);

      // server1 queries Location B's rotation members -> 0 rows
      const { data: members } = await fx.server1.client
        .from("rotation_members")
        .select("id")
        .eq("service_session_id", boardB.sid!);
      expect(members?.length ?? 0).toBe(0);
    } finally {
      await fx.admin
        .from("location_memberships")
        .delete()
        .eq("location_id", fx.locB)
        .eq("profile_id", fx.server2.id);
    }
  });

  it("AL-12: Revoked assignment (active = false) immediately loses access to Location A", async () => {
    // Deactivate server1's location assignment
    await fx.admin
      .from("location_memberships")
      .update({ active: false })
      .eq("location_id", fx.locA)
      .eq("profile_id", fx.server1.id);

    try {
      // server1 attempts to assign table on Location A -> denied
      const rpcResult = (await fx.server1.client.rpc("board_assign_table", {
        p_service_session_id: boardA.sid,
        p_member_id: memberA1,
        p_table_label: "11",
      })) as Rpc;
      denied(rpcResult);

      // server1 reads Location A service_sessions -> 0 rows
      const { data: sessions } = await fx.server1.client
        .from("service_sessions")
        .select("id")
        .eq("location_id", fx.locA);
      expect(sessions?.length ?? 0).toBe(0);
    } finally {
      // Re-enable server1 assignment for subsequent tests
      await fx.admin
        .from("location_memberships")
        .update({ active: true })
        .eq("location_id", fx.locA)
        .eq("profile_id", fx.server1.id);
    }
  });

  it("AL-14: Inactive location cannot be operated", async () => {
    // Mark Location A inactive
    await fx.admin
      .from("locations")
      .update({ active: false })
      .eq("id", fx.locA);

    try {
      const rpcResult = (await fx.server1.client.rpc("board_assign_table", {
        p_service_session_id: boardA.sid,
        p_member_id: memberA1,
        p_table_label: "12",
      })) as Rpc;
      denied(rpcResult);
    } finally {
      await fx.admin
        .from("locations")
        .update({ active: true })
        .eq("id", fx.locA);
    }
  });

  it("AL-15: Archived location cannot be operated", async () => {
    // Mark Location A archived
    await fx.admin
      .from("locations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", fx.locA);

    try {
      const rpcResult = (await fx.server1.client.rpc("board_assign_table", {
        p_service_session_id: boardA.sid,
        p_member_id: memberA1,
        p_table_label: "12",
      })) as Rpc;
      denied(rpcResult);
    } finally {
      await fx.admin
        .from("locations")
        .update({ archived_at: null })
        .eq("id", fx.locA);
    }
  });

  it("AL-16 & AL-25: Direct mutation with mismatched session ID is denied", async () => {
    // Create session in Location B
    await fx.admin.from("location_memberships").insert({
      organization_id: fx.orgId,
      location_id: fx.locB,
      profile_id: fx.server2.id,
      active: true,
    });

    try {
      await boardB.addServer(fx.manager, fx.server2);

      // server1 calls board_assign_table on Location B's session ID -> rejected
      const rpcResult = (await fx.server1.client.rpc("board_assign_table", {
        p_service_session_id: boardB.sid,
        p_member_id: memberA1,
        p_table_label: "5",
      })) as Rpc;
      denied(rpcResult);
    } finally {
      await fx.admin
        .from("location_memberships")
        .delete()
        .eq("location_id", fx.locB)
        .eq("profile_id", fx.server2.id);
    }
  });
});
