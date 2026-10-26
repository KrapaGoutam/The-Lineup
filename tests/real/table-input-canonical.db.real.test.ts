/**
 * Canonical table input resolution (#157) -- hosted DEV, real RPC contract.
 * The fixture registers numeric tables "1".."20" (exact label wins) and the
 * T-prefixed tables T31, T32, T33 (typing "31" must become T31). Every case
 * goes through the same public RPCs a stale browser or a direct caller would
 * use, so it proves the resolution is server-authoritative, not a Grid-only
 * transformation. Scenario ids match
 * docs/features/table-input-canonical-resolution/TEST_MATRIX.md.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  Board,
  createFixture,
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
const sort = (values: string[] | undefined) => [...(values ?? [])].sort();

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

describe("CR-01 numeric shorthand is the registered table", () => {
  it('typing "31" stores T31, claims the physical table and logs T31 (never a free-text "31")', async () => {
    ok(await board.assign(fx.owner, m1, "31"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
    expect((await board.claims()).get("T31")).toBe(m1);
    expect((await board.entries()).some((e) => e.table_label === "31")).toBe(
      false,
    );
    const assign = (await board.events()).filter(
      (e) => e.event_type === "assign",
    );
    expect(assign.at(-1)!.payload.table_label).toBe("T31");
  });

  it('typing "T31" converges to the identical state', async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
    expect((await board.claims()).get("T31")).toBe(m1);
  });

  it("an exact registered numeric label wins over the T-prefixed shorthand (6 stays 6)", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["6"]);
    expect((await board.claims()).get("6")).toBe(m1);
  });

  it('"99" with no T99 stays free text: stored as typed, no physical claim', async () => {
    ok(await board.assign(fx.owner, m1, "99"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["99"]);
    expect((await board.claims()).size).toBe(0);
  });

  it('"031" is never collapsed to T31: with no T031 it stays free text', async () => {
    ok(await board.assign(fx.owner, m1, "031"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["031"]);
    expect((await board.claims()).size).toBe(0);
  });

  it("Undo frees the table and Redo re-claims it, both on the canonical label", async () => {
    ok(await board.assign(fx.owner, m1, "31"));
    ok(await board.undo(fx.server3));
    expect((await board.claims()).size).toBe(0);
    ok(await board.redo(fx.server3));
    expect((await board.claims()).get("T31")).toBe(m1);
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
  });
});

describe("CR-02 conflicts resolve on the canonical identity (stale client / direct RPC)", () => {
  it('B typing "31" while A holds T31: PT409 held, naming the canonical table; nothing is written', async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    const detail = conflict(await board.assign(fx.manager, m2, "31"));
    expect(detail.kind).toBe("held");
    expect(detail.label).toBe("T31");
    expect(detail.holders).toEqual([
      expect.objectContaining({ member_id: m1, assignment_label: "T31" }),
    ]);
    expect((await board.activeByMember()).get(m2)).toBeUndefined();
    expect((await board.claims()).get("T31")).toBe(m1);
  });

  it('A typing "31" for the T31 A already holds: same_server, no duplicate, no mutation', async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    const before = (await board.events()).length;
    const detail = conflict(await board.assign(fx.owner, m1, "31"));
    expect(detail.kind).toBe("same_server");
    expect(detail.label).toBe("T31");
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
    expect((await board.events()).length).toBe(before);
  });

  it('End + Assign using "31": the holder is ENDED (history kept), the requester is ACTIVE on T31, atomically', async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    ok(await board.assign(fx.manager, m2, "31", { confirm: true }));
    const rows = (await board.entries()).filter((e) => e.table_label === "T31");
    expect(rows.map((e) => [e.rotation_member_id, e.status]).sort()).toEqual(
      [
        [m1, "ended"],
        [m2, "active"],
      ].sort(),
    );
    expect((await board.entries()).some((e) => e.table_label === "31")).toBe(
      false,
    );
    expect((await board.claims()).get("T31")).toBe(m2);
    ok(await board.undo(fx.server3));
    expect((await board.claims()).get("T31")).toBe(m1);
  });

  it("Transfer after the shorthand conflict uses the existing trusted board_transfer and moves the assignment", async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    const detail = conflict(await board.assign(fx.manager, m2, "31"));
    const holder = detail.holders[0];
    ok(
      await board.rpc(fx.manager, "board_transfer", {
        p_service_session_id: board.sid,
        p_source_round_id: holder.round_id,
        p_source_member_id: holder.member_id,
        p_dest_member_id: m2,
      }),
    );
    expect((await board.claims()).get("T31")).toBe(m2);
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
  });

  it('direct board_end_and_assign stores the canonical label ("32" -> T32)', async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    const e = (await board.entries()).find((x) => x.table_label === "T31")!;
    ok(
      await board.rpc(fx.owner, "board_end_and_assign", {
        p_service_session_id: board.sid,
        p_end_round_ids: [e.rotation_round_id],
        p_member_id: m1,
        p_table_label: "32",
      }),
    );
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T32"]);
    expect((await board.claims()).get("T32")).toBe(m1);
    expect((await board.claims()).has("T31")).toBe(false);
  });
});

describe("CR-03 combined assignments", () => {
  it('"31 + 32" is stored as "T31 + T32" and claims both tables', async () => {
    ok(await board.assign(fx.owner, m1, "31 + 32"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31 + T32"]);
    const claims = await board.claims();
    expect(claims.get("T31")).toBe(m1);
    expect(claims.get("T32")).toBe(m1);
  });

  it('"31 + Patio A" is T31 (physical) plus free text', async () => {
    ok(await board.assign(fx.owner, m1, "31 + Patio A"));
    expect(sort((await board.activeByMember()).get(m1))).toEqual([
      "T31 + Patio A",
    ]);
    const claims = await board.claims();
    expect(claims.size).toBe(1);
    expect(claims.get("T31")).toBe(m1);
  });

  it("B typing 32 against A's T31 + T32: the conflict reports the WHOLE assignment; End + Assign needs the whole-assignment flag and ends it as a whole", async () => {
    ok(await board.assign(fx.owner, m1, "T31 + T32"));
    const detail = conflict(await board.assign(fx.manager, m2, "32"));
    expect(detail.label).toBe("T32");
    expect(detail.holders[0].assignment_label).toBe("T31 + T32");

    const refused = await board.assign(fx.manager, m2, "32", {
      confirm: true,
    });
    expect(refused.error?.message).toMatch(/combined assignment/i);
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31 + T32"]);

    ok(
      await board.assign(fx.manager, m2, "32", {
        confirm: true,
        endWhole: true,
      }),
    );
    expect((await board.activeByMember()).get(m1)).toBeUndefined();
    expect(sort((await board.activeByMember()).get(m2))).toEqual(["T32"]);
    const claims = await board.claims();
    expect(claims.get("T32")).toBe(m2);
    expect(claims.has("T31")).toBe(false);
  });
});

describe("CR-04 simultaneous shorthand and canonical claims", () => {
  it('"31" and "T31" asked at the same time: exactly one winner, one deterministic conflict, one active claim', async () => {
    const [a, b] = await Promise.all([
      board.assign(fx.owner, m1, "31"),
      board.assign(fx.manager, m2, "T31"),
    ]);
    expect([a, b].filter((r) => r.error === null)).toHaveLength(1);
    const loser = [a, b].find((r) => r.error !== null)!;
    expect(loser.error!.code).toBe("PT409");
    expect(
      (await board.entries()).filter(
        (e) => e.table_label === "T31" && e.status === "active",
      ),
    ).toHaveLength(1);
    expect((await board.entries()).some((e) => e.table_label === "31")).toBe(
      false,
    );
  });

  it("every operating role gets the same canonical decision from the same RPC", async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    for (const user of [fx.owner, fx.manager, fx.server2]) {
      const detail = conflict(await board.assign(user, m3, "31"));
      expect(detail.kind).toBe("held");
      expect(detail.label).toBe("T31");
    }
  });
});
