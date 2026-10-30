import type { DetailVariant, RecipeDetail } from "./recipe-detail";

export type QuickMeasureItem = {
  id: string;
  measure: string;
  name: string;
  rawText: string;
};

export type OzRatio = {
  ratio: string;
  parts: Array<{ amount: string; name: string }>;
  excluded: string[];
  excludedSummary: string;
};

export type QuickGlanceVariant = {
  variant: "perfect" | "house";
  label: string;
  method: string | null;
  measurements: string[];
  summaryText: string;
  glass: string | null;
  garnish: string | null;
  rim: string | null;
};

export type QuickGlanceData = {
  variants: QuickGlanceVariant[];
  commonGlass: string | null;
};

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
// Longest first so "fl oz" is stripped whole from an amount like "2 fl oz".
const OUNCE_SUFFIXES = [...OUNCE_UNITS].sort((a, b) => b.length - a.length);
const CONFLICTING_VOLUME_UNITS = new Set([
  "ml",
  "cl",
  "l",
  "liter",
  "liters",
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "tablespoon",
  "tablespoons",
  "teaspoon",
  "teaspoons",
  "pt",
  "pint",
  "pints",
  "qt",
  "quart",
  "quarts",
]);

/** True when any alphabetic token (including "30ml", "1.5cl") is a non-ounce volume unit. */
function hasConflictingVolumeUnit(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((token) => CONFLICTING_VOLUME_UNITS.has(token));
}

/**
 * Derives structured Quick Measure rows from ingredients.
 * Preserves original source text, omits empty entries.
 */
export function deriveQuickMeasure(
  ingredients:
    | DetailVariant["ingredients"]
    | readonly DetailVariant["ingredients"][number][],
): QuickMeasureItem[] {
  if (!Array.isArray(ingredients)) return [];
  const items: QuickMeasureItem[] = [];

  for (const i of ingredients) {
    const name = i.ingredient_name?.trim() || "";
    const amount = i.amount?.trim() || "";
    const unit = i.unit?.trim() || "";

    if (!name && !amount && !unit) continue;

    const measure = [amount, unit].filter(Boolean).join(" ");
    const rawText = measure ? `${measure} ${name}`.trim() : name;

    items.push({
      id: i.id,
      measure,
      name,
      rawText,
    });
  }

  return items;
}

/**
 * Parses a simple fraction or decimal string into a positive float.
 * Returns null if parsing is ambiguous or non-numeric or <= 0.
 */
function parseNumericAmount(amountStr: string): number | null {
  const trimmed = amountStr.trim();
  if (!trimmed) return null;

  // Mixed number like "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    const val = whole + num / den;
    return val > 0 && Number.isFinite(val) ? val : null;
  }

  // Simple fraction like "1/2" or "3/4"
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
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

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function gcdArray(arr: number[]): number {
  return arr.reduce((acc, v) => gcd(acc, v), arr[0] || 1);
}

/**
 * Conservatively derives an ounce ratio for a variant.
 *
 * Rules:
 * - Only consider ingredients with explicit numeric quantities using ounce units.
 * - Require at least two compatible ounce-based ingredients.
 * - Exclude non-ounce additions (dashes, tops, splashes, bitters, garnishes).
 * - If there are conflicting volume units (e.g. ml, cl, cups), omit ratio.
 * - If parsing is ambiguous, negative, zero, or malformed, omit ratio.
 * - Reduce compatible numbers to small whole integers (e.g. 8 : 1, 2 : 1 : 1).
 *   If reduction does not yield clean small integers (max <= 20), omit ratio.
 */
export function deriveOzRatio(
  ingredients:
    | DetailVariant["ingredients"]
    | readonly DetailVariant["ingredients"][number][],
): OzRatio | null {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return null;

  type OunceCandidate = {
    amountVal: number;
    amountText: string;
    name: string;
  };

  const ounceCandidates: OunceCandidate[] = [];
  const excludedItems: string[] = [];

  for (const item of ingredients) {
    const name = item.ingredient_name?.trim() || "";
    const unitRaw = item.unit?.trim().toLowerCase() || "";
    const amountRaw = item.amount?.trim() || "";

    // Check for conflicting liquid volume units
    if (
      hasConflictingVolumeUnit(unitRaw) ||
      hasConflictingVolumeUnit(amountRaw)
    ) {
      return null;
    }

    // Check if unit is ounce
    let isOz = OUNCE_UNITS.has(unitRaw);
    let cleanAmount = amountRaw;

    if (!isOz) {
      // Check if amount contains "oz" or "ounce"
      for (const ozUnit of OUNCE_SUFFIXES) {
        if (amountRaw.toLowerCase().endsWith(ozUnit)) {
          isOz = true;
          cleanAmount = amountRaw.slice(0, -ozUnit.length).trim();
          break;
        }
      }
    }

    if (isOz) {
      const parsedVal = parseNumericAmount(cleanAmount);
      if (parsedVal === null) {
        // Malformed or non-numeric ounce amount (e.g. "2-3", "splash", "0", "-1")
        return null;
      }
      const formattedAmount = `${cleanAmount.startsWith(".") ? cleanAmount : cleanAmount} oz`;
      ounceCandidates.push({
        amountVal: parsedVal,
        amountText: formattedAmount,
        name,
      });
    } else {
      // Excluded auxiliary row (bitters, splashes, tops, etc.)
      const measure = [amountRaw, unitRaw].filter(Boolean).join(" ");
      const full = measure ? `${measure} ${name}`.trim() : name;
      if (full) {
        excludedItems.push(full);
      }
    }
  }

  // Must have at least two compatible ounce ingredients
  if (ounceCandidates.length < 2) {
    return null;
  }

  // Attempt reduction to clean integers
  const values = ounceCandidates.map((c) => c.amountVal);
  const MULTIPLIERS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  let bestIntegers: number[] | null = null;

  for (const m of MULTIPLIERS) {
    const candidates = values.map((v) => Math.round(v * m));
    const isClose = values.every(
      (v, i) => Math.abs(v * m - candidates[i]) < 0.01,
    );
    if (isClose && candidates.every((c) => c > 0)) {
      const g = gcdArray(candidates);
      const reduced = candidates.map((c) => c / g);
      if (Math.max(...reduced) <= 20) {
        bestIntegers = reduced;
        break;
      }
    }
  }

  if (!bestIntegers) {
    return null;
  }

  const ratioStr = bestIntegers.join(" : ");
  const parts = ounceCandidates.map((c) => ({
    amount: c.amountText,
    name: c.name,
  }));

  // Build clean summary of excluded items
  let excludedSummary = "";
  if (excludedItems.length > 0) {
    const allBitters = excludedItems.every((item) =>
      item.toLowerCase().includes("bitter"),
    );
    if (allBitters && excludedItems.length === 1) {
      excludedSummary = `+ ${excludedItems[0]}`;
    } else if (allBitters) {
      excludedSummary = `+ ${excludedItems.join(", ")}`;
    } else {
      excludedSummary = `+ other ingredients as listed`;
    }
  }

  return {
    ratio: ratioStr,
    parts,
    excluded: excludedItems,
    excludedSummary,
  };
}

/**
 * Derives compact Quick Glance data from a RecipeDetail.
 */
export function deriveQuickGlance(recipe: RecipeDetail): QuickGlanceData {
  const variants: QuickGlanceVariant[] = [];

  const orderedVariants = [
    recipe.variants.find((v) => v.variant === "perfect"),
    recipe.variants.find((v) => v.variant === "house"),
  ].filter((v): v is DetailVariant => !!v);

  for (const v of orderedVariants) {
    const label = v.variant === "house" ? "House" : "Perfect";
    const method = v.method?.trim() || null;
    const glass =
      [v.glass, v.glass_notes]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(" · ") || null;
    const rim =
      [v.rim_type, v.rim_notes]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(" · ") || null;
    const garnishes = v.garnishes
      .map((g) => g.name.trim())
      .filter(Boolean)
      .join(", ");
    const garnish = garnishes || null;

    // Concise ingredient measurements (e.g. "2 oz Bourbon or rye")
    const measurements = (v.ingredients || [])
      .map((i) => {
        const m = [i.amount, i.unit]
          .filter(Boolean)
          .map((s) => s?.trim())
          .join(" ");
        const n = i.ingredient_name?.trim() || "";
        return m ? `${m} ${n}`.trim() : n;
      })
      .filter(Boolean);

    const summaryParts = [method, ...measurements].filter(Boolean) as string[];
    const summaryText = summaryParts.join(" · ");

    variants.push({
      variant: v.variant as "perfect" | "house",
      label,
      method,
      measurements,
      summaryText,
      glass,
      garnish,
      rim,
    });
  }

  // Determine common glass if all non-empty glass specifications match
  const glasses = variants.map((v) => v.glass).filter(Boolean);
  const commonGlass =
    glasses.length > 0 && glasses.every((g) => g === glasses[0])
      ? glasses[0]
      : null;

  return {
    variants,
    commonGlass,
  };
}

export type GlanceFieldKey = "method" | "glass" | "garnish" | "rim";

export type GlanceField = {
  key: GlanceFieldKey;
  label: string;
  /** One entry when every variant agrees, otherwise one per variant. */
  values: Array<{
    variant: "perfect" | "house";
    label: string;
    text: string | null;
  }>;
  shared: boolean;
};

const GLANCE_FIELDS: Array<[GlanceFieldKey, string]> = [
  ["method", "Method"],
  ["glass", "Glass"],
  ["garnish", "Garnish"],
  ["rim", "Rim"],
];

/**
 * Compact Quick Glance strip fields, from persisted values only. A field is
 * omitted when no variant has a value; when variants disagree (including one
 * missing) each variant's value is returned so both can be shown.
 */
export function deriveGlanceFields(glance: QuickGlanceData): GlanceField[] {
  const fields: GlanceField[] = [];
  for (const [key, label] of GLANCE_FIELDS) {
    const values = glance.variants.map((v) => ({
      variant: v.variant,
      label: v.label,
      text: v[key],
    }));
    if (!values.some((v) => v.text)) continue;
    const first = values[0].text?.toLowerCase() ?? null;
    const shared = values.every(
      (v) => (v.text?.toLowerCase() ?? null) === first,
    );
    fields.push({ key, label, values: shared ? [values[0]] : values, shared });
  }
  return fields;
}
