import { z } from "zod";

import {
  ASSIGNMENT_MODES,
  DUE_WINDOWS,
  RECURRENCE_END_TYPES,
  RECURRENCE_FREQUENCIES,
  TASK_PRIORITIES,
} from "./task-types";

/**
 * The write vocabulary of Tasks. One discriminated union shared by the
 * Server Action (validated, then mapped 1:1 onto a `public.task_*` RPC) and
 * the demo-mode engine (which re-implements the same rules in memory).
 */
const idSchema = z.string().trim().min(1).max(64);
const dateSchema = z.iso.date();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(160),
  instructions: z.string().trim().max(2000).nullable(),
  category: z.string().trim().min(1).max(40),
  priority: z.enum(TASK_PRIORITIES),
  startDate: dateSchema.nullable(),
  dueDate: dateSchema.nullable(),
  dueTime: timeSchema.nullable(),
  dueWindow: z.enum(DUE_WINDOWS).nullable(),
});
export type TaskFields = z.infer<typeof taskFieldsSchema>;

export const taskCreateSchema = taskFieldsSchema.extend({
  assignmentMode: z.enum(ASSIGNMENT_MODES),
  assigneeIds: z.array(idSchema).max(50),
  /** "Each person required": fan out into one individual task per person. */
  eachPerson: z.boolean(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const templateItemSchema = z.object({
  title: z.string().trim().min(1, "Every item needs a title.").max(160),
  instructions: z.string().trim().max(2000).nullable(),
  category: z.string().trim().min(1).max(40),
  priority: z.enum(TASK_PRIORITIES),
  assignmentMode: z.enum(ASSIGNMENT_MODES),
  assigneeIds: z.array(idSchema).max(50),
  dueWindow: z.enum(DUE_WINDOWS).nullable(),
  dueTime: timeSchema.nullable(),
});

export const templateInputSchema = z.object({
  kind: z.enum(["opening", "closing"]),
  name: z.string().trim().min(1, "Give the checklist a name.").max(80),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Choose at least one day.")
    .max(7),
  active: z.boolean(),
  items: z.array(templateItemSchema).max(100),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const seriesInputSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(160),
  instructions: z.string().trim().max(2000).nullable(),
  category: z.string().trim().min(1).max(40),
  priority: z.enum(TASK_PRIORITIES),
  assignmentMode: z.enum(ASSIGNMENT_MODES),
  assigneeIds: z.array(idSchema).max(50),
  dueTime: timeSchema.nullable(),
  dueWindow: z.enum(DUE_WINDOWS).nullable(),
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  startsOn: dateSchema,
  endType: z.enum(RECURRENCE_END_TYPES),
  endsOn: dateSchema.nullable(),
  maxOccurrences: z.number().int().min(1).max(1000).nullable(),
});
export type SeriesInput = z.infer<typeof seriesInputSchema>;

export const taskCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), input: taskCreateSchema }),
  z.object({
    type: z.literal("update"),
    taskId: idSchema,
    input: taskFieldsSchema,
  }),
  z.object({
    type: z.literal("assign"),
    taskId: idSchema,
    assignmentMode: z.enum(ASSIGNMENT_MODES),
    assigneeIds: z.array(idSchema).max(50),
  }),
  z.object({
    type: z.literal("setStatus"),
    taskId: idSchema,
    status: z.enum(["open", "in_progress", "blocked"]),
    reason: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    type: z.literal("complete"),
    taskId: idSchema,
    note: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({ type: z.literal("reopen"), taskId: idSchema }),
  z.object({
    type: z.literal("cancel"),
    taskId: idSchema,
    reason: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({ type: z.literal("seriesCreate"), input: seriesInputSchema }),
  z.object({
    type: z.literal("seriesUpdate"),
    ruleId: idSchema,
    input: seriesInputSchema,
  }),
  z.object({ type: z.literal("seriesStop"), ruleId: idSchema }),
  z.object({
    type: z.literal("notificationsRead"),
    ids: z.array(z.number().int()).max(200).nullable(),
  }),
  z.object({
    type: z.literal("templateSave"),
    templateId: idSchema.nullable(),
    input: templateInputSchema,
  }),
  z.object({
    type: z.literal("templateSetActive"),
    templateId: idSchema,
    active: z.boolean(),
  }),
  z.object({
    type: z.literal("carryForward"),
    taskIds: z.array(idSchema).min(1).max(100),
    newDueDate: dateSchema,
  }),
]);
export type TaskCommand = z.infer<typeof taskCommandSchema>;

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
