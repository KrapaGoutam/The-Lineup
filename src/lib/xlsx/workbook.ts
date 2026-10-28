import { CSV_LIMITS, stripControlCharacters } from "@/lib/csv/read";

import { inspectWorkbook, XLSX_LIMITS } from "./guard";

/**
 * A workbook sheet as the same rows a CSV file gives, so everything after this
 * (header mapping, the plan, the commit) is the one CSV pipeline: there is no
 * XLSX-specific business rule downstream.
 *
 * The workbook is checked by the guard first; the library only ever sees bytes
 * the guard accepted. Formulas are never evaluated: the saved value is read,
 * and a formula with no saved value refuses the sheet (a blank there would be
 * read as "leave unchanged").
 */

export type SheetCell = string | number | boolean | Date | null | undefined;
export type RawSheet = {
  sheet: string;
  data: readonly (readonly SheetCell[])[];
};
/** Reads every sheet of an already-accepted workbook (the Node or the browser build). */
export type WorkbookReader = (bytes: Uint8Array) => Promise<RawSheet[]>;

export type SheetInfo = { name: string; rows: number };

export type WorkbookRead =
  | {
      ok: true;
      sheets: SheetInfo[];
      selected: string;
      /** The selected sheet as CSV text, one line per spreadsheet row (blank rows stay blank). */
      csv: string;
      warnings: string[];
    }
  | { ok: false; error: string };

const isBlank = (cell: SheetCell) =>
  cell === null ||
  cell === undefined ||
  (typeof cell === "string" && cell.trim() === "");

/** A cell as the text a CSV would hold. Numbers are plain decimals; dates are ISO days. */
export function cellText(cell: SheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return stripControlCharacters(cell);
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  }
  if (!Number.isFinite(cell)) return "";
  // A whole number is exact as it is: a 13-digit barcode (EAN-13) held as a
  // number must not be rounded to 12 significant digits.
  if (Number.isSafeInteger(cell)) return String(cell);
  // Floating-point noise from a calculated cell (0.30000000000000004) is not data.
  const rounded = Number(cell.toPrecision(12));
  const text = String(rounded);
  return /e/i.test(text) ? rounded.toFixed(10).replace(/\.?0+$/, "") : text;
}

const quote = (text: string) =>
  /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

const trimRight = (row: readonly SheetCell[]): readonly SheetCell[] => {
  let end = row.length;
  while (end > 0 && isBlank(row[end - 1])) end -= 1;
  return row.slice(0, end);
};

function rowsIn(sheet: RawSheet): number {
  const filled = sheet.data.filter((row) => trimRight(row).length > 0).length;
  return Math.max(0, filled - 1); // the header is not a data row
}

export async function readWorkbook(
  bytes: Uint8Array,
  reader: WorkbookReader,
  options: { sheet?: string | null } = {},
): Promise<WorkbookRead> {
  const guard = inspectWorkbook(bytes);
  if (!guard.ok) return { ok: false, error: guard.message };

  let sheets: RawSheet[];
  try {
    sheets = await reader(bytes);
  } catch {
    return {
      ok: false,
      error: "This file isn't a valid .xlsx workbook (it may be damaged).",
    };
  }
  if (sheets.length === 0) {
    return { ok: false, error: "This workbook has no sheets." };
  }
  if (sheets.length > XLSX_LIMITS.maxSheets) {
    return {
      ok: false,
      error: `This workbook has more than ${XLSX_LIMITS.maxSheets} sheets. Keep only the sheet you need, or save it as CSV.`,
    };
  }

  const wanted = options.sheet ?? null;
  const chosen =
    wanted !== null
      ? sheets.find((s) => s.sheet === wanted)
      : (sheets.find(
          (s) => rowsIn(s) > 0 || s.data.some((r) => trimRight(r).length > 0),
        ) ?? sheets[0]);
  if (!chosen) {
    return {
      ok: false,
      error: `This workbook has no sheet called “${wanted}”.`,
    };
  }

  // Formulas Excel never calculated would read as blank, i.e. "unchanged". Refuse them.
  const gaps = guard.formulaGaps.filter((g) => g.sheet === chosen.sheet);
  if (gaps.length > 0) {
    const shown = gaps
      .slice(0, 5)
      .map((g) => g.cell)
      .join(", ");
    return {
      ok: false,
      error: `“${chosen.sheet}” has ${gaps.length} formula cell(s) with no saved value (${shown}${gaps.length > 5 ? ", …" : ""}). Open the file in Excel, save it, and upload it again.`,
    };
  }

  // A cell showing #N/A, #REF!, #DIV/0! … reads as blank, i.e. "leave unchanged".
  const errored = guard.errorCells.filter((g) => g.sheet === chosen.sheet);
  if (errored.length > 0) {
    const shown = errored
      .slice(0, 5)
      .map((g) => g.cell)
      .join(", ");
    return {
      ok: false,
      error: `“${chosen.sheet}” has ${errored.length} cell(s) showing an Excel error (${shown}${errored.length > 5 ? ", …" : ""}). Fix them in Excel, save, and upload it again.`,
    };
  }

  // One CSV line per spreadsheet row, so row numbers in the preview are the sheet's own.
  const lines: string[] = [];
  let dataRows = 0;
  let seenHeader = false;
  for (const [index, raw] of chosen.data.entries()) {
    const row = trimRight(raw);
    const rowNumber = index + 1;
    if (row.length === 0) {
      lines.push("");
      continue;
    }
    if (row.length > CSV_LIMITS.maxColumns) {
      return {
        ok: false,
        error: `Row ${rowNumber} has more than ${CSV_LIMITS.maxColumns} columns.`,
      };
    }
    if (seenHeader) dataRows += 1;
    seenHeader = true;
    if (dataRows > CSV_LIMITS.maxRows) {
      return {
        ok: false,
        error: `That sheet has more than ${CSV_LIMITS.maxRows.toLocaleString("en-US")} rows.`,
      };
    }
    const cells = row.map(cellText);
    if (cells.some((c) => c.length > CSV_LIMITS.maxCell)) {
      return {
        ok: false,
        error: `Row ${rowNumber} has a value longer than ${CSV_LIMITS.maxCell} characters.`,
      };
    }
    lines.push(cells.map(quote).join(","));
  }
  if (!seenHeader) {
    return { ok: false, error: `“${chosen.sheet}” is empty.` };
  }

  return {
    ok: true,
    sheets: sheets.map((s) => ({ name: s.sheet, rows: rowsIn(s) })),
    selected: chosen.sheet,
    csv: lines.join("\n"),
    warnings: guard.warnings,
  };
}
