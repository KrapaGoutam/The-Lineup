import { z } from "zod";

import { UNIT_LABEL_MAX, UNIT_TYPES } from "./inventory-types";

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
]);

export type CatalogCommand = z.infer<typeof catalogCommandSchema>;
