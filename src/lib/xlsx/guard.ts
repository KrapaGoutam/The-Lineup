import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

import { attrOf, scanSheet, SHEET_SCAN_LIMITS, startTags } from "./scan";

/**
 * Pre-flight guard for an uploaded workbook. The spreadsheet library is NEVER
 * handed bytes this has not accepted: the library alone inflates a whole zip
 * entry into memory (a 0.15 MB upload that expands to 150 MB took ~509 MB
 * before it failed), so a hostile file is stopped here instead.
 *
 * It streams the archive through `fflate`, counts the bytes that REALLY come
 * out (the sizes in a zip header are written by the sender and are never
 * trusted), and aborts the moment a cap is crossed.
 */

export const XLSX_LIMITS = {
  /** Compressed upload. */
  maxFileBytes: 5 * 1024 * 1024,
  maxEntries: 200,
  maxEntryBytes: 30 * 1024 * 1024,
  maxArchiveBytes: 50 * 1024 * 1024,
  maxSheets: 5,
} as const;

export type GuardCode =
  | "too_large"
  | "legacy_format"
  | "corrupt"
  | "not_xlsx"
  | "macro_enabled"
  | "too_many_entries"
  | "entry_too_large"
  | "archive_too_large"
  | "too_many_sheets"
  | "sheet_too_large";

const MESSAGES: Record<GuardCode, string> = {
  too_large: "That file is larger than 5 MB.",
  legacy_format:
    "That is an older Excel format. In Excel, use Save As → Excel Workbook (.xlsx) or CSV, then upload that.",
  corrupt:
    "This file isn't a valid .xlsx workbook (it may be damaged or cut short).",
  not_xlsx: "This file isn't a valid .xlsx workbook.",
  macro_enabled:
    "Workbooks with macros can't be imported. Save a copy as a normal .xlsx (no macros) or as CSV.",
  too_many_entries:
    "This workbook is too complex to import. Save the sheet as CSV instead.",
  entry_too_large:
    "This workbook expands to more data than can be imported safely.",
  archive_too_large:
    "This workbook expands to more data than can be imported safely.",
  too_many_sheets: `This workbook has more than ${XLSX_LIMITS.maxSheets} sheets. Keep only the sheet you need, or save it as CSV.`,
  sheet_too_large: `A sheet in this workbook has data beyond column ${SHEET_SCAN_LIMITS.maxColumn} or row ${SHEET_SCAN_LIMITS.maxRow.toLocaleString("en-US")}, which is more than can be imported. Keep only the data you need, or save it as CSV.`,
};

export type FormulaGap = { sheet: string; cell: string };

export type GuardResult =
  | {
      ok: true;
      /** Sheet names in workbook order. */
      sheets: string[];
      /** Formula cells Excel never calculated (no saved value). */
      formulaGaps: FormulaGap[];
      /** Cells that show an Excel error (#N/A, #REF!, …); the library reads them as blank. */
      errorCells: FormulaGap[];
      warnings: string[];
    }
  | { ok: false; code: GuardCode; message: string };

class Stop extends Error {
  constructor(readonly code: GuardCode) {
    super(code);
  }
}

/**
 * The inflater hands an exception thrown from a callback back to that same
 * callback as an "error", so the reason a stop was raised is remembered here:
 * the FIRST one wins and is what gets reported.
 */
class Stopper {
  reason: Stop | null = null;
  halt(code: GuardCode): never {
    this.reason ??= new Stop(code);
    throw this.reason;
  }
}

const fail = (code: GuardCode): GuardResult => ({
  ok: false,
  code,
  message: MESSAGES[code],
});

const decode = (chunks: Uint8Array[]): string => {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder("utf-8").decode(all);
};

const unescapeXml = (text: string) =>
  text
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex: string) =>
      safeChar(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d{1,7});/g, (_, dec: string) => safeChar(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const safeChar = (code: number) =>
  Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";

export function inspectWorkbook(bytes: Uint8Array): GuardResult {
  if (bytes.length > XLSX_LIMITS.maxFileBytes) return fail("too_large");
  // Magic bytes: a zip starts "PK"; the old binary Excel format starts D0 CF 11 E0.
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return fail("legacy_format");
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return fail("not_xlsx");

  const names: string[] = [];
  const kept = new Map<string, Uint8Array[]>();
  const sheetXml = new Map<string, Uint8Array[]>();
  let entries = 0;
  let started = 0;
  let finished = 0;
  let total = 0;

  const stopper = new Stopper();
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  unzip.onfile = (file) => {
    entries += 1;
    if (entries > XLSX_LIMITS.maxEntries) stopper.halt("too_many_entries");
    started += 1;
    names.push(file.name);
    if (/(^|\/)vbaProject\.bin$/i.test(file.name))
      stopper.halt("macro_enabled");

    const small =
      file.name === "[Content_Types].xml" ||
      file.name === "xl/workbook.xml" ||
      file.name === "xl/_rels/workbook.xml.rels";
    const sheet = /^xl\/worksheets\/[^/]+\.xml$/.test(file.name);
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) stopper.halt("corrupt");
      // What really came out of the inflater, not what the header claims.
      size += chunk.length;
      total += chunk.length;
      if (size > XLSX_LIMITS.maxEntryBytes) stopper.halt("entry_too_large");
      if (total > XLSX_LIMITS.maxArchiveBytes)
        stopper.halt("archive_too_large");
      if (small || sheet) chunks.push(chunk);
      if (final) {
        finished += 1;
        if (small) kept.set(file.name, chunks);
        if (sheet) sheetXml.set(file.name, chunks);
      }
    };
    file.start();
  };

  try {
    unzip.push(bytes, true);
  } catch {
    return fail(stopper.reason?.code ?? "corrupt");
  }
  if (stopper.reason) return fail(stopper.reason.code);
  if (entries === 0) return fail("not_xlsx");
  // A zip cut short leaves entries that never finished.
  if (finished < started) return fail("corrupt");

  if (
    !names.includes("[Content_Types].xml") ||
    !names.includes("xl/workbook.xml")
  ) {
    return fail("not_xlsx");
  }
  const contentTypes = decode(kept.get("[Content_Types].xml") ?? []);
  if (/macroEnabled/i.test(contentTypes)) return fail("macro_enabled");

  // Sheets in workbook order, and which worksheet file each one is.
  const workbook = decode(kept.get("xl/workbook.xml") ?? []);
  const rels = decode(kept.get("xl/_rels/workbook.xml.rels") ?? []);
  const target = new Map<string, string>();
  const relTags = startTags(rels, "Relationship");
  const sheetTags = startTags(workbook, "sheet");
  if (relTags === "malformed" || sheetTags === "malformed") {
    return fail("corrupt");
  }
  for (const tag of relTags) {
    const id = attrOf(tag, "Id");
    const to = attrOf(tag, "Target");
    if (id && to) {
      target.set(
        id,
        to.startsWith("/") ? to.slice(1) : `xl/${to.replace(/^\.\//, "")}`,
      );
    }
  }
  const sheets: { name: string; file: string | null }[] = [];
  for (const tag of sheetTags) {
    const name = attrOf(tag, "name");
    const rid = attrOf(tag, "r:id");
    if (name)
      sheets.push({
        name: unescapeXml(name),
        file: rid ? (target.get(rid) ?? null) : null,
      });
  }
  if (sheets.length > XLSX_LIMITS.maxSheets) return fail("too_many_sheets");

  // Every worksheet part is scanned, mapped to a name or not: the library
  // parses them all, so each must be inside the bounds.
  const formulaGaps: FormulaGap[] = [];
  const errorCells: FormulaGap[] = [];
  for (const [file, chunks] of sheetXml) {
    const scan = scanSheet(decode(chunks));
    if (!scan.ok) {
      return fail(scan.reason === "malformed" ? "corrupt" : "sheet_too_large");
    }
    const name = sheets.find((s) => s.file === file)?.name;
    if (name === undefined) continue;
    for (const cell of scan.gaps) formulaGaps.push({ sheet: name, cell });
    for (const cell of scan.errors) errorCells.push({ sheet: name, cell });
  }

  // Links and embedded objects are never followed; say that they were ignored.
  const warnings: string[] = [];
  const external = names.filter((n) =>
    n.startsWith("xl/externalLinks/"),
  ).length;
  const embedded = names.filter((n) => n.startsWith("xl/embeddings/")).length;
  if (external > 0)
    warnings.push(`${external} link(s) to other workbooks were ignored.`);
  if (embedded > 0)
    warnings.push(`${embedded} embedded object(s) were ignored.`);

  return {
    ok: true,
    sheets: sheets.map((s) => s.name),
    formulaGaps,
    errorCells,
    warnings,
  };
}
