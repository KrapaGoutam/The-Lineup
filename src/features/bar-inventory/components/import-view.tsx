"use client";

import { Download, FileUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { decodeCsvBytes, parseCsv } from "@/lib/csv/read";
import { toCsv } from "@/lib/csv/write";
import { downloadFile } from "@/lib/download-file";
import { formatBusinessDateTime } from "@/lib/date-time";
import { EXPORT_MIME } from "@/lib/export/document";
import type { SheetInfo } from "@/lib/xlsx/workbook";

import type {
  ImportCommitActionResult,
  ImportPreviewActionResult,
  WorkbookActionResult,
} from "../actions/import-actions";
import { signedQuantity } from "../domain/history";
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type HeaderMapping,
  type ImportField,
} from "../domain/import-columns";
import type {
  ImportChoices,
  ImportPlan,
  NearMiss,
  PlanRow,
} from "../domain/import-plan";
import type { ImportRequest } from "../domain/import-run";
import { includedRows, type ImportSelection } from "../domain/import-stage";
import type { ImportBatchView } from "../domain/inventory-types";
import { ADJUSTMENT_REASON_LABELS } from "../domain/stock-rules";
import type { ColumnSpec } from "../domain/table-filters";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";

/** The three operations the import needs, from the server (real) or the engine (demo). */
export type ImportApi = {
  preview: (request: ImportRequest) => Promise<ImportPreviewActionResult>;
  /** Reads an .xlsx (base64) into the chosen sheet's CSV text; nothing is written. */
  readWorkbook: (input: {
    base64: string;
    sheet: string | null;
  }) => Promise<WorkbookActionResult>;
  commit: (
    request: ImportRequest & {
      filename: string;
      format: "csv" | "xlsx";
      sheet: string | null;
      requestId: string;
      fingerprint: string;
      excluded: number[];
      approved: number[];
    },
  ) => Promise<ImportCommitActionResult>;
  loadBatches: () => Promise<
    { ok: true; batches: ImportBatchView[] } | { ok: false; error: string }
  >;
};

type Source = {
  filename: string;
  /** The rows as CSV text: the file itself, or the chosen sheet of a workbook. */
  csv: string;
  warnings: string[];
  format: "csv" | "xlsx";
  sheet: string | null;
  sheets: SheetInfo[];
};
type Params = {
  reason: ImportRequest["reason"];
  mapping: Record<number, ImportField | null>;
  choices: ImportChoices;
};
type Preview = Extract<ImportPreviewActionResult, { ok: true }>;

const ACTION_LABEL = {
  create: "Create",
  update: "Update",
  skip: "Skip",
  error: "Error",
} as const;

const ACTION_TONE = {
  create: "success",
  update: "accent",
  skip: "neutral",
  error: "danger",
} as const;

const TEMPLATE = toCsv([
  IMPORT_FIELDS.map((field) => IMPORT_FIELD_LABELS[field]),
  [
    "Faust",
    "Tito's Handmade Vodka",
    "Spirits",
    "Vodka",
    "750 mL",
    "Bottle",
    "TITOS-750",
    4,
    1,
    4,
    6,
    12,
    "",
  ],
]);

const wordList = (items: string[]) => items.join(", ");

/** Bytes to base64 in chunks (a single String.fromCharCode(...bytes) overflows the stack on big files). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function changeText(row: PlanRow): string {
  if (row.action === "update") {
    return row.changes
      .map((c) =>
        c.delta !== null
          ? `${c.label} ${c.current} → ${c.imported} (${signedQuantity(c.delta)})`
          : `${c.label} ${c.current ?? "none"} → ${c.imported ?? "none"}`,
      )
      .join(" · ");
  }
  if (row.action === "create") {
    const parts = (
      [
        ["On hand", row.values.onHand],
        ["Backup", row.values.backup],
        ["Cutoff", row.values.cutoff],
        ["Warning", row.values.warning],
        ["Par", row.values.par],
      ] as const
    )
      .filter(([, value]) => value !== undefined)
      .map(([label, value]) => `${label} ${value}`);
    return parts.length > 0 ? parts.join(" · ") : "New item, counts start at 0";
  }
  return "";
}

function noteText(row: PlanRow): string {
  return [row.reason, ...row.warnings].filter(Boolean).join(" ");
}

function hasUnresolved(rows: readonly PlanRow[]): boolean {
  return rows.some((row) =>
    [row.vendor, row.category, row.subcategory].some(
      (e) => e.kind === "new" && e.needsChoice,
    ),
  );
}

/**
 * Manage → Import: upload a CSV, see exactly what it would do, then confirm.
 * Nothing is written until the person confirms; the server re-plans the same
 * file and refuses if it no longer matches what was reviewed.
 */
export function ImportView({
  api,
  timeZone,
  onImported,
}: {
  api: ImportApi;
  timeZone: string;
  onImported: () => void;
}) {
  const fileId = useId();
  const reasonId = useId();
  const sheetId = useId();
  const [source, setSource] = useState<Source | null>(null);
  const [params, setParams] = useState<Params>({
    reason: "stock_count",
    mapping: {},
    choices: {},
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problem, setProblem] = useState<{
    message: string;
    header: HeaderMapping | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const [approved, setApproved] = useState<ReadonlySet<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  // The chosen workbook, kept so another sheet can be read without re-uploading.
  const [workbook, setWorkbook] = useState<{
    filename: string;
    base64: string;
  } | null>(null);
  const [done, setDone] = useState<{
    filename: string;
    result: Extract<ImportCommitActionResult, { ok: true }>["result"];
  } | null>(null);
  const [batches, setBatches] = useState<ImportBatchView[] | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  // One id per confirm attempt: a retry or a double click is the same attempt.
  const attempt = useRef<string | null>(null);

  // The result of an import is the most consequential thing on this screen, so
  // it is announced from a live region that is always mounted (one inserted
  // together with its text is not reliably read) and focus moves to it: the
  // button that opened the confirm dialog is gone by then.
  const doneHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void api
      .loadBatches()
      .catch(
        () =>
          ({
            ok: false,
            error: "Import history could not be loaded.",
          }) as const,
      )
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setBatches(result.batches);
          setBatchError(null);
        } else setBatchError(result.error);
      });
    return () => {
      cancelled = true;
    };
  }, [api, reload]);

  const run = useCallback(
    async (next: Source, nextParams: Params) => {
      setBusy(true);
      setCommitError(null);
      try {
        const result = await api.preview({
          csv: next.csv,
          reason: nextParams.reason,
          mapping: nextParams.mapping,
          choices: nextParams.choices,
        });
        // The plan changed, so the old selection and confirm attempt are void.
        setExcluded(new Set());
        setApproved(new Set());
        attempt.current = null;
        if (result.ok) {
          setPreview(result);
          setProblem(null);
        } else {
          setPreview(null);
          setProblem({ message: result.error, header: result.header });
        }
      } catch {
        setPreview(null);
        setProblem({
          message: "That didn't work. Please try again.",
          header: null,
        });
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  /** Reads one sheet of the chosen workbook, then previews it like any CSV. */
  async function readSheet(
    filename: string,
    base64: string,
    sheet: string | null,
  ) {
    setBusy(true);
    try {
      const result = await api.readWorkbook({ base64, sheet });
      if (!result.ok) {
        setSource(null);
        setPreview(null);
        setProblem({ message: result.error, header: null });
        return;
      }
      const next: Source = {
        filename,
        csv: result.csv,
        warnings: result.warnings,
        format: "xlsx",
        sheet: result.selected,
        sheets: result.sheets,
      };
      const fresh: Params = { ...params, mapping: {}, choices: {} };
      setWorkbook({ filename, base64 });
      setSource(next);
      setParams(fresh);
      await run(next, fresh);
    } catch {
      setSource(null);
      setPreview(null);
      setProblem({
        message: "That didn't work. Please try again.",
        header: null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setDone(null);
    setWorkbook(null);
    if (/.(xls|xlsm|xlsb)$/i.test(file.name)) {
      setSource(null);
      setPreview(null);
      setProblem({
        message:
          "That is an older Excel format. In Excel, use Save As → Excel Workbook (.xlsx) or CSV, then upload that.",
        header: null,
      });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/.xlsx$/i.test(file.name)) {
      await readSheet(file.name, toBase64(bytes), null);
      return;
    }
    const decoded = decodeCsvBytes(bytes);
    if (!decoded.ok) {
      setSource(null);
      setPreview(null);
      setProblem({ message: decoded.error, header: null });
      return;
    }
    const next: Source = {
      filename: file.name,
      csv: decoded.text,
      warnings: decoded.warnings,
      format: "csv",
      sheet: null,
      sheets: [],
    };
    const fresh: Params = { ...params, mapping: {}, choices: {} };
    setSource(next);
    setParams(fresh);
    await run(next, fresh);
  }

  const update = (patch: Partial<Params>) => {
    const next = { ...params, ...patch };
    setParams(next);
    if (source) void run(source, next);
  };

  const plan: ImportPlan | null = preview?.plan ?? null;
  const selection: ImportSelection = useMemo(
    () => ({ excluded: [...excluded], approved: [...approved] }),
    [excluded, approved],
  );
  const chosen = useMemo(
    () => (plan ? includedRows(plan, selection) : []),
    [plan, selection],
  );
  const unresolved = hasUnresolved(chosen);
  const canConfirm = chosen.length > 0 && !unresolved && !busy;

  const toggleRow = (row: PlanRow) => {
    attempt.current = null;
    if (row.needsApproval) {
      setApproved((cur) => {
        const next = new Set(cur);
        if (next.has(row.rowNumber)) next.delete(row.rowNumber);
        else next.add(row.rowNumber);
        return next;
      });
    } else {
      setExcluded((cur) => {
        const next = new Set(cur);
        if (next.has(row.rowNumber)) next.delete(row.rowNumber);
        else next.add(row.rowNumber);
        return next;
      });
    }
  };
  const isChosen = (row: PlanRow) =>
    chosen.some((c) => c.rowNumber === row.rowNumber);

  async function confirm() {
    if (!source || !preview || committing) return;
    attempt.current ??= crypto.randomUUID();
    setCommitting(true);
    setCommitError(null);
    try {
      const result = await api.commit({
        csv: source.csv,
        reason: params.reason,
        mapping: params.mapping,
        choices: params.choices,
        filename: source.filename,
        format: source.format,
        sheet: source.sheet,
        requestId: attempt.current,
        fingerprint: preview.fingerprint,
        excluded: [...excluded],
        approved: [...approved],
      });
      if (result.ok) {
        setDone({ filename: source.filename, result: result.result });
        setConfirming(false);
        setPreview(null);
        setSource(null);
        attempt.current = null;
        onImported();
        setReload((n) => n + 1);
        return;
      }
      setCommitError(result.error);
      if (result.kind === "conflict" || result.kind === "changed") {
        // What was reviewed is out of date: show the fresh preview.
        setConfirming(false);
        attempt.current = null;
        await run(source, params);
        setCommitError(result.error);
      }
    } catch {
      setCommitError("That didn't work. Please try again.");
    } finally {
      setCommitting(false);
    }
  }

  const columns = useMemo<TableColumn<PlanRow>[]>(() => {
    const spec = (
      id: string,
      label: string,
      type: ColumnSpec<PlanRow>["type"],
      get: ColumnSpec<PlanRow>["get"],
    ) => ({ id, label, type, get });
    return [
      {
        ...spec("include", "Import", "text", () => null),
        noFilter: true,
        render: (row) =>
          row.action === "create" || row.action === "update" ? (
            <input
              type="checkbox"
              className="size-4"
              aria-label={
                row.needsApproval
                  ? `Approve row ${row.rowNumber}: ${row.display.name}`
                  : `Include row ${row.rowNumber}: ${row.display.name}`
              }
              checked={isChosen(row)}
              onChange={() => toggleRow(row)}
            />
          ) : null,
      },
      {
        ...spec("row", "Row", "number", (r) => r.rowNumber),
        sortable: true,
        render: (row) => row.rowNumber,
      },
      {
        ...spec("action", "Action", "select", (r) => ACTION_LABEL[r.action]),
        sortable: true,
        render: (row) => (
          <Badge tone={ACTION_TONE[row.action]}>
            {ACTION_LABEL[row.action]}
          </Badge>
        ),
      },
      {
        ...spec("vendor", "Vendor", "select", (r) => r.display.vendor),
        sortable: true,
        render: (row) => (
          <span>
            {row.display.vendor}
            {row.vendor.kind === "new" ? (
              <Badge tone="warning" className="ml-2">
                New vendor
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        ...spec("name", "Name", "text", (r) => r.display.name),
        sortable: true,
        render: (row) => (
          <span className="font-medium">
            {row.display.name}
            {row.display.size ? ` ${row.display.size}` : ""}
            {row.matchedBy === "sku" ? (
              <Badge tone="neutral" className="ml-2">
                matched by SKU
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        ...spec("unit", "Unit", "select", (r) => r.display.unit),
        sortable: true,
        tabletHidden: true,
        render: (row) =>
          row.display.unit + (row.unitAssumed ? " (assumed)" : ""),
      },
      {
        ...spec("changes", "What changes", "text", changeText),
        render: (row) => changeText(row) || "—",
      },
      {
        ...spec("status", "Status", "select", (r) =>
          r.statusBefore && r.statusAfter && r.statusBefore !== r.statusAfter
            ? `${r.statusBefore} → ${r.statusAfter}`
            : r.statusAfter,
        ),
        sortable: true,
        tabletHidden: true,
        render: (row) =>
          row.statusBefore &&
          row.statusAfter &&
          row.statusBefore !== row.statusAfter
            ? `${row.statusBefore} → ${row.statusAfter}`
            : (row.statusAfter ?? "—"),
      },
      {
        ...spec("note", "Notes", "text", noteText),
        render: (row) => noteText(row) || "—",
      },
    ];
    // isChosen / toggleRow close over the selection sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluded, approved, plan]);

  function downloadErrors() {
    if (!source || !plan) return;
    const parsed = parseCsv(source.csv);
    const raw = new Map(
      parsed.ok ? parsed.rows.map((r) => [r.rowNumber, r.cells.join(",")]) : [],
    );
    const rows = plan.rows
      .filter((row) => row.action === "error")
      .map((row) => [
        row.rowNumber,
        row.reason ?? "",
        raw.get(row.rowNumber) ?? "",
      ]);
    downloadFile(
      `${source.filename.replace(/\.csv$/i, "")}-errors.csv`,
      toCsv([["Row", "Problem", "Original row"], ...rows]),
      EXPORT_MIME.csv,
    );
  }

  const choose = (miss: NearMiss, answer: string) =>
    update({
      choices: {
        ...params.choices,
        [miss.entity === "vendor"
          ? "vendors"
          : miss.entity === "category"
            ? "categories"
            : "subcategories"]: {
          ...(params.choices[
            miss.entity === "vendor"
              ? "vendors"
              : miss.entity === "category"
                ? "categories"
                : "subcategories"
          ] ?? {}),
          [miss.key]: answer,
        },
      },
    });

  const created = chosen.filter((r) => r.action === "create").length;
  const updated = chosen.length - created;

  const announcement = done
    ? `Finished importing: ${done.result.created} created, ${done.result.updated} updated, ${done.result.skipped} skipped, ${done.result.errors} with errors.`
    : busy
      ? "Working on your file."
      : preview
        ? "Preview ready. Review the changes, then choose Review and import."
        : "";

  return (
    <div
      className="flex min-w-0 flex-col gap-4"
      data-testid="bar-inventory-import"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <h2 className="text-lg font-semibold">Import from a file</h2>
          <p className="text-muted-foreground text-sm">
            Upload a CSV or an Excel (.xlsx) file, review exactly what it would
            do, then confirm. Nothing changes until you confirm. A blank cell
            leaves the current value alone; a <strong>0</strong> sets it to
            zero.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fileId} className="text-sm font-medium">
                CSV or Excel file
              </label>
              <input
                id={fileId}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="border-border bg-card text-foreground file:bg-secondary file:text-secondary-foreground min-h-11 max-w-full rounded-lg border px-2 py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5"
                onChange={(event) => {
                  void onFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={reasonId} className="text-sm font-medium">
                Counts are a
              </label>
              <Select
                id={reasonId}
                className="w-auto"
                value={params.reason}
                onChange={(e) =>
                  update({ reason: e.target.value as Params["reason"] })
                }
              >
                <option value="stock_count">
                  {ADJUSTMENT_REASON_LABELS.stock_count}
                </option>
                <option value="delivery_restock">
                  {ADJUSTMENT_REASON_LABELS.delivery_restock}
                </option>
              </Select>
            </div>
            <Button
              variant="ghost"
              onClick={() =>
                downloadFile(
                  "bar-inventory-import-template.csv",
                  TEMPLATE,
                  EXPORT_MIME.csv,
                )
              }
            >
              <Download aria-hidden="true" /> Download template
            </Button>
          </div>
          {source?.format === "xlsx" && source.sheets.length > 1 && workbook ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={sheetId} className="text-sm font-medium">
                Sheet
              </label>
              <Select
                id={sheetId}
                className="w-auto"
                value={source.sheet ?? ""}
                disabled={busy}
                onChange={(event) =>
                  void readSheet(
                    workbook.filename,
                    workbook.base64,
                    event.target.value,
                  )
                }
              >
                {source.sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name} ({sheet.rows}{" "}
                    {sheet.rows === 1 ? "row" : "rows"})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Needs the columns Vendor, Name, On Hand, Backup and Cutoff Limit.
            Category, Subcategory, Size, Unit, SKU, Warning Level, Par Level and
            Notes are optional.
          </p>
        </CardContent>
      </Card>

      {done ? (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <h3
              ref={doneHeading}
              tabIndex={-1}
              className="font-semibold outline-none"
            >
              Import complete
            </h3>
            <p className="text-sm">
              {done.filename}: {done.result.created} created,{" "}
              {done.result.updated} updated, {done.result.skipped} skipped,{" "}
              {done.result.errors} with errors. {done.result.vendors_created}{" "}
              new vendors, {done.result.categories_created} new categories,{" "}
              {done.result.subcategories_created} new subcategories.{" "}
              {done.result.ledger_rows} stock changes were added to History.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {source?.warnings.length ? (
        <p
          role="status"
          className="border-warn/30 bg-warn/15 text-warn rounded-lg border px-3 py-2 text-sm"
        >
          {source.warnings.join(" ")}
        </p>
      ) : null}

      {busy ? (
        <p role="status" className="text-muted-foreground text-sm">
          Reading the file…
        </p>
      ) : null}

      {problem ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <p role="alert" className="text-destructive text-sm">
              {problem.message}
            </p>
            {problem.header && source ? (
              <ColumnMapper
                header={problem.header}
                onChange={(mapping) => update({ mapping })}
                current={params.mapping}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {preview && plan && source ? (
        <section aria-label="Import preview" className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">
            Preview: {source.filename}
          </h3>
          <p className="text-sm" data-testid="import-counts">
            Create {plan.summary.create} · Update {plan.summary.update} · Skip{" "}
            {plan.summary.skip} · Error {plan.summary.error} · New vendors{" "}
            {plan.summary.newVendors} · New categories{" "}
            {plan.summary.newCategories} · New subcategories{" "}
            {plan.summary.newSubcategories}
          </p>

          {preview.header.unmapped.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Ignored columns: {wordList(preview.header.unmapped)}.
            </p>
          ) : null}
          {preview.header.duplicates.length > 0 ? (
            <p className="text-warn text-sm">
              {preview.header.duplicates
                .map(
                  (d) =>
                    `More than one column looks like ${IMPORT_FIELD_LABELS[d.field]} (${wordList(d.columns)}); only the first is used.`,
                )
                .join(" ")}
            </p>
          ) : null}

          <details className="border-border rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Columns</summary>
            <ColumnMapper
              header={preview.header}
              onChange={(mapping) => update({ mapping })}
              current={params.mapping}
            />
          </details>

          {plan.nearMisses.length > 0 ? (
            <section
              aria-label="Check these names"
              className="border-warn/40 flex flex-col gap-3 rounded-lg border p-3"
            >
              <h4 className="text-sm font-semibold">
                Check these names before importing
              </h4>
              {plan.nearMisses.map((miss) => (
                <fieldset
                  key={`${miss.entity}-${miss.key}`}
                  className="flex flex-col gap-1 text-sm"
                >
                  <legend className="mb-1">
                    The {miss.entity} “{miss.name}” (rows {miss.rows.join(", ")}
                    ) looks like “{miss.similarTo.name}”.
                  </legend>
                  <label className="flex min-h-9 items-center gap-2">
                    <input
                      type="radio"
                      name={`miss-${miss.entity}-${miss.key}`}
                      onChange={() => choose(miss, miss.similarTo.id)}
                    />
                    Use “{miss.similarTo.name}”
                  </label>
                  <label className="flex min-h-9 items-center gap-2">
                    <input
                      type="radio"
                      name={`miss-${miss.entity}-${miss.key}`}
                      onChange={() => choose(miss, "new")}
                    />
                    Create a new {miss.entity} “{miss.name}”
                  </label>
                </fieldset>
              ))}
            </section>
          ) : null}

          {plan.summary.needsApproval > 0 ? (
            <p className="text-sm">
              {plan.summary.needsApproval} row(s) matched an existing item by
              SKU although the name, size or unit differs. They are left out
              until you tick them.
            </p>
          ) : null}

          <FilterableTable<PlanRow>
            tableKey="imp"
            restaurantSlug="import-preview"
            label="Import preview"
            rows={plan.rows}
            columns={columns}
            getRowId={(row) => String(row.rowNumber)}
            timeZone={timeZone}
            emptyMessage="The file has no rows."
            renderCard={(row) => (
              <article
                aria-label={`Row ${row.rowNumber}: ${row.display.name}`}
                className="border-border bg-card flex flex-col gap-1.5 rounded-xl border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {row.display.name}
                      {row.display.size ? ` ${row.display.size}` : ""}
                    </h3>
                    <p className="text-muted-foreground text-xs">
                      Row {row.rowNumber} · {row.display.vendor}
                      {row.vendor.kind === "new" ? " (new vendor)" : ""}
                    </p>
                  </div>
                  <Badge tone={ACTION_TONE[row.action]}>
                    {ACTION_LABEL[row.action]}
                  </Badge>
                </div>
                {changeText(row) ? (
                  <p className="text-sm">{changeText(row)}</p>
                ) : null}
                {noteText(row) ? (
                  <p className="text-muted-foreground text-xs">
                    {noteText(row)}
                  </p>
                ) : null}
                {row.action === "create" || row.action === "update" ? (
                  <label className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`${row.needsApproval ? "Approve" : "Include"} row ${row.rowNumber}: ${row.display.name}`}
                      checked={isChosen(row)}
                      onChange={() => toggleRow(row)}
                    />
                    {row.needsApproval ? "Approve" : "Include"}
                  </label>
                ) : null}
              </article>
            )}
          />

          {commitError ? (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
            >
              {commitError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                attempt.current ??= crypto.randomUUID();
                setConfirming(true);
              }}
              disabled={!canConfirm}
            >
              <FileUp aria-hidden="true" /> Review and import ({chosen.length})
            </Button>
            {plan.summary.error > 0 ? (
              <Button variant="ghost" onClick={downloadErrors}>
                <Download aria-hidden="true" /> Download error report
              </Button>
            ) : null}
            {unresolved ? (
              <span className="text-warn text-sm">
                Choose how to handle the highlighted names first.
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => {
          if (!committing) setConfirming(false);
        }}
        title="Import these changes?"
        description="Review what is about to happen. The import is applied all at once, or not at all."
      >
        <div
          className="flex flex-col gap-3 text-sm"
          data-testid="import-confirm"
        >
          <ul className="list-disc pl-5">
            <li>{created} new items will be created</li>
            <li>{updated} existing items will be updated</li>
            {plan && plan.summary.newVendors > 0 ? (
              <li>{plan.summary.newVendors} new vendors will be created</li>
            ) : null}
            <li>
              Count changes are recorded in History as{" "}
              {ADJUSTMENT_REASON_LABELS[params.reason]}.
            </li>
          </ul>
          {commitError ? (
            <p role="alert" className="text-destructive">
              {commitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={committing}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={committing}>
              {committing ? "Importing…" : "Import now"}
            </Button>
          </div>
        </div>
      </Dialog>

      <section aria-label="Import history" className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Import history</h3>
        {batchError ? (
          <p role="alert" className="text-destructive text-sm">
            {batchError}
          </p>
        ) : batches === null ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading…
          </p>
        ) : (
          <BatchHistory batches={batches} timeZone={timeZone} />
        )}
      </section>
    </div>
  );
}

function ColumnMapper({
  header,
  current,
  onChange,
}: {
  header: HeaderMapping;
  current: Record<number, ImportField | null>;
  onChange: (mapping: Record<number, ImportField | null>) => void;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-2" aria-label="Column mapping">
      {header.labels.map((label, index) => (
        <li key={index} className="flex flex-wrap items-center gap-2">
          <span className="min-w-32 font-medium">
            {label || `Column ${index + 1}`}
          </span>
          <Select
            aria-label={`Use column ${label || index + 1} as`}
            className="w-auto"
            value={
              index in current
                ? (current[index] ?? "")
                : (header.mapping[index] ?? "")
            }
            onChange={(event) =>
              onChange({
                ...current,
                [index]: (event.target.value || null) as ImportField | null,
              })
            }
          >
            <option value="">Ignore</option>
            {IMPORT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {IMPORT_FIELD_LABELS[field]}
              </option>
            ))}
          </Select>
        </li>
      ))}
    </ul>
  );
}

function BatchHistory({
  batches,
  timeZone,
}: {
  batches: ImportBatchView[];
  timeZone: string;
}) {
  const columns = useMemo<TableColumn<ImportBatchView>[]>(
    () => [
      {
        id: "when",
        label: "When",
        type: "date",
        sortable: true,
        get: (b) => b.createdAt,
        render: (b) => formatBusinessDateTime(b.createdAt, timeZone),
      },
      {
        id: "file",
        label: "File",
        type: "text",
        sortable: true,
        searchable: true,
        get: (b) => b.filename,
        render: (b) => <span className="font-medium">{b.filename}</span>,
      },
      {
        id: "format",
        label: "Format",
        type: "select",
        tabletHidden: true,
        get: (b) => (b.format === "xlsx" ? "Excel" : "CSV"),
        render: (b) =>
          b.format === "xlsx"
            ? `Excel${b.sheet ? ` · ${b.sheet}` : ""}`
            : "CSV",
      },
      {
        id: "reason",
        label: "Counts as",
        type: "select",
        get: (b) => ADJUSTMENT_REASON_LABELS[b.reason],
        render: (b) => ADJUSTMENT_REASON_LABELS[b.reason],
      },
      {
        id: "actor",
        label: "By",
        type: "select",
        sortable: true,
        get: (b) => b.actorName,
        render: (b) => b.actorName ?? "—",
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        get: (b) => (b.status === "committed" ? "Committed" : "Staged"),
        render: (b) => (b.status === "committed" ? "Committed" : "Staged"),
      },
      {
        id: "created",
        label: "Created",
        type: "number",
        sortable: true,
        align: "right",
        get: (b) => b.created,
        render: (b) => b.created,
      },
      {
        id: "updated",
        label: "Updated",
        type: "number",
        sortable: true,
        align: "right",
        get: (b) => b.updated,
        render: (b) => b.updated,
      },
      {
        id: "skipped",
        label: "Skipped",
        type: "number",
        align: "right",
        tabletHidden: true,
        get: (b) => b.skipped,
        render: (b) => b.skipped,
      },
      {
        id: "errors",
        label: "Errors",
        type: "number",
        align: "right",
        tabletHidden: true,
        get: (b) => b.errors,
        render: (b) => b.errors,
      },
      {
        id: "vendors",
        label: "New vendors",
        type: "number",
        align: "right",
        tabletHidden: true,
        get: (b) => b.vendorsCreated,
        render: (b) => b.vendorsCreated,
      },
    ],
    [timeZone],
  );
  return (
    <FilterableTable<ImportBatchView>
      tableKey="impb"
      restaurantSlug="import-history"
      label="Import history"
      rows={batches}
      columns={columns}
      getRowId={(b) => b.id}
      timeZone={timeZone}
      defaultSort={[{ id: "when", dir: "desc" }]}
      emptyMessage="No imports yet."
      renderCard={(b) => (
        <article
          aria-label={b.filename}
          className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3"
        >
          <h3 className="truncate font-semibold">{b.filename}</h3>
          <p className="text-muted-foreground text-xs">
            {formatBusinessDateTime(b.createdAt, timeZone)}
            {b.actorName ? ` · ${b.actorName}` : ""}
          </p>
          <p className="text-sm">
            {b.created} created · {b.updated} updated · {b.skipped} skipped ·{" "}
            {b.errors} errors
          </p>
        </article>
      )}
    />
  );
}
