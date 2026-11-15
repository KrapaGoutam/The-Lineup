/**
 * TypeScript mirror of the database stock rules (migration
 * 20261026180000_bar_inventory_stock_ledger.sql: inventory_status,
 * inventory_effective_warning and the inventory_stock_status view). Both sides
 * are proven against tests/fixtures/bar-inventory/status-vectors.json.
 *
 * All arithmetic is done in integer cents, because IEEE addition decides
 * boundaries wrongly (0.1 + 0.2 !== 0.3). The database computes the
 * authoritative values; this mirror powers optimistic UI, demo mode and
 * client-side hints.
 */

export const STOCK_STATUSES = [
  "critical",
  "low",
  "healthy",
  "no_cutoff",
  "archived",
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STATUS_LABEL: Record<StockStatus, string> = {
  critical: "Critical",
  low: "Low",
  healthy: "Healthy",
  no_cutoff: "No cutoff",
  archived: "Archived",
};

/** Warning fallback: cutoff + max(1, ceil(cutoff * 0.25)). */
export const WARNING_FALLBACK_RATIO = 0.25;
export const WARNING_FALLBACK_MIN_STEP = 1;

export const MAX_QUANTITY = 9_999_999_999.99;
export const MAX_QUANTITY_CENTS = 999_999_999_999;

export type QuantityParseResult =
  | { ok: true; value: number | null; cents: number | null }
  | { ok: false; error: string };

/**
 * Pure parser for quantities across The Lineup Bar Inventory.
 * Supports:
 *  - Whole numbers: "0", "2", "15"
 *  - Decimals (up to 2 places): "0.5", "0.75", "2.25", ".5"
 *  - Simple fractions: "1/2", "3/4", "1/4"
 *  - Mixed fractions: "1 1/2", "2 1/4"
 *
 * Normalizes to exact 2-decimal numbers (and integer cents).
 * Strictly rejects:
 *  - Negative values ("-1", "-1/2")
 *  - Nonrepresentable fractions ("1/8", "1/3") whose exact decimal needs >2 places
 *  - Malformed values ("1/0", "abc", "5.")
 *  - Comma / thousand separators ("1,200", "1 200")
 *  - Values above MAX_QUANTITY
 */
export function parseQuantityInput(
  input: string,
  options: {
    allowBlank?: boolean;
    label?: string;
  } = {},
): QuantityParseResult {
  const { allowBlank = false, label } = options;
  const text = input.trim();
  if (text === "") {
    if (allowBlank) return { ok: true, value: null, cents: null };
    return {
      ok: false,
      error: label ? `Enter a number for ${label}.` : "Enter a number.",
    };
  }

  if (text.includes("-")) {
    return {
      ok: false,
      error: label
        ? `${label} cannot be negative.`
        : "Counts and levels cannot be negative.",
    };
  }

  if (text.includes(",") || /^\d+\s+\d+$/.test(text)) {
    return {
      ok: false,
      error:
        "Use a plain number with a period for decimals (no thousand separators or decimal commas).",
    };
  }

  // Mixed fraction: "1 1/2", "2 3/4"
  const mixedMatch = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) {
      return { ok: false, error: "Division by zero is not allowed." };
    }
    if ((100 * num) % den !== 0) {
      return {
        ok: false,
        error:
          "Fraction cannot be represented with 2 decimal places (such as 1/8). Use 1/2, 1/4, 3/4, etc.",
      };
    }
    const fracCents = (100 * num) / den;
    const cents = whole * 100 + fracCents;
    if (cents > MAX_QUANTITY_CENTS) {
      return { ok: false, error: "That number is too large." };
    }
    return { ok: true, value: fromCents(cents), cents };
  }

  // Simple fraction: "1/2", "3/4"
  const fracMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) {
      return { ok: false, error: "Division by zero is not allowed." };
    }
    if ((100 * num) % den !== 0) {
      return {
        ok: false,
        error:
          "Fraction cannot be represented with 2 decimal places (such as 1/8). Use 1/2, 1/4, 3/4, etc.",
      };
    }
    const cents = (100 * num) / den;
    if (cents > MAX_QUANTITY_CENTS) {
      return { ok: false, error: "That number is too large." };
    }
    return { ok: true, value: fromCents(cents), cents };
  }

  if (text.endsWith(".")) {
    return { ok: false, error: `“${text}” is not a number.` };
  }

  // Decimal / integer: "0", "0.5", "12", ".5"
  const decMatch = text.match(/^(\d+(\.\d+)?|\.\d+)$/);
  if (decMatch) {
    const parts = text.split(".");
    if (parts.length === 2 && parts[1].length > 2) {
      return { ok: false, error: "Use at most two decimal places." };
    }
    const intPart = parts[0] === "" ? 0 : parseInt(parts[0], 10);
    const fracPart = parts.length === 2 ? parts[1].padEnd(2, "0") : "00";
    const cents = intPart * 100 + parseInt(fracPart, 10);
    if (cents > MAX_QUANTITY_CENTS) {
      return { ok: false, error: "That number is too large." };
    }
    return { ok: true, value: fromCents(cents), cents };
  }

  return { ok: false, error: `“${text}” is not a number.` };
}

export function parseQuantityOrThrow(
  input: string,
  options: { label?: string; allowBlank?: boolean } = {},
): number | null {
  const result = parseQuantityInput(input, options);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

/** Exact quantity in cents; throws on more than two decimals or bad input. */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Enter a number.");
  const cents = Math.round(value * 100);
  if (Math.abs(cents / 100 - value) > 1e-9) {
    throw new RangeError("Use at most two decimal places.");
  }
  if (Math.abs(value) > MAX_QUANTITY)
    throw new RangeError("That is too large.");
  return cents;
}

export const fromCents = (cents: number): number => cents / 100;

/** A stored quantity as text: "—" when blank, otherwise as-is ("6", "6.5"). */
export const formatQuantity = (value: number | null) =>
  value === null ? "—" : String(value);

/** Rounds a derived value (e.g. a sum) to two decimals without drift. */
export function round2(value: number): number {
  return fromCents(Math.round(value * 100));
}

export type StockLevels = {
  onHand: number;
  backup: number;
  cutoff: number | null;
  warning: number | null;
  par: number | null;
};

export type StockEvaluation = {
  total: number;
  effectiveWarning: number | null;
  status: StockStatus;
  /** Critical / Low only: max(0, par - total); null without a par. */
  suggestedOrder: number | null;
  /** Critical / Low with no par: "Order needed", never an invented number. */
  orderNeeded: boolean;
};

export function totalAvailable(onHand: number, backup: number): number {
  return fromCents(toCents(onHand) + toCents(backup));
}

export function effectiveWarning(
  cutoff: number | null,
  warning: number | null,
): number | null {
  if (warning !== null) return fromCents(toCents(warning));
  if (cutoff === null) return null;
  const c = toCents(cutoff);
  // ceil(cutoff * 0.25) in whole units, expressed in cents.
  const step = Math.max(
    WARNING_FALLBACK_MIN_STEP * 100,
    Math.ceil((c * WARNING_FALLBACK_RATIO) / 100) * 100,
  );
  return fromCents(c + step);
}

export function evaluateStock(
  levels: StockLevels,
  options: { archived?: boolean } = {},
): StockEvaluation {
  const total = toCents(levels.onHand) + toCents(levels.backup);
  const warning = effectiveWarning(levels.cutoff, levels.warning);
  const cutoff = levels.cutoff === null ? null : toCents(levels.cutoff);

  let status: StockStatus;
  if (options.archived) status = "archived";
  else if (cutoff === null) status = "no_cutoff";
  else if (total <= cutoff) status = "critical";
  else if (warning !== null && total <= toCents(warning)) status = "low";
  else status = "healthy";

  const actionable = status === "critical" || status === "low";
  const par = levels.par === null ? null : toCents(levels.par);
  return {
    total: fromCents(total),
    effectiveWarning: warning,
    status,
    suggestedOrder:
      actionable && par !== null ? fromCents(Math.max(0, par - total)) : null,
    orderNeeded: actionable && par === null,
  };
}

/** Severity order for lists: critical first, then low, then the rest. */
const STATUS_RANK: Record<StockStatus, number> = {
  critical: 0,
  low: 1,
  healthy: 2,
  no_cutoff: 3,
  archived: 4,
};

export const statusRank = (status: StockStatus): number => STATUS_RANK[status];

/** The adjustment reasons the ledger accepts (owner-approved list). */
export const ADJUSTMENT_REASONS = [
  "stock_count",
  "delivery_restock",
  "usage",
  "breakage",
  "comp",
  "transfer_in",
  "transfer_out",
  "correction",
  "other",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  stock_count: "Stock Count",
  delivery_restock: "Delivery / Restock",
  usage: "Usage",
  breakage: "Breakage",
  comp: "Comp",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  correction: "Correction",
  other: "Other",
};

/** Ledger `source`, derived by the database from the reason. */
export function sourceForReason(reason: AdjustmentReason): string {
  if (reason === "stock_count") return "count";
  if (reason === "delivery_restock") return "delivery";
  return "manual_edit";
}
