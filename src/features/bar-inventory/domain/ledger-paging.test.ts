import { describe, expect, it } from "vitest";

import {
  collectLedger,
  LEDGER_PAGE_SIZE,
  olderThan,
  type LedgerCursor,
} from "./ledger-paging";

type Row = { id: number; created_at: string };

/** A ledger of `n` rows, newest first, behind a server that never returns more than `cap` rows. */
function server(n: number, cap = 1000) {
  const all: Row[] = Array.from({ length: n }, (_, i) => ({
    id: n - i,
    // Several rows share a timestamp, so the id tie-break is exercised.
    created_at: new Date(
      Date.UTC(2026, 9, 27) - Math.floor(i / 3) * 1000,
    ).toISOString(),
  }));
  const calls: { cursor: LedgerCursor | null; size: number }[] = [];
  const fetchPage = async (cursor: LedgerCursor | null, size: number) => {
    calls.push({ cursor, size });
    const start = cursor
      ? all.findIndex(
          (r) => r.created_at === cursor.createdAt && r.id === cursor.id,
        ) + 1
      : 0;
    return all.slice(start, start + Math.min(size, cap));
  };
  return { all, calls, fetchPage };
}

describe("collectLedger", () => {
  it("returns a small ledger in one read", async () => {
    const s = server(120);
    const rows = await collectLedger(s.fetchPage, 5001);
    expect(rows).toHaveLength(120);
    expect(s.calls).toHaveLength(1);
  });

  it("goes past the server's 1,000-row cap, in order, with no repeats or gaps", async () => {
    const s = server(3456);
    const rows = (await collectLedger(s.fetchPage, 5001))!;
    expect(rows).toHaveLength(3456);
    expect(rows.map((r) => r.id)).toEqual(s.all.map((r) => r.id));
    expect(new Set(rows.map((r) => r.id)).size).toBe(3456);
  });

  it("reads one row more than the limit so the caller knows it was cut", async () => {
    const s = server(7000);
    const rows = (await collectLedger(s.fetchPage, 5001))!;
    expect(rows).toHaveLength(5001); // limit 5000 + the probe row
  });

  it("never asks for a page larger than the cap, so a short page really is the end", async () => {
    const s = server(2500);
    await collectLedger(s.fetchPage, 5001);
    expect(Math.max(...s.calls.map((c) => c.size))).toBe(LEDGER_PAGE_SIZE);
  });

  it("an exact multiple of the page size still ends", async () => {
    const s = server(2000);
    expect(await collectLedger(s.fetchPage, 5001)).toHaveLength(2000);
  });

  it("an empty ledger", async () => {
    expect(await collectLedger(server(0).fetchPage, 5001)).toEqual([]);
  });

  it("fails as a whole when any page fails (never a silently partial ledger)", async () => {
    let call = 0;
    const rows = await collectLedger(async () => {
      call += 1;
      return call === 2
        ? null
        : Array.from({ length: 1000 }, (_, i) => ({
            id: 5000 - call * 1000 - i,
            created_at: "2026-10-27T00:00:00.000Z",
          }));
    }, 5001);
    expect(rows).toBeNull();
  });
});

describe("olderThan", () => {
  it("is strictly older by time, or the same instant with a smaller id", () => {
    expect(
      olderThan({ createdAt: "2026-10-27T12:00:00.123456+00:00", id: 42 }),
    ).toBe(
      "created_at.lt.2026-10-27T12:00:00.123456+00:00,and(created_at.eq.2026-10-27T12:00:00.123456+00:00,id.lt.42)",
    );
  });
});
