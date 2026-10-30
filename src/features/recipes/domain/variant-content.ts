/** Empty rows remain meaningful here so validation never silently drops input. */
export function variantHasPersistedContent(variant: {
  method: string | null;
  rim_type: string | null;
  rim_notes: string | null;
  glass: string | null;
  glass_notes: string | null;
  presentation_notes: string | null;
  tips: string | null;
  batch_notes: string | null;
  ingredients: readonly unknown[];
  steps: readonly unknown[];
  garnishes: readonly unknown[];
}): boolean {
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
    ].some((value) => value?.trim()) ||
    variant.ingredients.length > 0 ||
    variant.steps.length > 0 ||
    variant.garnishes.length > 0
  );
}
