import { describe, expect, it } from "vitest";

import { mapBounded, readAllPages, type PageResult } from "./postgrest-paging";

/** A fake table of `n` rows behind a server that caps every response at `serverCap`. */
function table(n: number, serverCap = 1000, reportCount = true) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (
    from: number,
    to: number,
  ): Promise<PageResult<number>> => {
    calls.push([from, to]);
    const end = Math.min(to, from + serverCap - 1, n - 1);
    const data =
      from > end
        ? []
        : Array.from({ length: end - from + 1 }, (_, i) => from + i);
    return { data, error: null, count: reportCount ? n : null };
  };
  return { fetchPage, calls };
}

describe("readAllPages — a PostgREST max_rows cap never produces a silently short list", () => {
  it("reads everything when the table is smaller than a page", async () => {
    const t = table(37);
    const r = await readAllPages(t.fetchPage, { maxRows: 2000 });
    expect(r).toMatchObject({ ok: true, truncated: false });
    expect(r.ok && r.rows).toHaveLength(37);
    expect(t.calls).toHaveLength(1);
  });

  it("pages past the server cap: 2,500 rows behind a 1,000-row cap are all returned", async () => {
    const t = table(2500);
    const r = await readAllPages(t.fetchPage, { maxRows: 5000 });
    expect(r.ok && r.rows).toHaveLength(2500);
    expect(r.ok && r.truncated).toBe(false);
    expect(r.ok && r.rows[0]).toBe(0);
    expect(r.ok && r.rows[2499]).toBe(2499);
    expect(new Set(r.ok ? r.rows : []).size).toBe(2500); // no overlap
  });

  it("stays correct when the server cap is LOWER than the page size (e.g. max_rows = 400)", async () => {
    const t = table(1300, 400);
    const r = await readAllPages(t.fetchPage, { maxRows: 5000 });
    expect(r.ok && r.rows).toHaveLength(1300);
    expect(r.ok && r.truncated).toBe(false);
  });

  it("without a count and a LOW server cap, every row is still read", async () => {
    const t = table(1300, 400, false);
    const r = await readAllPages(t.fetchPage, { maxRows: 5000 });
    expect(r.ok && r.rows).toHaveLength(1300);
    expect(r.ok && r.truncated).toBe(false);
  });

  it("exactly page-size rows is complete (no phantom truncation)", async () => {
    const t = table(1000);
    const r = await readAllPages(t.fetchPage, { maxRows: 2000 });
    expect(r.ok && r.rows).toHaveLength(1000);
    expect(r.ok && r.truncated).toBe(false);
  });

  it("reports truncation when more rows exist than the maximum — even though the server cap hides it", async () => {
    const t = table(2600);
    const r = await readAllPages(t.fetchPage, { maxRows: 2000 });
    expect(r.ok && r.truncated).toBe(true);
    expect(r.ok && r.rows).toHaveLength(2000);
  });

  it("an empty table is a complete, empty result", async () => {
    const r = await readAllPages(table(0).fetchPage, { maxRows: 2000 });
    expect(r).toEqual({ ok: true, rows: [], truncated: false });
  });

  it("without an exact count only an EMPTY page ends the read (a short page may be a server cap)", async () => {
    const t = table(1500, 1000, false);
    const r = await readAllPages(t.fetchPage, { maxRows: 5000 });
    expect(r.ok && r.rows).toHaveLength(1500);
    expect(r.ok && r.truncated).toBe(false);
  });

  it("any page error fails the whole read (never a partial list)", async () => {
    let n = 0;
    const r = await readAllPages(
      async () => {
        n += 1;
        return n === 1
          ? {
              data: Array.from({ length: 1000 }, (_, i) => i),
              error: null,
              count: 3000,
            }
          : { data: null, error: { code: "x" }, count: null };
      },
      { maxRows: 5000 },
    );
    expect(r).toEqual({ ok: false });
  });

  it("fails SAFE (truncated) if it runs out of round trips", async () => {
    const r = await readAllPages(
      async () => ({ data: [1], error: null, count: null }),
      { maxRows: 1_000_000, pageSize: 1 },
    );
    expect(r.ok && r.truncated).toBe(true);
  });
});

describe("mapBounded", () => {
  it("keeps input order and never exceeds the concurrency limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapBounded([5, 1, 4, 2, 3], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
