import { parseCsv } from "@/lib/csv/read";

import {
  IMPORT_FIELD_LABELS,
  mapHeaders,
  type HeaderMapping,
  type ImportField,
} from "./import-columns";
import {
  buildImportPlan,
  type ImportCatalog,
  type ImportChoices,
  type ImportOptions,
  type ImportPlan,
} from "./import-plan";
import {
  fingerprintPlan,
  toStagedPlan,
  type ImportSelection,
  type StagedPlan,
} from "./import-stage";

/**
 * The one path from a file to a plan to a staged plan. The server action and
 * demo mode both call these, so what the person previews and what is
 * committed are computed by the same code.
 */

/** Everything the plan depends on besides the catalog. */
export type ImportRequest = {
  /** The file's text (already decoded). */
  csv: string;
  reason: ImportOptions["reason"];
  /** The manager's own column mapping, by file column index. */
  mapping: Readonly<Record<number, ImportField | null>>;
  choices: ImportChoices;
};

export type PreviewResult =
  | {
      ok: true;
      header: HeaderMapping;
      plan: ImportPlan;
      /** Identifies this exact plan; sent back at confirm. */
      fingerprint: string;
    }
  | { ok: false; error: string; header: HeaderMapping | null };

export function planImport(
  request: ImportRequest,
  catalog: ImportCatalog,
): PreviewResult {
  const parsed = parseCsv(request.csv);
  if (!parsed.ok) return { ok: false, error: parsed.error, header: null };

  const header = mapHeaders(parsed.header.cells, request.mapping);
  if (header.missing.length > 0) {
    const names = header.missing.map((f) => IMPORT_FIELD_LABELS[f]).join(", ");
    return {
      ok: false,
      header,
      error: `The file needs these columns: ${names}. Match them to a column below, or add them to the file.`,
    };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, header, error: "The file has a header but no rows." };
  }

  const plan = buildImportPlan(parsed.rows, header, catalog, {
    reason: request.reason,
    choices: request.choices,
  });
  return { ok: true, header, plan, fingerprint: fingerprintPlan(plan) };
}

export type CommitPrep =
  | { ok: true; staged: StagedPlan; plan: ImportPlan }
  | {
      ok: false;
      /** "changed": the plan is no longer what was reviewed. "invalid": it cannot be committed. */
      kind: "changed" | "invalid";
      error: string;
    };

/**
 * Re-plans the same file against the catalog as it is NOW, and only if that is
 * still the plan the person reviewed (same fingerprint) builds the staged plan
 * for their selection. The browser never supplies the plan to commit.
 */
export function prepareCommit(
  request: ImportRequest,
  selection: ImportSelection,
  reviewedFingerprint: string,
  catalog: ImportCatalog,
): CommitPrep {
  const preview = planImport(request, catalog);
  if (!preview.ok) return { ok: false, kind: "invalid", error: preview.error };
  if (preview.fingerprint !== reviewedFingerprint) {
    return {
      ok: false,
      kind: "changed",
      error:
        "The inventory changed since you previewed this file. Review the updated preview before importing.",
    };
  }
  const { staged, unresolved } = toStagedPlan(preview.plan, selection, catalog);
  if (unresolved) {
    return {
      ok: false,
      kind: "invalid",
      error:
        "Choose whether each highlighted name matches an existing one or is new, before importing.",
    };
  }
  if (staged.rows.length === 0) {
    return {
      ok: false,
      kind: "invalid",
      error: "There is nothing selected to import.",
    };
  }
  return { ok: true, staged, plan: preview.plan };
}
