import { neutralizeText, toCsv } from "@/lib/csv/write";

/**
 * A format-neutral table export. Builders produce this once; CSV and XLSX are
 * just two ways to write it, so both always carry the same rows and both get
 * the same formula-injection guard.
 */
export type ExportCell = string | number | null;

export type ExportSheet = {
  name: string;
  header: readonly string[];
  rows: readonly (readonly ExportCell[])[];
};

export type ExportDocument = {
  /** The flat table written for CSV. */
  csv: ExportSheet;
  /** The workbook's sheets (often just the flat table; recommendations are one sheet per vendor). */
  sheets: readonly ExportSheet[];
};

export type ExportFormat = "csv" | "xlsx";

export const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function sheetToCsv(sheet: ExportSheet): string {
  return toCsv([sheet.header, ...sheet.rows]);
}

/** `bar-inventory_<restaurant>_<what>_<yyyy-mm-dd>.<ext>` */
export function exportFilename(input: {
  slug: string;
  what: string;
  date: string;
  format: ExportFormat;
}): string {
  return `bar-inventory_${input.slug}_${input.what}_${input.date}.${input.format}`;
}

const SHEET_NAME_MAX = 31;
// Excel rejects these characters in a sheet name, and reserves "History".
const SHEET_NAME_BAD = /[[\]:*?/\\]/g;

/**
 * A worksheet name Excel accepts: at most 31 characters, none of `[ ] : * ? / \`,
 * not blank, not starting or ending with an apostrophe, not the reserved
 * "History", and unique (case-insensitively) among `used`, which it extends.
 */
export function safeSheetName(raw: string, used: Set<string>): string {
  let base = raw
    .replace(SHEET_NAME_BAD, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  if (base === "" || base.toLowerCase() === "history") {
    base = base === "" ? "Sheet" : `${base} sheet`;
  }
  base = base.slice(0, SHEET_NAME_MAX).trim();
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) {
    const suffix = ` (${n})`;
    name = `${base.slice(0, SHEET_NAME_MAX - suffix.length).trim()}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

type WorkbookCell =
  | string
  | number
  | null
  | { value: string; fontWeight: "bold" };

/**
 * The workbook as the writer wants it: one `{ data, sheet }` per sheet, a bold
 * header row, text neutralised against formulas, numbers left as numbers.
 */
export function workbookSheets(
  sheets: readonly ExportSheet[],
): { sheet: string; data: WorkbookCell[][] }[] {
  const used = new Set<string>();
  return sheets.map((sheet) => ({
    sheet: safeSheetName(sheet.name, used),
    data: [
      sheet.header.map(
        (title): WorkbookCell => ({
          value: neutralizeText(title),
          fontWeight: "bold",
        }),
      ),
      ...sheet.rows.map((row) =>
        row.map((cell): WorkbookCell => {
          if (cell === null) return null;
          if (typeof cell === "number")
            return Number.isFinite(cell) ? cell : null;
          return neutralizeText(cell);
        }),
      ),
    ],
  }));
}
