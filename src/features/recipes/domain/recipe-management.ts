import { z } from "zod";

export const managementCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  is_active: z.boolean(),
  is_fallback: z.boolean(),
  display_order: z.number(),
});
export type ManagementCategory = z.infer<typeof managementCategorySchema>;
export type ManagementResult<T = { id: string; version: number }> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      kind?: "validation" | "duplicate" | "stale" | "permission" | "unknown";
      sessionInvalid?: true;
    };
export const categoryCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("save"),
      id: z.uuid().nullable(),
      version: z.number().int().positive().nullable(),
      name: z.string().trim().min(1).max(80),
    })
    .refine((v) => (v.id === null) === (v.version === null)),
  z.object({
    operation: z.literal("active"),
    id: z.uuid(),
    version: z.number().int().positive(),
    active: z.boolean(),
  }),
  z
    .object({
      operation: z.literal("reorder"),
      ids: z.array(z.uuid()).min(1).max(40),
    })
    .refine((v) => new Set(v.ids).size === v.ids.length),
]);
export type CategoryCommand = z.infer<typeof categoryCommandSchema>;
