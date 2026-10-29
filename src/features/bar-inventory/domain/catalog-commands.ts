import { z } from "zod";

import { UNIT_LABEL_MAX, UNIT_TYPES } from "./inventory-types";
import { ADJUSTMENT_REASONS } from "./stock-rules";
import { viewPayloadSchema } from "./saved-views";

const uuid = z.string().uuid();
const version = z.number().int().min(1);
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((value) => (value && value.trim() !== "" ? value : null));

export const productInputSchema = z.object({
  vendorId: uuid,
  name: z.string().max(400),
  categoryId: uuid.nullable(),
  subcategoryId: uuid.nullable(),
  size: optionalText(120),
  unitType: z.enum(UNIT_TYPES),
  unitLabel: optionalText(UNIT_LABEL_MAX * 4),
  sku: optionalText(180),
  notes: optionalText(1500),
});

/**
 * Every catalog write the UI can request. The server action validates this
 * shape, then calls the matching trusted RPC; the database re-validates and
 * is the authority (these limits only bound the request size).
 */
export const catalogCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("savedViewSave"),
    id: uuid.nullable(),
    name: z.string().trim().min(1).max(80),
    payload: viewPayloadSchema,
    isDefault: z.boolean(),
    expectedVersion: version.nullable(),
  }),
  z.object({
    type: z.literal("savedViewDelete"),
    id: uuid,
    expectedVersion: version,
  }),
  z.object({
    type: z.literal("bulkCount"),
    rows: z
      .array(
        z.object({
          productId: uuid,
          expectedVersion: version,
          onHand: z
            .number()
            .min(0)
            .max(9999999999.99)
            .multipleOf(0.01)
            .nullable(),
          backup: z
            .number()
            .min(0)
            .max(9999999999.99)
            .multipleOf(0.01)
            .nullable(),
        }),
      )
      .min(1)
      .max(5000),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: optionalText(500),
  }),
  z.object({
    type: z.literal("dateLotSave"),
    id: uuid.nullable(),
    productId: uuid,
    quantity: z.number().min(0).max(9999999999.99).multipleOf(0.01).nullable(),
    manufacture: z
      .object({ date: z.iso.date(), precision: z.enum(["day", "month"]) })
      .nullable(),
    expiration: z
      .object({ date: z.iso.date(), precision: z.enum(["day", "month"]) })
      .nullable(),
    notes: optionalText(500),
    active: z.boolean(),
    expectedVersion: version.nullable(),
  }),
  z.object({
    type: z.literal("freshnessRuleSave"),
    id: uuid.nullable(),
    subcategoryId: uuid,
    trackingEnabled: z.boolean(),
    maximumMonths: z.number().int().min(1).max(120),
    warningMonths: z.number().int().min(0).max(119),
    active: z.boolean(),
    expectedVersion: version.nullable(),
  }),
  z.object({
    type: z.literal("vendorCreate"),
    name: z.string().max(400),
    notes: optionalText(1500),
  }),
  z.object({
    type: z.literal("vendorUpdate"),
    id: uuid,
    name: z.string().max(400),
    notes: optionalText(1500),
    expectedVersion: version,
  }),
  z.object({
    type: z.literal("vendorSetActive"),
    id: uuid,
    active: z.boolean(),
    expectedVersion: version,
  }),
  z.object({ type: z.literal("categoryCreate"), name: z.string().max(400) }),
  z.object({
    type: z.literal("categoryUpdate"),
    id: uuid,
    name: z.string().max(400),
    expectedVersion: version,
  }),
  z.object({
    type: z.literal("categorySetActive"),
    id: uuid,
    active: z.boolean(),
    expectedVersion: version,
  }),
  z.object({
    type: z.literal("subcategoryCreate"),
    categoryId: uuid,
    name: z.string().max(400),
  }),
  z.object({
    type: z.literal("subcategoryUpdate"),
    id: uuid,
    categoryId: uuid,
    name: z.string().max(400),
    expectedVersion: version,
  }),
  z.object({
    type: z.literal("subcategorySetActive"),
    id: uuid,
    active: z.boolean(),
    expectedVersion: version,
  }),
  z.object({ type: z.literal("productCreate"), input: productInputSchema }),
  z.object({
    type: z.literal("productUpdate"),
    id: uuid,
    input: productInputSchema,
    expectedVersion: version,
  }),
  z.object({
    type: z.literal("productSetActive"),
    id: uuid,
    active: z.boolean(),
    expectedVersion: version,
  }),
  // set: absolute counts (null = leave that field), needs expectedVersion.
  // delta: relative change, no version needed (commutative).
  z.object({
    type: z.literal("stockAdjust"),
    productId: uuid,
    mode: z.enum(["set", "delta"]),
    onHand: z.number().nullable(),
    backup: z.number().nullable(),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: optionalText(1500),
    expectedVersion: version.nullable(),
  }),
  z.object({
    type: z.literal("stockSetLevels"),
    productId: uuid,
    cutoff: z.number().nullable(),
    warning: z.number().nullable(),
    par: z.number().nullable(),
    expectedVersion: version,
  }),
]);

export type CatalogCommand = z.infer<typeof catalogCommandSchema>;
