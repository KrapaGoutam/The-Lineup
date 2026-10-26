/**
 * Same-server repeat table (#166) -- hosted DEV, real RPC contract. The same
 * server reaching a LATER turn that is given a table it already holds must get
 * a structured same_server_repeat, and only the explicit
 * board_end_previous_and_assign mutates (atomically). The turn is the board
 * cell; the database decides. Fixture tables: numeric "1".."20" (exact label
 * wins) and T31..T33 ("31" must become T31). Scenario ids match
 * docs/features/same-server-repeat-table/TEST_MATRIX.md.
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

async function statusAt(roundId: number, memberId: number) {
  return (await board.entries()).find(
    (e) => e.rotation_round_id === roundId && e.rotation_member_id === memberId,
  )?.status;
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
});

describe("SS-001 the same turn is an idempotent retry", () => {
  it("re-sending the same cell (exact, numeric, or confirmed) writes nothing and records no event", async () => {
    const [r1] = await board.rounds();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: r1.id }));
    const before = await board.events();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: r1.id }));
    ok(await board.assign(fx.owner, m1, "31", { roundId: r1.id }));
    ok(
      await board.assign(fx.owner, m1, "T31", {
        roundId: r1.id,
        endPrevious: true,
      }),
    );
    expect((await board.events()).length).toBe(before.length);
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
    expect((await board.claims()).get("T31")).toBe(m1);
  });

  it("a table held in a LATER turn than the target is blocked (same_server), even when confirmed", async () => {
    const rounds = await board.rounds();
    ok(await board.assign(fx.owner, m1, "6", { roundId: rounds[1].id }));
    const detail = conflict(
      await board.assign(fx.owner, m1, "6", { roundId: rounds[0].id }),
    );
    expect(detail.kind).toBe("same_server");
    const confirmed = await board.assign(fx.owner, m1, "6", {
      roundId: rounds[0].id,
      endPrevious: true,
    });
    expect(conflict(confirmed).kind).toBe("same_server");
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["6"]);
  });
});

describe("SS-002 / SS-003 a later turn is a structured same_server_repeat", () => {
  it("exact label: PT409 naming the previous assignment; nothing is written (SS-005 Cancel)", async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    const events = (await board.events()).length;
    const detail = conflict(await board.assign(fx.owner, m1, "T31"));
    expect(detail.kind).toBe("same_server_repeat");
    expect(detail.holders).toEqual([
      expect.objectContaining({ member_id: m1, assignment_label: "T31" }),
    ]);
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
    expect((await board.events()).length).toBe(events);
  });

  it('numeric shorthand "31" is the same canonical T31', async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    const detail = conflict(await board.assign(fx.owner, m1, "31"));
    expect(detail.kind).toBe("same_server_repeat");
    expect(detail.label).toBe("T31");
  });
});

describe("SS-004 End Previous + Assign is atomic", () => {
  it("ends the old lifecycle, keeps it as history, creates the new one, one claim", async () => {
    const [r1, r2] = await board.rounds();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: r1.id }));
    ok(
      await board.assign(fx.owner, m1, "31", {
        roundId: r2.id,
        endPrevious: true,
      }),
    );
    expect(await statusAt(r1.id, m1)).toBe("ended");
    expect(await statusAt(r2.id, m1)).toBe("active");
    const t31 = (await board.entries()).filter((e) => e.table_label === "T31");
    expect(t31.filter((e) => e.status === "active")).toHaveLength(1);
    expect(t31.filter((e) => e.status === "ended")).toHaveLength(1);
    const claims = await board.claims();
    expect(claims.get("T31")).toBe(m1);
    const event = (await board.events()).at(-1)!;
    expect(event.event_type).toBe("assign");
    expect(event.payload.repeat).toBe(true);
    expect(event.payload.displaced).toHaveLength(1);
  });

  it("SS-009 / SS-010 Undo restores the previous lifecycle, Redo replays the replacement", async () => {
    const [r1, r2] = await board.rounds();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: r1.id }));
    ok(
      await board.assign(fx.owner, m1, "T31", {
        roundId: r2.id,
        endPrevious: true,
      }),
    );
    ok(await board.undo(fx.server2));
    expect(await statusAt(r1.id, m1)).toBe("active");
    expect(await statusAt(r2.id, m1)).toBeUndefined();
    expect([...(await board.claims()).keys()]).toEqual(["T31"]);
    ok(await board.redo(fx.server2));
    expect(await statusAt(r1.id, m1)).toBe("ended");
    expect(await statusAt(r2.id, m1)).toBe("active");
    expect([...(await board.claims()).keys()]).toEqual(["T31"]);
  });

  it("SS-011 the replacement is durable: a fresh read of the board shows it", async () => {
    const [r1, r2] = await board.rounds();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: r1.id }));
    ok(
      await board.assign(fx.owner, m1, "T31", {
        roundId: r2.id,
        endPrevious: true,
      }),
    );
    // A different session/client reading the persisted rows (what a reload
    // renders): one active T31, one ended T31, one physical claim.
    const rows = (await board.entries()).filter((e) => e.table_label === "T31");
    expect(rows.map((e) => e.status).sort()).toEqual(["active", "ended"]);
    expect((await board.claims()).size).toBe(1);
  });
});

describe("SS-007 a combined previous assignment is one lifecycle unit", () => {
  it("ends the WHOLE combined assignment, then assigns only the wanted table", async () => {
    const [r1, r2] = await board.rounds();
    ok(await board.assign(fx.owner, m1, "4+5", { roundId: r1.id }));
    const detail = conflict(
      await board.assign(fx.owner, m1, "4", { roundId: r2.id }),
    );
    expect(detail.kind).toBe("same_server_repeat");
    expect(detail.holders[0].assignment_label).toBe("4 + 5");
    ok(
      await board.assign(fx.owner, m1, "4", {
        roundId: r2.id,
        endPrevious: true,
      }),
    );
    expect(await statusAt(r1.id, m1)).toBe("ended");
    const claims = await board.claims();
    expect(claims.get("4")).toBe(m1);
    expect(claims.has("5")).toBe(false);

    ok(await board.undo(fx.owner));
    const restored = await board.claims();
    expect(restored.get("4")).toBe(m1);
    expect(restored.get("5")).toBe(m1);
    expect(await statusAt(r2.id, m1)).toBeUndefined();
  });
});

describe("SS-006 cross-server conflicts are unchanged", () => {
  it("another server's table is still held; End Previous never takes it", async () => {
    ok(await board.assign(fx.owner, m1, "6"));
    expect(conflict(await board.assign(fx.manager, m2, "6")).kind).toBe("held");
    const takeAttempt = await board.assign(fx.manager, m2, "6", {
      endPrevious: true,
    });
    expect(conflict(takeAttempt).kind).toBe("held");
    ok(await board.assign(fx.manager, m2, "6", { confirm: true }));
    expect((await board.claims()).get("6")).toBe(m2);
  });

  it("a repeat that also needs another server's table is atomic: refused, then confirmed in one call", async () => {
    const rounds = await board.rounds();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: rounds[0].id }));
    ok(await board.assign(fx.owner, m2, "T32", { roundId: rounds[0].id }));
    const refused = await board.assign(fx.owner, m1, "T31+T32", {
      roundId: rounds[1].id,
      endPrevious: true,
    });
    expect(conflict(refused).kind).toBe("held");
    // Atomic: the previous T31 was NOT ended by the refused call.
    expect(await statusAt(rounds[0].id, m1)).toBe("active");
    expect((await board.claims()).get("T31")).toBe(m1);

    ok(
      await board.assign(fx.owner, m1, "T31+T32", {
        roundId: rounds[1].id,
        endPrevious: true,
        confirm: true,
        endWhole: true,
      }),
    );
    expect(await statusAt(rounds[0].id, m1)).toBe("ended");
    expect(await statusAt(rounds[0].id, m2)).toBe("ended");
    const claims = await board.claims();
    expect(claims.get("T31")).toBe(m1);
    expect(claims.get("T32")).toBe(m1);
  });
});

describe("SS-008 stale clients: the database decides", () => {
  it("a stale plain assign (client thought the table was free) gets the structured repeat", async () => {
    const rounds = await board.rounds();
    // Client A already gave Sidhu T31; client B, stale, sends a plain assign.
    ok(await board.assign(fx.owner, m1, "T31", { roundId: rounds[0].id }));
    const detail = conflict(
      await board.assign(fx.manager, m1, "T31", { roundId: rounds[1].id }),
    );
    expect(detail.kind).toBe("same_server_repeat");
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
  });

  it("a stale confirmed repeat whose previous assignment is already gone just assigns (no error, one claim)", async () => {
    const rounds = await board.rounds();
    ok(await board.assign(fx.owner, m1, "T31", { roundId: rounds[0].id }));
    // Client A ends the previous assignment first.
    ok(
      await board.rpc(fx.owner, "board_end_table", {
        p_service_session_id: board.sid,
        p_round_id: rounds[0].id,
        p_member_id: m1,
      }),
    );
    ok(
      await board.assign(fx.manager, m1, "T31", {
        roundId: rounds[1].id,
        endPrevious: true,
      }),
    );
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
    expect((await board.claims()).get("T31")).toBe(m1);
  });

  it("simultaneous confirmed repeats by two clients: serialized, exactly one active claim", async () => {
    const first = (await board.rounds())[0];
    ok(await board.assign(fx.owner, m1, "T31", { roundId: first.id }));
    // The first fill opened trailing rows; take two of them.
    const rounds = await board.rounds();
    const [a, b] = await Promise.all([
      board.assign(fx.owner, m1, "T31", {
        roundId: rounds[1].id,
        endPrevious: true,
      }),
      board.assign(fx.manager, m1, "T31", {
        roundId: rounds[2].id,
        endPrevious: true,
      }),
    ]);
    // Serialized by the session lock: whichever runs second sees the first's
    // new entry. The later-turn one succeeds; an earlier-turn one is blocked
    // (same_server) -- never an error of another kind, never two claims.
    const results = [a, b];
    expect(results.some((r) => r.error === null)).toBe(true);
    for (const r of results) {
      if (r.error !== null) expect(conflict(r).kind).toBe("same_server");
    }
    const t31 = (await board.entries()).filter((e) => e.table_label === "T31");
    expect(t31.filter((e) => e.status === "active")).toHaveLength(1);
    expect((await board.claims()).size).toBe(1);
  });
});

describe("authorization is unchanged", () => {
  it("every operating role gets the same decision; an outsider is refused", async () => {
    ok(await board.assign(fx.owner, m1, "T31"));
    for (const user of [fx.owner, fx.manager, fx.server2]) {
      expect(conflict(await board.assign(user, m1, "T31")).kind).toBe(
        "same_server_repeat",
      );
    }
    const outsider = await board.assign(fx.outsider, m1, "T31", {
      endPrevious: true,
    });
    expect(outsider.error).not.toBeNull();
    expect(outsider.error!.code).not.toBe("PT409");
    expect(sort((await board.activeByMember()).get(m1))).toEqual(["T31"]);
  });
});
