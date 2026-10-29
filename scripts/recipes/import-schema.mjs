import { z } from "zod";

const text = (max) => z.string().trim().min(1).max(max);
const optional = (max) => text(max).nullable().optional();
const ingredient = z
  .object({
    ingredient_name: text(120),
    amount: optional(40),
    unit: optional(30),
    preparation: optional(120),
  })
  .strict();
const step = z.object({ instruction: text(500) }).strict();
const garnish = z.object({ name: text(120), notes: optional(200) }).strict();
const importWarning = z
  .object({
    id: text(120),
    message: text(1000),
    status: z.enum(["unresolved", "resolved", "approved"]),
    resolution: optional(1000),
    approved_by: optional(200),
    approved_on: z.iso.date().optional(),
  })
  .strict()
  .superRefine((warning, ctx) => {
    if (
      warning.status !== "unresolved" &&
      (!warning.resolution || !warning.approved_by || !warning.approved_on)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Resolved/approved warnings require resolution and owner approval",
      });
  });
const variant = z
  .object({
    method: optional(60),
    rim_type: optional(40),
    rim_notes: optional(200),
    glass: optional(40),
    glass_notes: optional(200),
    presentation_notes: optional(500),
    tips: optional(1000),
    batch_notes: optional(1000),
    ingredients: z.array(ingredient).max(30),
    steps: z.array(step).max(20),
    garnishes: z.array(garnish).max(10),
  })
  .strict();
const recipe = z
  .object({
    recipe_number: z.number().int().min(1).max(9999),
    name: text(120),
    category_slug: text(80),
    alternate_name: optional(120),
    description: optional(200),
    base_spirit: optional(40),
    is_alcoholic: z.boolean(),
    is_popular: z.boolean(),
    is_menu_item: z.boolean(),
    variants: z
      .object({
        perfect: variant.nullable().optional(),
        house: variant.nullable().optional(),
      })
      .strict()
      .refine((v) => v.perfect || v.house, "At least one variant is required"),
    source_ref: optional(500),
    source_notes: optional(1000),
    import_warnings: z.array(importWarning).max(40).optional(),
  })
  .strict();
const category = z
  .object({
    name: text(80),
    slug: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    display_order: z.number().int().min(0).max(100000),
    is_fallback: z.boolean().optional(),
  })
  .strict();
export const importSchema = z
  .object({
    format: z.literal("the-lineup.bar-recipes.import"),
    version: z.literal(1),
    source: z
      .object({
        title: text(200),
        document: text(200),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i),
        approved_by: text(200),
        approved_on: z.iso.date(),
        corrections: z.array(
          z
            .object({
              recipe_number: z.number().int(),
              field: text(120),
              note: text(1000),
              approved_on: z.iso.date(),
            })
            .strict(),
        ),
      })
      .strict(),
    categories: z.array(category).max(40),
    recipes: z.array(recipe).max(2000),
  })
  .strict()
  .superRefine((data, ctx) => {
    const unique = (items, label) => {
      if (new Set(items).size !== items.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${label}` });
    };
    unique(
      data.categories.map((c) => c.slug),
      "category slug",
    );
    unique(
      data.recipes.map((r) => r.recipe_number),
      "recipe number",
    );
    if (data.categories.filter((c) => c.is_fallback).length > 1)
      ctx.addIssue({
        code: "custom",
        message: "More than one fallback category",
      });
  });
