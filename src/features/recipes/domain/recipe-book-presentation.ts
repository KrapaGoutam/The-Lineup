import type { DetailVariant } from "./recipe-detail";
import type {
  PresentationData,
  VariantDifferences,
} from "./recipe-differences";

export type UnitSystem = "oz" | "ml";

export type SplitQuantity = {
  w: string;
  f: string;
  u: string;
};

export type StepVerbEmphasis = {
  pre: string;
  verb: string;
  post: string;
};

export type DifferencesSummary = {
  count: number;
  areas: string[];
  title: string;
  label: string;
};

const ACTION_VERBS = new Set([
  "add",
  "shake",
  "stir",
  "strain",
  "top",
  "muddle",
  "pour",
  "smoke",
  "serve",
  "garnish",
  "express",
]);

const OUNCE_UNITS = new Set([
  "oz",
  "oz.",
  "ounce",
  "ounces",
  "fl oz",
  "fl oz.",
  "fl. oz",
  "fl. oz.",
]);

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/**
 * Parses numeric amount from string, handling decimals, fractions, mixed numbers, and unicode fractions.
 */
export function parseQuantityAmount(
  amountStr: string | null | undefined,
): number | null {
  if (!amountStr) return null;
  const trimmed = amountStr.trim();
  if (!trimmed) return null;

  // Unicode fraction check (e.g. "1 ½" or "½")
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (trimmed.includes(char)) {
      const parts = trimmed.split(char);
      const whole = parts[0]?.trim();
      const wholeNum = whole ? parseInt(whole, 10) : 0;
      if (Number.isNaN(wholeNum)) return null;
      return wholeNum + val;
    }
  }

  // Mixed numbers like "1 1/2"
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const num = parseInt(mixed[2], 10);
    const den = parseInt(mixed[3], 10);
    if (den === 0) return null;
    const val = whole + num / den;
    return val > 0 && Number.isFinite(val) ? val : null;
  }

  // Simple fractions like "1/2", "3/4"
  const frac = trimmed.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (den === 0) return null;
    const val = num / den;
    return val > 0 && Number.isFinite(val) ? val : null;
  }

  // Decimal / integer like "2", "0.25", ".25", "1.5"
  if (/^(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) {
    const val = parseFloat(trimmed);
    return val > 0 && Number.isFinite(val) ? val : null;
  }

  return null;
}

/**
 * Splits quantity into whole, fraction, and unit slots for decimal point alignment.
 * If unit is oz and system is ml, converts at 30 ml / oz with at most 1 decimal.
 */
export function splitQuantity(
  amount: string | null | undefined,
  unit: string | null | undefined,
  system: UnitSystem = "oz",
): SplitQuantity {
  const rawAmount = amount?.trim() ?? "";
  const rawUnit = unit?.trim() ?? "";

  if (!rawAmount && !rawUnit) {
    return { w: "", f: "", u: "" };
  }

  if (!rawAmount && rawUnit) {
    return { w: "", f: "", u: rawUnit };
  }

  const isOunce = OUNCE_UNITS.has(rawUnit.toLowerCase());
  const parsed = parseQuantityAmount(rawAmount);

  if (isOunce && parsed !== null) {
    if (system === "ml") {
      const mlVal = parsed * 30;
      const rounded = Math.round(mlVal * 10) / 10;
      if (Number.isInteger(rounded)) {
        return { w: String(rounded), f: "", u: "ml" };
      }
      const [w, f] = rounded.toFixed(1).split(".");
      return { w, f: "." + f, u: "ml" };
    }

    // oz system
    if (Number.isInteger(parsed)) {
      return { w: String(parsed), f: "", u: "oz" };
    }
    const [w, f] = parsed.toFixed(2).split(".");
    return { w, f: "." + f, u: "oz" };
  }

  // Non-ounce or non-numeric: raw text in w, unit in u
  return { w: rawAmount, f: "", u: rawUnit };
}

/**
 * Identifies action verb in the first two words of an instruction.
 * Render-time styling only; never modifies text.
 */
export function emphasiseVerb(instruction: string): StepVerbEmphasis {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return { pre: "", verb: "", post: "" };
  }

  const words = trimmed.split(/\s+/);
  if (words.length === 0) {
    return { pre: "", verb: "", post: "" };
  }

  const clean = (w: string) => w.replace(/[^a-zA-Z]/g, "").toLowerCase();

  // Check word 0
  if (ACTION_VERBS.has(clean(words[0]))) {
    const verb = words[0];
    const post = trimmed.slice(verb.length);
    return { pre: "", verb, post };
  }

  // Check word 1
  if (words.length > 1 && ACTION_VERBS.has(clean(words[1]))) {
    const pre = words[0] + " ";
    const verb = words[1];
    const post = trimmed.slice(pre.length + verb.length);
    return { pre, verb, post };
  }

  return { pre: "", verb: "", post: trimmed };
}

/**
 * Checks if recipe variants exceed 5 ingredients or 5 steps (Mojito rule).
 */
export function isLongRecipe(variants: DetailVariant[]): boolean {
  return variants.some(
    (v) => (v.ingredients?.length ?? 0) > 5 || (v.steps?.length ?? 0) > 5,
  );
}

/**
 * Counts differing areas between Perfect and House builds.
 */
export function countDifferences(
  perfect: DetailVariant | undefined,
  house: DetailVariant | undefined,
  differences: { house: VariantDifferences },
  presentation: PresentationData,
): DifferencesSummary {
  if (!perfect || !house) {
    return { count: 0, areas: [], title: "", label: "" };
  }

  const areas: string[] = [];

  // 1. Ingredients
  if (differences.house.ingredientIds.size > 0) {
    areas.push("ingredients");
  }

  // 2. Method
  const perfectMethod = perfect.method?.trim().toLowerCase() ?? "";
  const houseMethod = house.method?.trim().toLowerCase() ?? "";
  if (perfectMethod !== houseMethod) {
    areas.push("method");
  }

  // 3. Glass
  if (
    presentation.differing.has("glass") ||
    (perfect.glass?.trim().toLowerCase() ?? "") !==
      (house.glass?.trim().toLowerCase() ?? "") ||
    (perfect.glass_notes?.trim().toLowerCase() ?? "") !==
      (house.glass_notes?.trim().toLowerCase() ?? "")
  ) {
    areas.push("glass");
  }

  // 4. Rim
  if (
    presentation.differing.has("rim") ||
    (perfect.rim_type?.trim().toLowerCase() ?? "") !==
      (house.rim_type?.trim().toLowerCase() ?? "") ||
    (perfect.rim_notes?.trim().toLowerCase() ?? "") !==
      (house.rim_notes?.trim().toLowerCase() ?? "")
  ) {
    areas.push("rim");
  }

  // 5. Garnish
  if (presentation.differing.has("garnish")) {
    areas.push("garnish");
  } else {
    const pGarnish = (perfect.garnishes ?? [])
      .map(
        (g) =>
          `${g.name.trim().toLowerCase()}·${g.notes?.trim().toLowerCase() ?? ""}`,
      )
      .join(",");
    const hGarnish = (house.garnishes ?? [])
      .map(
        (g) =>
          `${g.name.trim().toLowerCase()}·${g.notes?.trim().toLowerCase() ?? ""}`,
      )
      .join(",");
    if (pGarnish !== hGarnish) {
      areas.push("garnish");
    }
  }

  // 6. Steps
  if (differences.house.stepIds.size > 0) {
    areas.push("steps");
  }

  const count = areas.length;
  const label = `${count} ${count === 1 ? "difference" : "differences"}`;
  const title = `Differs from Perfect: ${areas.join(", ")}`;

  return { count, areas, title, label };
}

/**
 * Formats rim presentation text. Returns "No rim" when empty or "none".
 */
export function formatRim(
  rimType: string | null | undefined,
  rimNotes?: string | null | undefined,
): string {
  const type = rimType?.trim() ?? "";
  const notes = rimNotes?.trim() ?? "";
  const raw = [type, notes].filter(Boolean).join(" · ");

  if (!raw || raw.toLowerCase() === "none" || raw.toLowerCase() === "no rim") {
    return "No rim";
  }

  if (raw.toLowerCase().endsWith("rim")) {
    return raw;
  }

  return `${raw} rim`;
}

/**
 * Formats glass text, e.g. "Old Fashioned / Rocks".
 */
export function formatGlass(
  glass: string | null | undefined,
  glassNotes?: string | null | undefined,
): string {
  const g = glass?.trim() ?? "";
  const n = glassNotes?.trim() ?? "";
  return [g, n].filter(Boolean).join(" · ");
}

/**
 * Formats garnishes into a comma-separated string.
 */
export function formatGarnishes(
  garnishes: DetailVariant["garnishes"] | undefined,
): string {
  if (!garnishes || garnishes.length === 0) return "";
  const sorted = [...garnishes].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return sorted
    .map((g) => {
      const name = g.name.trim();
      const notes = g.notes?.trim();
      return notes ? `${name} · ${notes}` : name;
    })
    .join(", ");
}
