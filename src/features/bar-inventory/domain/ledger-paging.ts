/**
 * Reading the ledger past PostgREST's response cap.
 *
 * The API returns at most `max_rows` (1,000 by default) rows however large a
 * `limit` is asked for, so a single read of "5,001 rows" quietly returned 1,000
 * and the "was it cut?" probe (`rows > limit`) could never be true. The ledger
 * is read newest first in pages that each fit under the cap, following a
 * (created_at, id) cursor rather than an offset: the ledger is appended to
 * while it is read, and an offset would then repeat or skip rows.
 */

/** Below every plausible `max_rows`, so a short page really is the last one. */
export const LEDGER_PAGE_SIZE = 1000;

export type LedgerCursor = { createdAt: string; id: number };

type Keyed = { created_at: string; id: number };

/** The PostgREST `or` filter for "strictly older than the cursor" (newest-first order). */
export function olderThan(cursor: LedgerCursor): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

/**
 * Up to `want` rows, newest first, gathered page by page. `fetchPage` reads at
 * most `size` rows strictly older than `cursor` (null = from the newest).
 * Returns null if any page failed.
 */
export async function collectLedger<T extends Keyed>(
  fetchPage: (cursor: LedgerCursor | null, size: number) => Promise<T[] | null>,
  want: number,
  pageSize: number = LEDGER_PAGE_SIZE,
): Promise<T[] | null> {
  const rows: T[] = [];
  let cursor: LedgerCursor | null = null;
  while (rows.length < want) {
    const size = Math.min(pageSize, want - rows.length);
    const page = await fetchPage(cursor, size);
    if (page === null) return null;
    rows.push(...page);
    if (page.length < size) break; // the last page
    const last = page[page.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return rows;
}
