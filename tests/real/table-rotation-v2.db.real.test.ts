/**
 * Table Rotation V2 Part 1 -- real-mode database/RPC scenarios (hosted DEV).
 * Scenario ids (Sxx) match PART1_TEST_MATRIX.md; defect ids (D-0x) match the
 * DEV validation report.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  Board,
  createFixture,
  sorted,
  todayInChicago,
  type Fixture,
  type Rpc,
} from "./support/harness";

let fx: Fixture;
let board: Board;
let m1: number;
let m2: number;
let m3: number;

function ok(result: Rpc) {
  expect(result.error?.message, "rpc should succeed").toBeUndefined();
}
function denied(result: Rpc, pattern?: RegExp) {
  expect(result.error, "rpc should be rejected").not.toBeNull();
  if (pattern) expect(result.error!.message).toMatch(pattern);
}

/** Opens a fresh board with servers 1-3 as members m1..m3. */
async function openBoard() {
  await board.reset();
  m1 = (await board.addServer(fx.owner, fx.server1)).memberId;
  m2 = (await board.addServer(fx.owner, fx.server2)).memberId;
  m3 = (await board.addServer(fx.owner, fx.server3)).memberId;
}

beforeAll(async () => {
  fx = await createFixture();
  board = new Board(fx, fx.locA);
});

afterAll(async () => {
  if (fx) await fx.teardown();
});

describe("1B authorization: D-01 cross-actor End", () => {
  beforeEach(openBoard);

  it("S07 manager can End a table the owner assigned", async () => {
    ok(await board.assign(fx.owner, m1, "10"));
    const [entry] = await board.entries();
    ok(
      await board.rpc(fx.manager, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: entry.rotation_round_id,
        p_member_id: m1,
      }),
    );
    const [after] = await board.entries();
    expect(after.status).toBe("ended");
    expect(after.assigned_by).toBe(fx.owner.id); // original attribution kept
    expect(after.ended_by).toBe(fx.manager.id); // closer recorded separately
    expect((await board.claims()).has("10")).toBe(false);
    const events = await board.events();
    const end = events.filter((e) => e.event_type === "end").at(-1)!;
    expect(end.actor_profile_id).toBe(fx.manager.id);
  });

  it("a staff server can also End a table another user assigned (open editing)", async () => {
    ok(await board.assign(fx.manager, m2, "11"));
    const [entry] = await board.entries();
    ok(
      await board.rpc(fx.server1, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: entry.rotation_round_id,
        p_member_id: m2,
      }),
    );
    expect((await board.entries())[0].status).toBe("ended");
  });

  it("cross-actor End + Assign, then Undo and Redo by yet another actor", async () => {
    ok(await board.assign(fx.owner, m1, "12"));
    const [entry] = await board.entries();
    ok(
      await board.rpc(fx.manager, "board_end_and_assign", {
        p_service_session_id: board.sid,
        p_end_round_ids: [entry.rotation_round_id],
        p_member_id: m1,
        p_table_label: "13",
      }),
    );
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["13"]);

    ok(await board.undo(fx.server2)); // a third actor undoes the manager's op
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["12"]);
    expect([...(await board.claims()).keys()]).toEqual(["12"]);

    ok(await board.redo(fx.owner));
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["13"]);
  });

  it("cross-actor Undo/Redo of an End", async () => {
    ok(await board.assign(fx.owner, m1, "14"));
    const [entry] = await board.entries();
    ok(
      await board.rpc(fx.owner, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: entry.rotation_round_id,
        p_member_id: m1,
      }),
    );
    ok(await board.undo(fx.manager));
    expect((await board.entries())[0].status).toBe("active");
    expect((await board.claims()).get("14")).toBe(m1);
    ok(await board.redo(fx.manager));
    expect((await board.entries())[0].status).toBe("ended");
  });
});

describe("1A/1B role boundaries", () => {
  beforeEach(openBoard);

  it("anonymous callers cannot execute any board RPC", async () => {
    const result = await fx.anon.rpc("board_add_row", {
      p_organization_id: fx.orgId,
      p_service_session_id: board.sid,
    });
    denied(result);
  });

  it("a member of another organization is rejected", async () => {
    denied(
      (await fx.outsider.client.rpc("board_add_row", {
        p_organization_id: fx.orgId,
        p_service_session_id: board.sid,
      })) as Rpc,
      /floor team member/i,
    );
    denied(
      (await fx.outsider.client.rpc("board_add_row", {
        p_organization_id: fx.otherOrgId,
        p_service_session_id: board.sid, // right org, but a session of another org
      })) as Rpc,
    );
  });

  it("a deactivated member is rejected (membership, not creator, is authority)", async () => {
    await fx.admin
      .from("memberships")
      .update({ active: false })
      .eq("organization_id", fx.orgId)
      .eq("profile_id", fx.server3.id);
    denied(
      await board.rpc(fx.server3, "board_add_row", {
        p_service_session_id: board.sid,
      }),
      /floor team member/i,
    );
    // The organization creator without an active membership is not an operator either.
    await fx.admin
      .from("memberships")
      .update({ active: false })
      .eq("organization_id", fx.orgId)
      .eq("profile_id", fx.owner.id);
    denied(
      await board.rpc(fx.owner, "board_add_row", {
        p_service_session_id: board.sid,
      }),
      /floor team member/i,
    );
    await fx.admin
      .from("memberships")
      .update({ active: true })
      .eq("organization_id", fx.orgId)
      .in("profile_id", [fx.owner.id, fx.server3.id]);
  });

  it("a staff server cannot open the day (but can join an open floor)", async () => {
    await board.reset();
    const result = await fx.server1.client.rpc("board_add_column", {
      p_organization_id: fx.orgId,
      p_location_id: fx.locA,
      p_service_date: board.date,
      p_server_profile_id: fx.server1.id,
    });
    denied(result as Rpc, /ask a manager or host/i);
    await board.addServer(fx.owner, fx.server2);
    ok(
      (await fx.server1.client.rpc("board_add_column", {
        p_organization_id: fx.orgId,
        p_location_id: fx.locA,
        p_service_date: board.date,
        p_server_profile_id: fx.server1.id,
      })) as Rpc,
    );
  });

  it("a previous day's board can never be opened", async () => {
    const yesterday = todayInChicago(-1);
    for (const date of [yesterday]) {
      const result = await fx.owner.client.rpc("board_add_column", {
        p_organization_id: fx.orgId,
        p_location_id: fx.locB,
        p_service_date: date,
        p_server_profile_id: fx.server1.id,
      });
      denied(result as Rpc);
    }
  });

  it("a location from another organization is rejected", async () => {
    const result = await fx.owner.client.rpc("board_add_column", {
      p_organization_id: fx.orgId,
      p_location_id: fx.otherLoc,
      p_service_date: board.date,
      p_server_profile_id: fx.server1.id,
    });
    denied(result as Rpc, /does not belong/i);
  });
});

describe("1A/1B D-08 board_events + direct-write boundary", () => {
  beforeEach(openBoard);

  it("S24 staff cannot forge, update or delete board_events", async () => {
    const forged = await fx.server1.client.from("board_events").insert({
      organization_id: fx.orgId,
      service_session_id: board.sid,
      actor_profile_id: fx.owner.id, // impersonating the owner
      event_type: "assign",
      payload: {},
      inverse_payload: {},
    });
    expect(forged.error?.code).toBe("42501");

    ok(await board.assign(fx.owner, m1, "3"));
    const events = await board.events();
    const target = events.at(-1)!;
    const updated = await fx.server1.client
      .from("board_events")
      .update({ payload: { tampered: true } })
      .eq("id", target.id)
      .select();
    expect(updated.error?.code).toBe("42501");
    const deleted = await fx.server1.client
      .from("board_events")
      .delete()
      .eq("id", target.id)
      .select();
    expect(deleted.error?.code).toBe("42501");
    // Even the owner's raw client is read-only on the table.
    const ownerUpdate = await fx.owner.client
      .from("board_events")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", target.id)
      .select();
    expect(ownerUpdate.error?.code).toBe("42501");

    const after = (await board.events()).find((e) => e.id === target.id)!;
    expect(after.payload).toEqual(target.payload);
    expect(after.undone_at).toBeNull();
  });

  it("direct DML on the rotation graph and ledger is denied for every authenticated role", async () => {
    ok(await board.assign(fx.owner, m1, "4"));
    const [entry] = await board.entries();
    for (const user of [fx.owner, fx.manager, fx.server1]) {
      const upd = await user.client
        .from("table_rotation_entries")
        .update({ status: "ended" })
        .eq("id", entry.id)
        .select();
      expect(upd.error?.code, "entry update").toBe("42501");
      const ins = await user.client.from("table_rotation_entries").insert({
        organization_id: fx.orgId,
        rotation_round_id: entry.rotation_round_id,
        rotation_member_id: m2,
        table_label: "9",
        assigned_by: user.id,
      });
      expect(ins.error?.code, "entry insert").toBe("42501");
      const del = await user.client
        .from("table_rotation_entries")
        .delete()
        .eq("id", entry.id)
        .select();
      expect(del.error?.code, "entry delete").toBe("42501");
      const sa = await user.client
        .from("section_assignments")
        .delete()
        .eq("organization_id", fx.orgId)
        .select();
      expect(sa.error?.code, "claim delete").toBe("42501");
      const rd = await user.client
        .from("rotation_rounds")
        .delete()
        .eq("id", entry.rotation_round_id)
        .select();
      expect(rd.error?.code, "round delete").toBe("42501");
      const mem = await user.client
        .from("rotation_members")
        .update({ position: 99 })
        .eq("id", m1)
        .select();
      expect(mem.error?.code, "member update").toBe("42501");
      const ses = await user.client
        .from("service_sessions")
        .update({ service_date: todayInChicago(-3) })
        .eq("id", board.sid)
        .select();
      expect(ses.error?.code, "session update").toBe("42501");
    }
    expect((await board.entries())[0].status).toBe("active");
    // ...while reads still work for every role.
    const read = await fx.server2.client
      .from("table_rotation_entries")
      .select("id")
      .eq("service_session_id", board.sid);
    expect(read.error).toBeNull();
    expect((read.data ?? []).length).toBe(1);
  });
});

describe("1A D-02 session integrity", () => {
  let pastSession: number;
  let pastRound: number;
  let pastMember: number;
  let pastEntry: number;

  beforeEach(async () => {
    await openBoard();
    // A past-day board, built with the service role (no JWT => no guards).
    const yesterday = todayInChicago(-1);
    await fx.admin
      .from("service_sessions")
      .delete()
      .eq("location_id", fx.locA)
      .eq("service_date", yesterday);
    const session = await fx.admin
      .from("service_sessions")
      .insert({
        organization_id: fx.orgId,
        location_id: fx.locA,
        service_date: yesterday,
        meal_period: "service",
        status: "active",
      })
      .select("id")
      .single();
    pastSession = session.data!.id as number;
    const round = await fx.admin
      .from("rotation_rounds")
      .insert({
        organization_id: fx.orgId,
        service_session_id: pastSession,
        sequence: 1,
      })
      .select("id")
      .single();
    pastRound = round.data!.id as number;
    const member = await fx.admin
      .from("rotation_members")
      .insert({
        organization_id: fx.orgId,
        service_session_id: pastSession,
        server_profile_id: fx.server1.id,
        position: 0,
      })
      .select("id")
      .single();
    pastMember = member.data!.id as number;
    const entry = await fx.admin
      .from("table_rotation_entries")
      .insert({
        organization_id: fx.orgId,
        rotation_round_id: pastRound,
        rotation_member_id: pastMember,
        table_label: "2",
        assigned_by: fx.owner.id,
      })
      .select("id")
      .single();
    pastEntry = entry.data!.id as number;
  });

  it("S22 a historical board cannot be edited through its own session id", async () => {
    const result = await fx.owner.client.rpc("board_end_table", {
      p_organization_id: fx.orgId,
      p_service_session_id: pastSession,
      p_round_id: pastRound,
      p_member_id: pastMember,
    });
    denied(result as Rpc, /previous day/i);
    const row = await fx.admin
      .from("table_rotation_entries")
      .select("status")
      .eq("id", pastEntry)
      .single();
    expect(row.data!.status).toBe("active");
  });

  it("S23 passing today's session against an old round/member is rejected (every ID-bearing RPC)", async () => {
    const todaySid = board.sid;
    const attacks: [string, Record<string, unknown>][] = [
      [
        "board_end_table",
        {
          p_service_session_id: todaySid,
          p_round_id: pastRound,
          p_member_id: pastMember,
        },
      ],
      [
        "board_clear_cell",
        {
          p_service_session_id: todaySid,
          p_round_id: pastRound,
          p_member_id: pastMember,
        },
      ],
      [
        "board_clear_row",
        { p_service_session_id: todaySid, p_round_id: pastRound },
      ],
      [
        "board_clear_column",
        { p_service_session_id: todaySid, p_member_id: pastMember },
      ],
      [
        "board_delete_row",
        { p_service_session_id: todaySid, p_round_id: pastRound },
      ],
      [
        "board_transfer",
        {
          p_service_session_id: todaySid,
          p_source_round_id: pastRound,
          p_source_member_id: pastMember,
          p_dest_member_id: m2,
        },
      ],
      [
        "board_end_and_assign",
        {
          p_service_session_id: todaySid,
          p_end_round_ids: [pastRound],
          p_member_id: pastMember,
          p_table_label: "5",
        },
      ],
      [
        "board_set_column_status",
        {
          p_service_session_id: todaySid,
          p_member_id: pastMember,
          p_status: "paused",
        },
      ],
      [
        "board_move_column",
        {
          p_service_session_id: todaySid,
          p_member_id: pastMember,
          p_direction: "down",
        },
      ],
    ];
    for (const [name, args] of attacks) {
      const result = await board.rpc(fx.owner, name, args);
      expect(
        result.error,
        `${name} must reject a foreign-session id`,
      ).not.toBeNull();
    }
    // Direct-guard variant: today's date + a past-day round via board_assign.
    denied(
      await board.assign(fx.server1, m1, "10", { roundId: pastRound }),
      /not on this board/i,
    );
    denied(
      await board.assign(fx.owner, pastMember, "10"),
      /not on this board|not active/i,
    );
    // Nothing in the past day changed.
    const row = await fx.admin
      .from("table_rotation_entries")
      .select("status, table_label")
      .eq("id", pastEntry)
      .single();
    expect(row.data).toEqual({ status: "active", table_label: "2" });
    const pastEvents = await fx.admin
      .from("board_events")
      .select("id")
      .eq("service_session_id", pastSession);
    expect((pastEvents.data ?? []).length).toBe(0);
  });

  it("structurally: an entry cannot pair a round and a member from different sessions", async () => {
    // Even the service role (which bypasses RLS and the JWT guards) hits the FK.
    const bad = await fx.admin.from("table_rotation_entries").insert({
      organization_id: fx.orgId,
      rotation_round_id: pastRound,
      rotation_member_id: m2, // today's member
      table_label: "7",
      assigned_by: fx.owner.id,
    });
    expect(bad.error?.code).toBe("23503");
    // ...nor can its session be re-pointed, nor the entry moved.
    const moved = await fx.admin
      .from("table_rotation_entries")
      .update({ rotation_round_id: (await board.rounds())[0].id })
      .eq("id", pastEntry);
    expect(moved.error).not.toBeNull();
    const wrongSession = await fx.admin.from("table_rotation_entries").insert({
      organization_id: fx.orgId,
      rotation_round_id: pastRound,
      rotation_member_id: pastMember,
      service_session_id: board.sid, // lying about the session
      table_label: "8",
      assigned_by: fx.owner.id,
    });
    expect(wrongSession.error).not.toBeNull();
  });

  it("structurally: a physical claim must match its session's location", async () => {
    const wrongLocationTable = fx.tablesB.get("9")!;
    const claim = await fx.admin.from("section_assignments").insert({
      organization_id: fx.orgId,
      service_session_id: board.sid,
      location_id: fx.locA,
      dining_table_id: wrongLocationTable, // a Location B table on a Location A board
      rotation_member_id: m1,
    });
    expect(claim.error?.code).toBe("23503");
  });

  it("S21 a new service session does not inherit yesterday's active state", async () => {
    // Yesterday's table 2 is still ACTIVE in yesterday's session...
    const stillActive = await fx.admin
      .from("section_assignments")
      .select("id")
      .eq("service_session_id", pastSession);
    expect((stillActive.data ?? []).length).toBe(1);
    // ...yet today's board starts clean and table 2 is freely assignable.
    expect((await board.claims()).size).toBe(0);
    ok(await board.assign(fx.owner, m1, "2"));
    expect((await board.claims()).get("2")).toBe(m1);
    // Yesterday's history remained queryable and untouched.
    const past = await fx.admin
      .from("table_rotation_entries")
      .select("status")
      .eq("id", pastEntry)
      .single();
    expect(past.data!.status).toBe("active");
  });

  it("finalized tips lock the board for everyone, even via the right session", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    const pool = await fx.admin.from("tip_pools").insert({
      organization_id: fx.orgId,
      location_id: fx.locA,
      service_date: board.date,
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: fx.owner.id,
    });
    expect(pool.error, "tip pool fixture").toBeNull();
    denied(await board.assign(fx.manager, m2, "7"), /finalized|locked/i);
    denied(
      await board.rpc(fx.owner, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: (await board.entries())[0].rotation_round_id,
        p_member_id: m1,
      }),
      /finalized|locked/i,
    );
    await fx.admin.from("tip_pools").delete().eq("organization_id", fx.orgId);
    ok(await board.assign(fx.manager, m2, "7"));
  });
});

describe("1A single active owner + atomic reassignment", () => {
  beforeEach(openBoard);

  it("S02 a server can own several tables at once", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m1, "5"));
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["1", "5"]);
    const claims = await board.claims();
    expect(claims.get("1")).toBe(m1);
    expect(claims.get("5")).toBe(m1);
  });

  it("S03 B has 15, then A takes 15: B ENDED, A ACTIVE, one claim", async () => {
    ok(await board.assign(fx.owner, m2, "15"));
    // Without explicit confirmation a held table is refused and nothing changes.
    denied(await board.assign(fx.owner, m1, "15"), /already assigned/i);
    expect((await board.activeByMember()).get(m1)).toBeUndefined();

    ok(await board.assign(fx.owner, m1, "15", { confirm: true }));
    const entries = await board.entries();
    const b = entries.find((e) => e.rotation_member_id === m2)!;
    const a = entries.find((e) => e.rotation_member_id === m1)!;
    expect(b.status).toBe("ended"); // history kept, not deleted
    expect(b.table_label).toBe("15");
    expect(a.status).toBe("active");
    const claims = await board.claims();
    expect(claims.get("15")).toBe(m1);
    expect([...claims.keys()]).toEqual(["15"]);
  });

  it("reassigning table 15 does not end the taker's other tables", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m2, "15"));
    ok(await board.assign(fx.owner, m1, "15", { confirm: true }));
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["1", "15"]);
    expect((await board.activeByMember()).get(m2)).toBeUndefined();
  });

  it("S09 rapid reassignment A->10, B->10, C->10 leaves only C active", async () => {
    ok(await board.assign(fx.owner, m1, "10"));
    ok(await board.assign(fx.manager, m2, "10", { confirm: true }));
    ok(await board.assign(fx.owner, m3, "10", { confirm: true }));
    const entries = (await board.entries()).filter(
      (e) => e.table_label === "10",
    );
    expect(entries.map((e) => [e.rotation_member_id, e.status])).toEqual([
      [m1, "ended"],
      [m2, "ended"],
      [m3, "active"],
    ]);
    expect((await board.claims()).get("10")).toBe(m3);
  });

  it("S10 two managers reassign table 15 concurrently: exactly one winner, never two owners", async () => {
    ok(await board.assign(fx.owner, m1, "15"));
    const [r2, r3] = await Promise.all([
      board.assign(fx.owner, m2, "15", { confirm: true }),
      board.assign(fx.manager, m3, "15", { confirm: true }),
    ]);
    ok(r2);
    ok(r3);
    const active = (await board.entries()).filter(
      (e) => e.table_label === "15" && e.status === "active",
    );
    expect(active.length).toBe(1);
    const claims = await board.claims();
    expect(claims.size).toBe(1);
    expect(claims.get("15")).toBe(active[0].rotation_member_id);
    // All three entries remain as history: A ended, loser ended, winner active.
    expect(
      (await board.entries()).filter((e) => e.table_label === "15").length,
    ).toBe(3);
  });

  it("concurrent unconfirmed assignments: one succeeds, the other is rejected", async () => {
    const [r1, r2] = await Promise.all([
      board.assign(fx.owner, m1, "16"),
      board.assign(fx.manager, m2, "16"),
    ]);
    const results = [r1, r2];
    expect(results.filter((r) => r.error === null).length).toBe(1);
    expect(results.filter((r) => r.error !== null).length).toBe(1);
    expect((await board.claims()).size).toBe(1);
  });

  it("combined tables: 5+6 claims both; taking only 5 is refused; taking 5+6 displaces the whole assignment", async () => {
    ok(await board.assign(fx.owner, m1, "5+6"));
    const claims = await board.claims();
    expect(claims.get("5")).toBe(m1);
    expect(claims.get("6")).toBe(m1);
    denied(
      await board.assign(fx.owner, m2, "5", { confirm: true }),
      /combined assignment/i,
    );
    // #157: stored canonically as "5 + 6" whatever spacing was typed.
    expect((await board.activeByMember()).get(m1)).toEqual(["5 + 6"]);
    ok(await board.assign(fx.owner, m2, "5+6", { confirm: true }));
    expect((await board.activeByMember()).get(m2)).toEqual(["5 + 6"]);
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
  });

  it("table numbers are location-scoped: Table 15 can be active at two locations", async () => {
    ok(await board.assign(fx.owner, m1, "15"));
    const other = new Board(fx, fx.locB);
    await other.reset();
    const om = (await other.addServer(fx.owner, fx.server1)).memberId;
    ok(await other.assign(fx.owner, om, "15"));
    expect((await board.claims()).get("15")).toBe(m1);
    expect((await other.claims()).get("15")).toBe(om);
    // Ending one location's 15 never touches the other's.
    const [entry] = await other.entries();
    ok(
      await other.rpc(fx.manager, "board_end_table", {
        p_service_session_id: other.sid,
        p_round_id: entry.rotation_round_id,
        p_member_id: om,
      }),
    );
    expect((await board.claims()).get("15")).toBe(m1);
    expect((await other.claims()).size).toBe(0);
    await other.reset();
  });
});

describe("1B Transfer, Skip, Reorder, Remove", () => {
  beforeEach(openBoard);

  it("S08 Transfer A->8 then 8->B: source kept as history, destination active, valid audit event", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m1, "8"));
    const entries = await board.entries();
    const e8 = entries.find((e) => e.table_label === "8")!;
    ok(
      await board.rpc(fx.manager, "board_transfer", {
        p_service_session_id: board.sid,
        p_source_round_id: e8.rotation_round_id,
        p_source_member_id: m1,
        p_dest_member_id: m2,
      }),
    );
    const after = await board.entries();
    expect(after.find((e) => e.id === e8.id)!.status).toBe("ended");
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["1"]);
    expect((await board.activeByMember()).get(m2)).toEqual(["8"]);
    expect((await board.claims()).get("8")).toBe(m2);
    const ev = (await board.events())
      .filter((e) => e.event_type === "transfer")
      .at(-1)!;
    expect(ev.actor_profile_id).toBe(fx.manager.id);
    expect(ev.payload).toMatchObject({ table_label: "8", dest_member_id: m2 });

    // ...and on to the third server
    const e8b = (await board.entries()).find(
      (e) => e.rotation_member_id === m2 && e.status === "active",
    )!;
    ok(
      await board.rpc(fx.owner, "board_transfer", {
        p_service_session_id: board.sid,
        p_source_round_id: e8b.rotation_round_id,
        p_source_member_id: m2,
        p_dest_member_id: m3,
      }),
    );
    expect((await board.claims()).get("8")).toBe(m3);

    // Undo twice restores the original owner exactly.
    ok(await board.undo(fx.server1));
    expect((await board.claims()).get("8")).toBe(m2);
    ok(await board.undo(fx.server1));
    expect((await board.claims()).get("8")).toBe(m1);
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["1", "8"]);
  });

  it("Transfer to the same server or to an inactive column is rejected", async () => {
    ok(await board.assign(fx.owner, m1, "9"));
    const [entry] = await board.entries();
    denied(
      await board.rpc(fx.owner, "board_transfer", {
        p_service_session_id: board.sid,
        p_source_round_id: entry.rotation_round_id,
        p_source_member_id: m1,
        p_dest_member_id: m1,
      }),
    );
    ok(
      await board.rpc(fx.owner, "board_set_column_status", {
        p_service_session_id: board.sid,
        p_member_id: m2,
        p_status: "paused",
      }),
    );
    denied(
      await board.rpc(fx.owner, "board_transfer", {
        p_service_session_id: board.sid,
        p_source_round_id: entry.rotation_round_id,
        p_source_member_id: m1,
        p_dest_member_id: m2,
      }),
      /not active/i,
    );
  });

  it("S26 Skip does not end the skipped server's existing tables", async () => {
    ok(await board.assign(fx.owner, m2, "11"));
    const rounds = await board.rounds();
    const free = await board.freeRound(m2);
    ok(
      await board.rpc(fx.owner, "board_skip_turn", {
        p_location_id: fx.locA,
        p_service_date: board.date,
        p_round_id: free,
        p_member_id: m2,
      }),
    );
    expect(rounds.length).toBeGreaterThan(0);
    expect((await board.activeByMember()).get(m2)).toEqual(["11"]);
    expect((await board.claims()).get("11")).toBe(m2);
    const skipped = (await board.entries()).filter(
      (e) => e.status === "skipped",
    );
    expect(skipped.length).toBe(1);
  });

  it("S27 Reorder changes rotation order but not ownership", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m2, "2"));
    const before = await fx.admin
      .from("rotation_members")
      .select("id, position")
      .eq("service_session_id", board.sid)
      .order("position");
    ok(
      await board.rpc(fx.owner, "board_move_column", {
        p_service_session_id: board.sid,
        p_member_id: m3,
        p_direction: "up",
      }),
    );
    ok(
      await board.rpc(fx.owner, "board_move_column", {
        p_service_session_id: board.sid,
        p_member_id: m3,
        p_direction: "up",
      }),
    );
    const after = await fx.admin
      .from("rotation_members")
      .select("id, position")
      .eq("service_session_id", board.sid)
      .order("position");
    expect((after.data ?? []).map((r) => r.id)).toEqual([m3, m1, m2]);
    expect((before.data ?? []).map((r) => r.id)).toEqual([m1, m2, m3]);
    expect((await board.claims()).get("1")).toBe(m1);
    expect((await board.claims()).get("2")).toBe(m2);
    ok(await board.undo(fx.owner));
    ok(await board.undo(fx.owner));
    const restored = await fx.admin
      .from("rotation_members")
      .select("id")
      .eq("service_session_id", board.sid)
      .order("position");
    expect((restored.data ?? []).map((r) => r.id)).toEqual([m1, m2, m3]);
  });

  it("S25 a server with active tables cannot be removed; after End they can", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m1, "5"));
    denied(
      await board.rpc(fx.manager, "board_set_column_status", {
        p_service_session_id: board.sid,
        p_member_id: m1,
        p_status: "removed",
      }),
      /active tables/i,
    );
    // Pausing is allowed and leaves ownership alone.
    ok(
      await board.rpc(fx.manager, "board_set_column_status", {
        p_service_session_id: board.sid,
        p_member_id: m1,
        p_status: "paused",
      }),
    );
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["1", "5"]);
    for (const entry of (await board.entries()).filter(
      (e) => e.status === "active",
    )) {
      ok(
        await board.rpc(fx.manager, "board_end_table", {
          p_service_session_id: board.sid,
          p_round_id: entry.rotation_round_id,
          p_member_id: m1,
        }),
      );
    }
    ok(
      await board.rpc(fx.manager, "board_set_column_status", {
        p_service_session_id: board.sid,
        p_member_id: m1,
        p_status: "removed",
      }),
    );
    // Undoing the removal and re-removing round-trips (no active tables to orphan).
    ok(await board.undo(fx.manager));
  });
});

describe("1D Undo / Redo (D-05, D-06)", () => {
  beforeEach(openBoard);

  it("S14/S15 Clear Cell removes only the intended assignment and Undo restores it", async () => {
    ok(await board.assign(fx.owner, m1, "3"));
    ok(await board.assign(fx.owner, m2, "4"));
    const e3 = (await board.entries()).find((e) => e.table_label === "3")!;
    ok(
      await board.rpc(fx.manager, "board_clear_cell", {
        p_service_session_id: board.sid,
        p_round_id: e3.rotation_round_id,
        p_member_id: m1,
      }),
    );
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
    expect((await board.activeByMember()).get(m2)).toEqual(["4"]);
    expect([...(await board.claims()).keys()]).toEqual(["4"]);

    ok(await board.undo(fx.server2));
    expect((await board.activeByMember()).get(m1)).toEqual(["3"]);
    const restored = (await board.entries()).find(
      (e) => e.table_label === "3",
    )!;
    expect(restored.assigned_by).toBe(fx.owner.id); // original attribution preserved
    expect((await board.claims()).get("3")).toBe(m1);
    // The undo stack is not wedged: the next undo reverts the previous event.
    ok(await board.undo(fx.server2));
    expect((await board.activeByMember()).get(m2)).toBeUndefined();

    ok(await board.redo(fx.owner));
    expect((await board.activeByMember()).get(m2)).toEqual(["4"]);
    ok(await board.redo(fx.owner));
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
  });

  it("Clear Cell of an ENDED entry restores it as ended (not active)", async () => {
    ok(await board.assign(fx.owner, m1, "2"));
    const e2 = (await board.entries())[0];
    ok(
      await board.rpc(fx.owner, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: e2.rotation_round_id,
        p_member_id: m1,
      }),
    );
    ok(
      await board.rpc(fx.owner, "board_clear_cell", {
        p_service_session_id: board.sid,
        p_round_id: e2.rotation_round_id,
        p_member_id: m1,
      }),
    );
    ok(await board.undo(fx.owner));
    const restored = (await board.entries())[0];
    expect(restored.status).toBe("ended");
    expect(restored.ended_by).toBe(fx.owner.id);
    expect((await board.claims()).size).toBe(0);
  });

  it("clearing an empty cell is a no-op that does not add an undo step", async () => {
    const before = (await board.events()).length;
    const [round] = await board.rounds();
    ok(
      await board.rpc(fx.owner, "board_clear_cell", {
        p_service_session_id: board.sid,
        p_round_id: round.id,
        p_member_id: m1,
      }),
    );
    expect((await board.events()).length).toBe(before);
  });

  it("S16/S17/S18 Clear Board, Undo (no duplicate sequence), Redo", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m2, "2"));
    ok(await board.assign(fx.owner, m3, "3"));
    const e1 = (await board.entries()).find((e) => e.table_label === "1")!;
    ok(
      await board.rpc(fx.owner, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: e1.rotation_round_id,
        p_member_id: m1,
      }),
    );
    const roundsBefore = await board.rounds();
    const byLabel = (rows: { table_label: string | null; status: string }[]) =>
      rows.map((e) => `${e.table_label}:${e.status}`).sort();
    const entriesBefore = byLabel(await board.entries());

    ok(
      await board.rpc(fx.manager, "board_clear_board", {
        p_service_session_id: board.sid,
      }),
    );
    expect((await board.entries()).length).toBe(0);
    expect((await board.claims()).size).toBe(0);

    ok(await board.undo(fx.server1)); // D-05: previously failed on rotation_rounds.sequence
    const seqs = (await board.rounds()).map((r) => r.sequence);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual(roundsBefore.map((r) => r.sequence));
    expect(byLabel(await board.entries())).toEqual(entriesBefore);
    expect(sorted([...(await board.claims()).keys()])).toEqual(["2", "3"]); // ended table 1 stays released

    ok(await board.redo(fx.server2));
    expect((await board.entries()).length).toBe(0);
    expect((await board.claims()).size).toBe(0);
    // Redo then Undo again is stable.
    ok(await board.undo(fx.server2));
    expect((await board.entries()).length).toBe(entriesBefore.length);
  });

  it("Undo/Redo Clear Row and Clear Column", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m2, "2"));
    ok(await board.assign(fx.owner, m1, "3"));
    const row1 = (await board.entries()).find(
      (e) => e.table_label === "1",
    )!.rotation_round_id;
    ok(
      await board.rpc(fx.owner, "board_clear_row", {
        p_service_session_id: board.sid,
        p_round_id: row1,
      }),
    );
    expect((await board.claims()).has("1")).toBe(false);
    expect((await board.claims()).has("2")).toBe(false); // m2's entry was in the same first round
    ok(await board.undo(fx.owner));
    expect(sorted([...(await board.claims()).keys()])).toEqual(["1", "2", "3"]);
    ok(await board.redo(fx.owner));
    expect((await board.claims()).has("1")).toBe(false);
    ok(await board.undo(fx.owner));

    ok(
      await board.rpc(fx.owner, "board_clear_column", {
        p_service_session_id: board.sid,
        p_member_id: m1,
      }),
    );
    expect(sorted([...(await board.claims()).keys()])).toEqual(["2"]);
    ok(await board.undo(fx.owner));
    expect(sorted([...(await board.claims()).keys()])).toEqual(["1", "2", "3"]);
    ok(await board.redo(fx.owner));
    expect(sorted([...(await board.claims()).keys()])).toEqual(["2"]);
  });

  it("Undo/Redo of an atomic reassign gives the displaced owner their table back", async () => {
    ok(await board.assign(fx.owner, m2, "15"));
    ok(await board.assign(fx.manager, m1, "15", { confirm: true }));
    expect((await board.claims()).get("15")).toBe(m1);
    ok(await board.undo(fx.server3));
    expect((await board.claims()).get("15")).toBe(m2);
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
    expect(
      (await board.entries()).find((e) => e.rotation_member_id === m2)!.status,
    ).toBe("active");
    ok(await board.redo(fx.server3));
    expect((await board.claims()).get("15")).toBe(m1);
    expect(
      (await board.entries()).find((e) => e.rotation_member_id === m2)!.status,
    ).toBe("ended");
  });

  it("Undo/Redo of Skip, Add Row, Delete Row, Pause and Remove", async () => {
    const free = await board.freeRound(m1);
    ok(
      await board.rpc(fx.owner, "board_skip_turn", {
        p_location_id: fx.locA,
        p_service_date: board.date,
        p_round_id: free,
        p_member_id: m1,
      }),
    );
    ok(await board.undo(fx.owner));
    expect((await board.entries()).length).toBe(0);
    ok(await board.redo(fx.owner));
    expect((await board.entries())[0].status).toBe("skipped");

    const added = await board.rpc(fx.owner, "board_add_row", {
      p_service_session_id: board.sid,
    });
    ok(added);
    const roundCount = (await board.rounds()).length;
    ok(await board.undo(fx.owner));
    expect((await board.rounds()).length).toBe(roundCount - 1);
    ok(await board.redo(fx.owner));
    expect((await board.rounds()).length).toBe(roundCount);

    ok(
      await board.rpc(fx.owner, "board_set_column_status", {
        p_service_session_id: board.sid,
        p_member_id: m3,
        p_status: "removed",
      }),
    );
    ok(await board.undo(fx.owner));
    const status = await fx.admin
      .from("rotation_members")
      .select("status")
      .eq("id", m3)
      .single();
    expect(status.data!.status).toBe("active");
    ok(await board.redo(fx.owner));
    const removed = await fx.admin
      .from("rotation_members")
      .select("status")
      .eq("id", m3)
      .single();
    expect(removed.data!.status).toBe("unavailable"); // redo maps the UI "removed" correctly
  });

  it("concurrent Undo calls: one winner, one deterministic loser, state consistent", async () => {
    ok(await board.assign(fx.owner, m1, "1"));
    ok(await board.assign(fx.owner, m2, "2"));
    const [u1, u2] = await Promise.all([
      board.undo(fx.owner),
      board.undo(fx.manager),
    ]);
    expect([u1, u2].filter((r) => r.error === null).length).toBe(2); // serialized: both succeed, each undoing a distinct event
    expect((await board.claims()).size).toBe(0);
    const undone = (await board.events()).filter(
      (e) => e.event_type === "assign" && e.undone_at !== null,
    );
    expect(undone.length).toBe(2);
  });
});

describe("Extended live service scenario (A/B/C)", () => {
  it("A -> 1,15,7; B -> 11; C -> 16,2 with B's old 15 kept as history", async () => {
    await openBoard();
    const A = m1,
      B = m2,
      C = m3;
    // Row 1
    ok(await board.assign(fx.owner, A, "1"));
    ok(await board.assign(fx.owner, B, "15"));
    ok(await board.assign(fx.owner, C, "16"));
    // Row 2: 15 moves B -> A (End B + Assign A), B -> 11, C -> 2
    ok(await board.assign(fx.manager, A, "15", { confirm: true }));
    ok(await board.assign(fx.manager, B, "11"));
    ok(await board.assign(fx.manager, C, "2"));
    // Row 3
    ok(await board.assign(fx.server1, A, "7"));

    const active = await board.activeByMember();
    expect(sorted(active.get(A))).toEqual(["1", "7", "15"]);
    expect(sorted(active.get(B))).toEqual(["11"]);
    expect(sorted(active.get(C))).toEqual(["2", "16"]);

    const claims = await board.claims();
    expect(
      Object.fromEntries(
        [...claims].sort((a, b) => Number(a[0]) - Number(b[0])),
      ),
    ).toEqual({
      "1": A,
      "2": C,
      "7": A,
      "11": B,
      "15": A,
      "16": C,
    });

    // Historical Grid: B's 15 still exists, now ENDED.
    const b15 = (await board.entries()).find(
      (e) => e.rotation_member_id === B && e.table_label === "15",
    )!;
    expect(b15.status).toBe("ended");
    // Per-member Grid history (round order) keeps both 15s.
    const all15 = (await board.entries()).filter((e) => e.table_label === "15");
    expect(all15.map((e) => [e.rotation_member_id, e.status])).toEqual([
      [B, "ended"],
      [A, "active"],
    ]);
  });
});
