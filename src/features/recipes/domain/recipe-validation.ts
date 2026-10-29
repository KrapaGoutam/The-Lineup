import { z } from "zod";
function text(
  limit: number,
  required: true,
  multiline?: boolean,
): z.ZodType<string>;
function text(
  limit: number,
  required?: false,
  multiline?: boolean,
): z.ZodType<string | null>;
function text(
  limit: number,
  required = false,
  multiline = false,
): z.ZodType<string | null> {
  const value = z
    .string()
    .transform((v) => (multiline ? v.trim() : v.trim().replace(/\s+/g, " ")))
    .pipe(z.string().max(limit, `Use ${limit} characters or fewer.`));
  return required
    ? value.refine((v) => v.length > 0, "This field is required.")
    : value.nullable();
}
const variant = z.strictObject({
  method: text(60),
  rim_type: text(40),
  rim_notes: text(200),
  glass: text(40),
  glass_notes: text(200),
  presentation_notes: text(500),
  tips: text(1000, false, true),
  batch_notes: text(1000, false, true),
  ingredients: z
    .array(
      z.strictObject({
        ingredient_name: text(120, true),
        amount: text(40),
        unit: text(30),
        preparation: text(120),
      }),
    )
    .max(30),
  steps: z
    .array(z.strictObject({ instruction: text(500, true, true) }))
    .max(20),
  garnishes: z
    .array(z.strictObject({ name: text(120, true), notes: text(200) }))
    .max(10),
});
export const recipePayloadSchema = z.strictObject({
  category_id: z.string().min(1, "Choose a category."),
  recipe_number: z
    .number()
    .int("Enter a whole number.")
    .min(1, "Use a number from 1 to 9999.")
    .max(9999, "Use a number from 1 to 9999."),
  name: text(120, true),
  alternate_name: text(120),
  description: text(200, false, true),
  base_spirit: text(40),
  is_alcoholic: z.boolean(),
  is_popular: z.boolean(),
  is_menu_item: z.boolean(),
  variants: z
    .strictObject({ perfect: variant.nullable(), house: variant.nullable() })
    .refine(
      (v) => v.perfect !== null || v.house !== null,
      "At least one recipe variant is required.",
    ),
});
export type RecipePayload = z.infer<typeof recipePayloadSchema>;
export function payloadErrors(payload: unknown): Record<string, string> {
  const result = recipePayloadSchema.safeParse(payload);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}
export type SaveResult =
  | {
      ok: true;
      data: {
        id: string;
        slug: string;
        version: number;
        recipe_number: number;
      };
    }
  | {
      ok: false;
      error: string;
      kind?: "validation" | "duplicate" | "stale" | "permission" | "unknown";
      field?: string;
      sessionInvalid?: true;
    };
