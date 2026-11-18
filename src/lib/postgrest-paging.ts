/**
 * Complete, bounded reads through PostgREST.
 *
 * PostgREST silently caps every response at the project's `max_rows` (1000 by default),
 * regardless of the `.limit()` asked for. A reader that asks for "limit + 1" rows to detect
 * truncation therefore NEVER sees the extra row when its limit exceeds that cap, and quietly
 * returns an incomplete list that looks complete. Money and hours must never depend on that.
 *
 * `readAllPages` pages with `.range()` and decides completeness from the EXACT row count the
 * server reports (the caller's query must request `{ count: "exact" }`), so it stays correct
 * whatever `max_rows` is configured to be. Order must be total (end with a unique column) so
 * pages never overlap or skip.
 */

export interface PageResult<T> {
  readonly data: readonly T[] | null;
  readonly error: unknown;
  /** Exact total from `select(..., { count: "exact" })`; null when not reported. */
  readonly count: number | null;
}

export type PagedRead<T> =
  | { readonly ok: true; readonly rows: T[]; readonly truncated: boolean }
  | { readonly ok: false };

const DEFAULT_PAGE = 1000;
/** Defensive bound on round trips for one logical read. */
const MAX_PAGES = 200;

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { readonly maxRows: number; readonly pageSize?: number },
): Promise<PagedRead<T>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE;
  const rows: T[] = [];
  let total: number | null = null;

  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const from = rows.length;
    const { data, error, count } = await fetchPage(from, from + pageSize - 1);
    if (error) return { ok: false };
    if (total === null && typeof count === "number") total = count;
    const page = data ?? [];

    if (total !== null && total > options.maxRows) {
      // More rows exist than may be loaded: report it, never pretend it is complete.
      rows.push(...page);
      if (rows.length >= options.maxRows || page.length === 0) {
        return {
          ok: true,
          rows: rows.slice(0, options.maxRows),
          truncated: true,
        };
      }
      continue;
    }

    rows.push(...page);
    if (page.length === 0) return { ok: true, rows, truncated: false };
    if (total !== null) {
      if (rows.length >= total) return { ok: true, rows, truncated: false };
    }
    // No exact count: a short page proves nothing (the server may have capped it), so only
    // an EMPTY page ends the read.
    if (rows.length > options.maxRows) {
      return {
        ok: true,
        rows: rows.slice(0, options.maxRows),
        truncated: true,
      };
    }
  }
  // Ran out of round trips: fail safe as truncated, never as complete.
  return { ok: true, rows: rows.slice(0, options.maxRows), truncated: true };
}

/** Runs `work` over `items` with bounded concurrency, preserving input order. */
export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      out[index] = await work(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}
