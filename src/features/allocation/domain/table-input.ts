import {
  combinedTableLabel,
  parseCombinedTableLabel,
} from "@/features/allocation/domain/floor-layout";

/**
 * Canonical table input resolution (#157) -- the client mirror of
 * `private.resolve_table_input` (supabase/migrations/
 * 20261026120000_table_input_canonical_resolution.sql).
 *
 * THE DATABASE IS THE AUTHORITY. `board_assign` / `board_end_and_assign` and
 * the occupancy trigger resolve every label themselves, so a stale client, a
 * different client or a direct RPC call gets the same answer whatever this
 * file says. This mirror exists so (a) the demo-mode board (no database) and
 * (b) the Grid / dialog / optimistic state can show the canonical table
 * immediately instead of flashing the raw shorthand. Keep it byte-for-byte
 * equivalent to the SQL rules; `table-input.test.ts` and pgTAP 0031 share the
 * same vectors.
 *
 *   1. exact registered label (trimmed, case-sensitive) wins -- "T1" -> T1;
 *   2. digits-only input, no exact match -> "T" + the literal digits if that
 *      table is registered -- "1" -> T1. Leading zeros are NOT collapsed:
 *      "01" -> T01 or free text, never T1;
 *   3. otherwise the trimmed text is a free-text label ("Patio A", "99"
 *      without a T99).
 */
export type TableInputResolution = {
  /** The trimmed input ("" when empty). */
  input: string;
  canonicalLabel: string;
  diningTableId: number | null;
  /** True when the canonical label is a registered physical table. */
  registered: boolean;
};

type RegisteredLabel = { label: string; diningTableId?: number };

export function resolveTableInput(
  input: string | null | undefined,
  registry: readonly RegisteredLabel[],
): TableInputResolution {
  const text = (input ?? "").trim();
  const resolved = (entry: RegisteredLabel): TableInputResolution => ({
    input: text,
    canonicalLabel: entry.label,
    diningTableId: entry.diningTableId ?? null,
    registered: true,
  });

  if (text !== "") {
    const exact = registry.find(({ label }) => label === text);
    if (exact) return resolved(exact);
    if (/^[0-9]+$/.test(text)) {
      const shorthand = registry.find(({ label }) => label === `T${text}`);
      if (shorthand) return resolved(shorthand);
    }
  }
  return {
    input: text,
    canonicalLabel: text,
    diningTableId: null,
    registered: false,
  };
}

/**
 * Resolve every part of a (possibly combined) label independently, keep the
 * first-seen order, collapse a table named twice, join with " + ". "" when
 * there is nothing to assign.
 */
export function canonicalizeTableLabel(
  label: string | null | undefined,
  registry: readonly RegisteredLabel[],
): string {
  const parts: string[] = [];
  for (const part of parseCombinedTableLabel(label ?? "")) {
    const { canonicalLabel } = resolveTableInput(part, registry);
    if (!parts.includes(canonicalLabel)) parts.push(canonicalLabel);
  }
  return combinedTableLabel(parts);
}
