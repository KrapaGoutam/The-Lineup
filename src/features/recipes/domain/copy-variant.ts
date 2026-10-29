import type { Variant } from "./recipe-editor-state";

/** Rows count as content even when their fields are still blank. */
export function variantHasContent(variant: Variant | null): boolean {
  if (!variant) return false;
  return (
    [
      variant.method,
      variant.rim_type,
      variant.rim_notes,
      variant.glass,
      variant.glass_notes,
      variant.presentation_notes,
      variant.tips,
      variant.batch_notes,
    ].some((value) => value.trim().length > 0) ||
    variant.ingredients.length > 0 ||
    variant.steps.length > 0 ||
    variant.garnishes.length > 0
  );
}

/** Copy current form values, assigning independent client-only row keys. */
export function copyVariant(source: Variant, key: () => string): Variant {
  return {
    ...source,
    ingredients: source.ingredients.map((row) => ({ ...row, key: key() })),
    steps: source.steps.map((row) => ({ ...row, key: key() })),
    garnishes: source.garnishes.map((row) => ({ ...row, key: key() })),
  };
}
