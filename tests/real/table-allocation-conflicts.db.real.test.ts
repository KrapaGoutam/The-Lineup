/**
 * Table Allocation cross-view integrity (X2/X5) -- hosted DEV, real RPC
 * contract: server-authoritative occupied-table conflicts (PT409), same-server
 * duplicates, atomic whole-assignment End + Assign, free-text ("off-map")
 * labels, and simultaneous mutations. Scenario ids match
 * docs/features/table-allocation-cross-view-integrity/TEST_MATRIX.md.
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
function conflict(result: Rpc) {
  expect(result.error, "rpc should be rejected").not.toBeNull();
  expect(result.error!.code).toBe("PT409");
  return JSON.parse(result.error!.details ?? "{}") as {
    kind: string;
    label: string;
    holders: {
      member_id: number;
      round_id: number;
      assignment_label: string;
    }[];
  };
}

beforeAll(async () => {
  fx = await createFixture();
  board = new Board(fx, fx.locA);
});
afterAll(async () => {
  if (fx) await fx.teardown();
});
beforeEach(async () => {
  await board.reset();
  m1 = (await board.addServer(fx.owner, fx.server1)).memberId;
  m2 = (await board.addServer(fx.owner, fx.server2)).memberId;
  m3 = (await board.addServer(fx.owner, fx.server3)).memberId;
});

describe("XM-024 stale client double-claim", () => {
  it("a stale non-confirmed assign gets a structured PT409 naming the holder; nothing is written", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    const detail = conflict(await board.assign(fx.manager, m2, "6"));
    expect(detail.kind).toBe("held");
    expect(detail.holders).toEqual([
      expect.objectContaining({ member_id: m1, assignment_label: "6" }),
    ]);
    expect((await board.activeByMember()).get(m2)).toBeUndefined();
    expect((await board.claims()).get("6")).toBe(m1);
  });

  it("the same server asking for its own table again is rejected as same_server (no duplicate)", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    const detail = conflict(await board.assign(fx.owner, m1, "6"));
    expect(detail.kind).toBe("same_server");
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["6"]);
    // Confirming cannot bypass it.
    const again = await board.assign(fx.owner, m1, "6", {
      confirm: true,
      endWhole: true,
    });
    expect(again.error?.code).toBe("PT409");
  });
});

describe("XM-022 End + Assign (one atomic call)", () => {
  it("ends the holder (history kept) and gives the table to the requester; Undo/Redo replay it", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    ok(await board.assign(fx.manager, m2, "6", { confirm: true }));
    const entries = (await board.entries()).filter(
      (e) => e.table_label === "6",
    );
    expect(entries.map((e) => [e.rotation_member_id, e.status]).sort()).toEqual(
      [
        [m1, "ended"],
        [m2, "active"],
      ].sort(),
    );
    expect((await board.claims()).get("6")).toBe(m2);

    ok(await board.undo(fx.server3));
    expect((await board.claims()).get("6")).toBe(m1);
    ok(await board.redo(fx.server3));
    expect((await board.claims()).get("6")).toBe(m2);
  });

  it("XM-041 a combined holder is ended as a WHOLE only with the explicit flag; only the wanted table is assigned", async () => {
    ok(await board.assign(fx.owner, m1, "4+5"));
    // Refused without the flag (existing safety).
    const refused = await board.assign(fx.manager, m2, "4", { confirm: true });
    expect(refused.error?.message).toMatch(/combined assignment/i);
    expect(sorted((await board.activeByMember()).get(m1))).toEqual(["4+5"]);

    ok(
      await board.assign(fx.manager, m2, "4", {
        confirm: true,
        endWhole: true,
      }),
    );
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
    expect(sorted((await board.activeByMember()).get(m2))).toEqual(["4"]);
    const claims = await board.claims();
    expect(claims.get("4")).toBe(m2);
    expect(claims.has("5")).toBe(false); // released with the old assignment

    ok(await board.undo(fx.owner));
    const restored = await board.claims();
    expect(restored.get("4")).toBe(m1);
    expect(restored.get("5")).toBe(m1);
    expect((await board.activeByMember()).get(m2)).toBeUndefined();
  });
});

describe("off-map: free-text labels are guarded like registered tables", () => {
  it('a label with no dining_tables row ("99") cannot be double-held; End + Assign works', async () => {
    ok(await board.assign(fx.owner, m1, "99"));
    const detail = conflict(await board.assign(fx.manager, m2, "99"));
    expect(detail.holders[0].member_id).toBe(m1);
    expect((await board.claims()).size).toBe(0); // no physical claim exists

    ok(await board.assign(fx.manager, m2, "99", { confirm: true }));
    const active = (await board.entries()).filter(
      (e) => e.table_label === "99" && e.status === "active",
    );
    expect(active.map((e) => e.rotation_member_id)).toEqual([m2]);
  });

  it('"1" and "T1"-style labels are distinct tables: holding one never blocks the other', async () => {
    ok(await board.assign(fx.owner, m1, "1")); // a registered numeric table
    ok(await board.assign(fx.owner, m2, "T1")); // free text, a different table
    expect((await board.claims()).get("1")).toBe(m1);
    expect((await board.claims()).has("T1")).toBe(false);
    expect(sorted((await board.activeByMember()).get(m2))).toEqual(["T1"]);
  });

  it("XM-025 simultaneous assign of one free-text label: exactly one winner, one deterministic conflict", async () => {
    const [a, b] = await Promise.all([
      board.assign(fx.owner, m1, "98"),
      board.assign(fx.manager, m2, "98"),
    ]);
    expect([a, b].filter((r) => r.error === null)).toHaveLength(1);
    const loser = [a, b].find((r) => r.error !== null)!;
    expect(loser.error!.code).toBe("PT409");
    expect(
      (await board.entries()).filter(
        (e) => e.table_label === "98" && e.status === "active",
      ),
    ).toHaveLength(1);
  });

  it("XM-025 simultaneous End + Assign by two requesters: one active owner, no corruption", async () => {
    ok(await board.assign(fx.owner, m1, "97"));
    const [a, b] = await Promise.all([
      board.assign(fx.owner, m2, "97", { confirm: true, endWhole: true }),
      board.assign(fx.manager, m3, "97", { confirm: true, endWhole: true }),
    ]);
    ok(a);
    ok(b);
    const rows = (await board.entries()).filter((e) => e.table_label === "97");
    expect(rows.filter((e) => e.status === "active")).toHaveLength(1);
    expect(rows).toHaveLength(3); // holder + loser kept as history, winner active
  });
});

describe("permission parity", () => {
  it("every operating role gets the same decision from the same RPC", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    for (const user of [fx.owner, fx.manager, fx.server2]) {
      const detail = conflict(await board.assign(user, m3, "6"));
      expect(detail.kind).toBe("held");
    }
    ok(await board.assign(fx.server2, m3, "6", { confirm: true }));
    expect((await board.claims()).get("6")).toBe(m3);
  });
});

describe("XM-080 service day", () => {
  it("two writers opening the same (future) service date at once create exactly one session", async () => {
    const day = new Board(fx, fx.locA, todayInChicago(2));
    await day.reset();
    const [a, b] = await Promise.all([
      day.addServer(fx.owner, fx.server1),
      day.addServer(fx.manager, fx.server2),
    ]);
    expect(a.memberId).toBeGreaterThan(0);
    expect(b.memberId).toBeGreaterThan(0);
    const sessions = await fx.admin
      .from("service_sessions")
      .select("id")
      .eq("location_id", fx.locA)
      .eq("service_date", todayInChicago(2));
    expect(sessions.data).toHaveLength(1);
    await day.reset();
  });
});
