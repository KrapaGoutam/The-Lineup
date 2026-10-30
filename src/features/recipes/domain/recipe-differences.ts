import type { DetailVariant } from "./recipe-detail";

const norm = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Consumes one matching key from the pool; true when a match existed. */
function take(pool: Map<string, number>, key: string): boolean {
  const left = pool.get(key) ?? 0;
  if (left <= 0) return false;
  pool.set(key, left - 1);
  return true;
}

function countKeys(keys: string[]): Map<string, number> {
  const pool = new Map<string, number>();
  for (const key of keys) pool.set(key, (pool.get(key) ?? 0) + 1);
  return pool;
}

function differing(own: string[], other: string[]): boolean[] {
  const pool = countKeys(other);
  return own.map((key) => !take(pool, key));
}

export type VariantDifferences = {
  ingredientIds: Set<string>;
  stepIds: Set<string>;
};

const ingredientKey = (i: DetailVariant["ingredients"][number]) =>
  JSON.stringify([
    norm(i.ingredient_name),
    norm(i.amount),
    norm(i.unit),
    norm(i.preparation),
  ]);

/** Match steps in sequence so inserted steps do not mark every later step. */
function differingSteps(a: string[], b: string[]): [boolean[], boolean[]] {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] =
        a[i] === b[j]
          ? 1 + lengths[i + 1][j + 1]
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const left = a.map(() => true);
  const right = b.map(() => true);
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      left[i++] = false;
      right[j++] = false;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return [left, right];
}

/**
 * Display-only comparison of two variants. A row "differs" when the other
 * variant has no row with the same stored content. Nothing is persisted and
 * no wording is changed; with a single variant there is nothing to compare.
 */
export function deriveVariantDifferences(
  perfect: DetailVariant | undefined,
  house: DetailVariant | undefined,
): Record<"perfect" | "house", VariantDifferences> {
  const empty = (): VariantDifferences => ({
    ingredientIds: new Set(),
    stepIds: new Set(),
  });
  const result = { perfect: empty(), house: empty() };
  if (!perfect || !house) return result;

  const sides = [
    ["perfect", perfect, house],
    ["house", house, perfect],
  ] as const;
  for (const [name, own, other] of sides) {
    differing(
      own.ingredients.map(ingredientKey),
      other.ingredients.map(ingredientKey),
    ).forEach(
      (flag, index) =>
        flag && result[name].ingredientIds.add(own.ingredients[index].id),
    );
  }
  const [perfectSteps, houseSteps] = differingSteps(
    perfect.steps.map((s) => norm(s.instruction)),
    house.steps.map((s) => norm(s.instruction)),
  );
  perfectSteps.forEach(
    (flag, index) =>
      flag && result.perfect.stepIds.add(perfect.steps[index].id),
  );
  houseSteps.forEach(
    (flag, index) => flag && result.house.stepIds.add(house.steps[index].id),
  );
  return result;
}

export type PresentationField = "glass" | "garnish" | "rim";

export type PresentationSpec = {
  variant: "perfect" | "house";
  label: string;
  glass: string | null;
  garnish: string | null;
  rim: string | null;
  notes: string | null;
};

export type PresentationData = {
  /** "shared": one block; "split": Perfect and House differ. */
  mode: "shared" | "split";
  specs: PresentationSpec[];
  /** Fields whose value differs between Perfect and House (split mode only). */
  differing: Set<PresentationField | "notes">;
};

function joinText(...parts: Array<string | null | undefined>): string | null {
  return (
    parts
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" · ") || null
  );
}

function specFor(v: DetailVariant): PresentationSpec {
  const garnish = [...v.garnishes]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => joinText(g.name, g.notes))
    .filter(Boolean)
    .join(", ");
  return {
    variant: v.variant === "house" ? "house" : "perfect",
    label: v.variant === "house" ? "House" : "Perfect",
    glass: joinText(v.glass, v.glass_notes),
    garnish: garnish || null,
    rim: joinText(v.rim_type, v.rim_notes),
    notes: v.presentation_notes?.trim() || null,
  };
}

/**
 * Final Presentation specs come only from persisted variant fields. When
 * Perfect and House carry equivalent specs they are shown once.
 */
export function derivePresentation(
  variants: DetailVariant[],
): PresentationData {
  const specs = variants.map(specFor);
  const differing = new Set<PresentationField | "notes">();
  if (specs.length === 2) {
    for (const field of ["glass", "garnish", "rim", "notes"] as const) {
      if (norm(specs[0][field]) !== norm(specs[1][field])) differing.add(field);
    }
  }
  return {
    mode: differing.size > 0 ? "split" : "shared",
    specs: differing.size > 0 ? specs : specs.slice(0, 1),
    differing,
  };
}
