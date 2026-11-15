"use server";

import { z } from "zod";

import {
  getInventoryActor,
  type InventoryActor,
} from "../data/inventory-actor";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import { readWorkbookNode } from "@/lib/xlsx/read-node";
import { readWorkbook, type SheetInfo } from "@/lib/xlsx/workbook";

import { getCatalogSnapshot } from "../data/catalog-data";
import { IMPORT_FIELDS, type HeaderMapping } from "../domain/import-columns";
import type { ImportPlan } from "../domain/import-plan";
import { planImport, prepareCommit } from "../domain/import-run";
import { friendlyDbMessage } from "../domain/db-error";
import type { Database } from "@/types/database.generated";
import type {
  ImportCommitResult,
  ImportConflict,
} from "../domain/import-stage";
import type { ImportBatchView } from "../domain/inventory-types";
import { parseCsv } from "@/lib/csv/read";
import {
  buildDateGroupImportPlan,
  fingerprintDateGroupPlan,
  mapDateGroupHeaders,
  DATE_GROUP_IMPORT_FIELDS,
  type DateGroupHeaderMapping,
  type DateGroupImportField,
  type DateGroupPlan,
} from "../domain/import-date-groups";

// A "use server" file may only export async functions (and types): the
// constants below are deliberately private.

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** A little over the 5 MB file cap, to allow for JSON escaping. */
const MAX_CSV_CHARS = 6_000_000;
const MAX_ROWS = 5000;

const requestSchema = z.object({
  restaurantSlug: slugSchema,
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  reason: z.enum(["stock_count", "delivery_restock"]),
  // File column index -> field, or null to ignore the column.
  mapping: z
    .record(z.string().regex(/^\d{1,2}$/), z.enum(IMPORT_FIELDS).nullable())
    .default({}),
  choices: z
    .object({
      vendors: z.record(z.string().max(200), z.string().max(60)).optional(),
      categories: z.record(z.string().max(200), z.string().max(60)).optional(),
      subcategories: z
        .record(z.string().max(300), z.string().max(60))
        .optional(),
    })
    .default({}),
  expectedContext: z.unknown().optional(),
});

// A row number is the line in the file, blank lines included, so it can exceed
// the 5,000-row cap; it is bounded by the file's 6M-character limit instead.
const MAX_ROW_NUMBER = 6_000_000;

const commitSchema = requestSchema.extend({
  filename: z.string().trim().min(1).max(255),
  /** Where the rows came from; recorded on the batch. */
  format: z.enum(["csv", "xlsx"]).default("csv"),
  sheet: z.string().max(100).nullable().default(null),
  /** Chosen by the browser per confirm attempt, so a retry or double click is the same attempt. */
  requestId: z.string().uuid(),
  fingerprint: z.string().regex(/^[0-9a-f]{1,16}$/),
  excluded: z.array(z.number().int().min(1).max(MAX_ROW_NUMBER)).max(MAX_ROWS),
  approved: z.array(z.number().int().min(1).max(MAX_ROW_NUMBER)).max(MAX_ROWS),
});

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ImportPreviewActionResult =
  | {
      ok: true;
      header: HeaderMapping;
      plan: ImportPlan;
      fingerprint: string;
    }
  | {
      ok: false;
      error: string;
      header: HeaderMapping | null;
      sessionInvalid?: true;
      contextStale?: true;
    };

export type ImportCommitActionResult =
  | { ok: true; batchId: string; result: ImportCommitResult }
  | {
      ok: false;
      kind: "conflict";
      error: string;
      conflicts: ImportConflict[];
    }
  | {
      ok: false;
      kind: "changed" | "invalid" | "error";
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

export type WorkbookActionResult =
  | {
      ok: true;
      sheets: SheetInfo[];
      selected: string;
      /** The chosen sheet as CSV text: from here on it is the CSV import. */
      csv: string;
      warnings: string[];
    }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

export type ImportBatchesActionResult =
  | { ok: true; batches: ImportBatchView[] }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true };

const toRequest = (input: z.infer<typeof requestSchema>) => ({
  csv: input.csv,
  reason: input.reason,
  mapping: Object.fromEntries(
    Object.entries(input.mapping).map(([k, v]) => [Number(k), v]),
  ),
  choices: input.choices,
});

const STALE_CONTEXT_MESSAGE =
  "Your active restaurant or location changed in another tab. Please reload before saving.";

async function resolveManager(
  supabase: Supabase,
  restaurantSlug: string,
  expectedContext?: unknown,
): Promise<
  | {
      ok: true;
      organizationId: string;
      locationId: string;
      actor: InventoryActor;
    }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true }
> {
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;
  const actor = await getInventoryActor(restaurantSlug);
  if (!actor) {
    return {
      ok: false,
      error: "You are not authorized to manage Bar Inventory at this location.",
    };
  }
  const expectationRaw =
    (expectedContext as Record<string, unknown> | undefined)?.expectation ??
    expectedContext;
  const outcome = await assertWorkspaceExpectation(
    expectationRaw,
    {
      profileId: actor.viewer.profileId,
      organizationId: actor.organizationId,
    },
    {
      resolveLocation: async () => ({
        id: actor.scope.locationId,
        time_zone: actor.scope.timeZone ?? "UTC",
      }),
    },
  );
  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.code === "invalid"
          ? "That request is invalid."
          : STALE_CONTEXT_MESSAGE,
      contextStale: true,
    };
  }
  const blocked = await guardModule({
    module: "bar_inventory",
    organizationId: actor.organizationId,
    location: { id: actor.scope.locationId },
  });
  if (blocked) return blocked;
  return {
    ok: true,
    organizationId: actor.organizationId,
    locationId: actor.scope.locationId,
    actor,
  };
}

const caller = resolveManager;

/**
 * Reads an .xlsx the person chose and hands back the selected sheet as CSV
 * text, after the bounded pre-flight guard. Nothing is written. From here the
 * file is an ordinary CSV: preview and commit are the same code as for a CSV.
 */
export async function readWorkbookAction(input: {
  restaurantSlug: string;
  base64: string;
  sheet: string | null;
  expectedContext?: unknown;
}): Promise<WorkbookActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      // 5 MB of file is about 6.7 million base64 characters.
      base64: z.string().min(1).max(7_000_000),
      sheet: z.string().max(100).nullable(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };

  const supabase = await createClient();
  const who = await caller(
    supabase,
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!who.ok) return who;

  const bytes = new Uint8Array(Buffer.from(parsed.data.base64, "base64"));
  return readWorkbook(bytes, readWorkbookNode, { sheet: parsed.data.sheet });
}

/**
 * Reads and plans a file against the CURRENT catalog. Writes nothing: this is
 * the Preview. The same plan, recomputed, is what a commit is checked against.
 */
export async function previewImportAction(
  input: z.input<typeof requestSchema>,
): Promise<ImportPreviewActionResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That request is invalid.", header: null };
  }
  const supabase = await createClient();
  const who = await caller(
    supabase,
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!who.ok) return { ...who, header: null };

  const snapshot = await getCatalogSnapshot(who.organizationId, who.locationId);
  if (!snapshot) {
    return {
      ok: false,
      error: "Bar Inventory could not be loaded.",
      header: null,
    };
  }
  return planImport(toRequest(parsed.data), snapshot);
}

/**
 * Confirms an import: re-plans the same file against the catalog as it is NOW,
 * checks it is still the plan the person reviewed, stages that plan and
 * commits it in one atomic database call. The browser never sends a plan.
 */
export async function commitImportAction(
  input: z.input<typeof commitSchema>,
): Promise<ImportCommitActionResult> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, kind: "invalid", error: "That request is invalid." };
  }
  const data = parsed.data;
  const supabase = await createClient();
  const who = await caller(supabase, data.restaurantSlug, data.expectedContext);
  if (!who.ok) return { ...who, kind: "error" };

  const snapshot = await getCatalogSnapshot(who.organizationId, who.locationId);
  if (!snapshot) {
    return {
      ok: false,
      kind: "error",
      error: "Bar Inventory could not be loaded.",
    };
  }

  const prep = prepareCommit(
    toRequest(data),
    { excluded: data.excluded, approved: data.approved },
    data.fingerprint,
    snapshot,
  );
  if (!prep.ok) return { ok: false, kind: prep.kind, error: prep.error };

  // PostgREST needs every named argument: explicit nulls, never omitted.
  const staged = await supabase.rpc("inventory_import_stage", {
    p_organization_id: who.organizationId,
    p_location_id: who.locationId,
    p_request_id: data.requestId,
    p_filename: data.filename,
    p_format: data.format,
    p_sheet: data.format === "xlsx" ? data.sheet : null,
    p_reason: data.reason,
    p_plan: prep.staged,
  });
  if (staged.error || typeof staged.data !== "string") {
    return {
      ok: false,
      kind: "error",
      error: friendlyDbMessage(staged.error ?? {}),
    };
  }

  const committed = await supabase.rpc("inventory_import_commit", {
    p_organization_id: who.organizationId,
    p_location_id: who.locationId,
    p_batch_id: staged.data,
  });
  if (committed.error) {
    return {
      ok: false,
      kind: "error",
      error: friendlyDbMessage(committed.error),
    };
  }

  const outcome = committed.data as
    | ({ ok: true } & ImportCommitResult)
    | { ok: false; conflicts: ImportConflict[] };
  if (!outcome.ok) {
    return {
      ok: false,
      kind: "conflict",
      conflicts: outcome.conflicts,
      error:
        "Some items changed since you previewed this file, so nothing was imported. Preview it again.",
    };
  }
  const { ok: _ok, ...result } = outcome;
  void _ok;
  return { ok: true, batchId: staged.data, result };
}

type BatchRow = {
  id: string;
  filename: string;
  format: "csv" | "xlsx";
  sheet: string | null;
  reason: ImportBatchView["reason"];
  status: ImportBatchView["status"];
  rows_in_file: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  vendors_created: number;
  categories_created: number;
  subcategories_created: number;
  actor_profile_id: string;
  created_at: string;
  committed_at: string | null;
};

/** The location's most recent import batches (RLS decides what comes back). */
export async function listImportBatchesAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<ImportBatchesActionResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const supabase = await createClient();
  const who = await caller(
    supabase,
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!who.ok) return who;

  const [{ data, error }, roster] = await Promise.all([
    supabase
      .from("inventory_import_batches")
      .select(
        "id, filename, format, sheet, reason, status, rows_in_file, created_count, updated_count, skipped_count, error_count, vendors_created, categories_created, subcategories_created, actor_profile_id, created_at, committed_at",
      )
      .eq("organization_id", who.organizationId)
      .eq("location_id", who.locationId)
      .order("created_at", { ascending: false })
      .limit(50)
      .overrideTypes<BatchRow[], { merge: false }>(),
    getOrganizationRoster(who.organizationId),
  ]);
  if (error || !data) {
    console.error("listImportBatchesAction", error);
    return { ok: false, error: "Import history could not be loaded." };
  }
  const names = new Map(roster.map((member) => [member.id, member.name]));
  return {
    ok: true,
    batches: data.map(
      (row): ImportBatchView => ({
        id: row.id,
        filename: row.filename,
        format: row.format,
        sheet: row.sheet,
        reason: row.reason,
        status: row.status,
        rowsInFile: row.rows_in_file,
        created: row.created_count,
        updated: row.updated_count,
        skipped: row.skipped_count,
        errors: row.error_count,
        vendorsCreated: row.vendors_created,
        categoriesCreated: row.categories_created,
        subcategoriesCreated: row.subcategories_created,
        actorName: names.get(row.actor_profile_id) ?? null,
        createdAt: row.created_at,
        committedAt: row.committed_at,
      }),
    ),
  };
}

const dateGroupRequestSchema = z.object({
  restaurantSlug: slugSchema,
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  mapping: z
    .record(
      z.string().regex(/^\d{1,2}$/),
      z.enum(DATE_GROUP_IMPORT_FIELDS).nullable(),
    )
    .default({}),
  expectedContext: z.unknown().optional(),
});

const dateGroupCommitSchema = dateGroupRequestSchema.extend({
  filename: z.string().trim().min(1).max(255),
  requestId: z.string().uuid(),
  fingerprint: z.string().regex(/^[0-9a-zA-Z_-]{1,32}$/),
  excluded: z.array(z.number().int().min(1).max(MAX_ROW_NUMBER)).max(MAX_ROWS),
});

export type DateGroupPreviewActionResult =
  | {
      ok: true;
      header: DateGroupHeaderMapping;
      plan: DateGroupPlan;
      fingerprint: string;
    }
  | {
      ok: false;
      error: string;
      header: DateGroupHeaderMapping | null;
      sessionInvalid?: true;
      contextStale?: true;
    };

export type DateGroupCommitActionResult =
  | {
      ok: true;
      result: {
        created: number;
        updated: number;
        skipped: number;
        errors: number;
        /** True when this was a retry of an import that had already been saved. */
        replayed?: boolean;
      };
    }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

export async function previewDateGroupImportAction(
  input: z.input<typeof dateGroupRequestSchema>,
): Promise<DateGroupPreviewActionResult> {
  const parsed = dateGroupRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That request is invalid.", header: null };
  }
  const supabase = await createClient();
  const who = await caller(
    supabase,
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!who.ok) return { ...who, header: null };

  const snapshot = await getCatalogSnapshot(who.organizationId, who.locationId);
  if (!snapshot) {
    return {
      ok: false,
      error: "Bar Inventory could not be loaded.",
      header: null,
    };
  }

  const csvResult = parseCsv(parsed.data.csv);
  if (!csvResult.ok) {
    return { ok: false, error: csvResult.error, header: null };
  }

  const mappingOverride: Record<number, DateGroupImportField | null> = {};
  for (const [colIdx, field] of Object.entries(parsed.data.mapping)) {
    mappingOverride[Number(colIdx)] = field;
  }

  const header = mapDateGroupHeaders(csvResult.header.cells, mappingOverride);
  if (header.missing.length > 0) {
    return {
      ok: false,
      header,
      error: `Missing required columns: ${header.missing.join(", ")}.`,
    };
  }

  const plan = buildDateGroupImportPlan(csvResult.rows, header, snapshot);
  const fingerprint = fingerprintDateGroupPlan(plan);
  return { ok: true, header, plan, fingerprint };
}

export async function commitDateGroupImportAction(
  input: z.input<typeof dateGroupCommitSchema>,
): Promise<DateGroupCommitActionResult> {
  const parsed = dateGroupCommitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That request is invalid." };
  }
  const data = parsed.data;
  const supabase = await createClient();
  const who = await caller(supabase, data.restaurantSlug, data.expectedContext);
  if (!who.ok) return who;

  const snapshot = await getCatalogSnapshot(who.organizationId, who.locationId);
  if (!snapshot) {
    return { ok: false, error: "Bar Inventory could not be loaded." };
  }

  const csvResult = parseCsv(data.csv);
  if (!csvResult.ok) {
    return { ok: false, error: csvResult.error };
  }

  const mappingOverride: Record<number, DateGroupImportField | null> = {};
  for (const [colIdx, field] of Object.entries(data.mapping)) {
    mappingOverride[Number(colIdx)] = field;
  }

  const header = mapDateGroupHeaders(csvResult.header.cells, mappingOverride);
  const plan = buildDateGroupImportPlan(csvResult.rows, header, snapshot);
  const fingerprint = fingerprintDateGroupPlan(plan);

  if (fingerprint !== data.fingerprint) {
    return {
      ok: false,
      error:
        "The inventory changed since you previewed this file. Please preview again.",
    };
  }

  const excludedSet = new Set(data.excluded);
  const rowsToApply = plan.rows.filter(
    (r) =>
      (r.action === "create" || r.action === "update") &&
      !excludedSet.has(r.rowNumber) &&
      r.productId !== null,
  );
  if (rowsToApply.length === 0) {
    return { ok: false, error: "There are no rows to import." };
  }
  const rejected = plan.summary.error;
  const skipped = plan.rows.length - rowsToApply.length - rejected;

  // ONE database call = ONE transaction: every approved row is saved or none
  // is, and the request id makes a retry (double click, dropped connection)
  // replay the original result instead of creating duplicates. Nothing here
  // touches authoritative stock or the stock ledger.
  const args = {
    p_organization_id: who.organizationId,
    p_location_id: who.locationId,
    p_request_id: data.requestId,
    p_filename: data.filename,
    p_fingerprint: fingerprint,
    p_skipped: skipped,
    p_rejected: rejected,
    p_rows: rowsToApply.map((row) => ({
      row_number: row.rowNumber,
      action: row.action,
      product_id: row.productId,
      date_group_id: row.action === "update" ? row.dateGroupId : null,
      expected_version: row.action === "update" ? row.expectedVersion : null,
      quantity: row.quantity,
      manufacture_date: row.manufacture?.date ?? null,
      manufacture_precision: row.manufacture?.precision ?? null,
      expiration_date: row.expiration?.date ?? null,
      expiration_precision: row.expiration?.precision ?? null,
      notes: row.notes,
    })),
  } satisfies {
    [K in keyof Database["public"]["Functions"]["inventory_date_group_import_commit"]["Args"]]:
      | Database["public"]["Functions"]["inventory_date_group_import_commit"]["Args"][K]
      | null;
  };
  const { data: committed, error } = await supabase.rpc(
    "inventory_date_group_import_commit",
    args,
  );
  if (error) {
    console.error("inventory_date_group_import_commit", error);
    return { ok: false, error: friendlyDbMessage(error) };
  }
  const outcome = committed as {
    created?: number;
    updated?: number;
    skipped?: number;
    rejected?: number;
    replayed?: boolean;
  } | null;
  return {
    ok: true,
    result: {
      created: outcome?.created ?? 0,
      updated: outcome?.updated ?? 0,
      skipped: outcome?.skipped ?? skipped,
      errors: outcome?.rejected ?? rejected,
      replayed: outcome?.replayed === true,
    },
  };
}
