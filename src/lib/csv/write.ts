/**
 * RFC 4180 CSV writer for exports.
 *
 * - UTF-8 with a BOM and CRLF line ends, so Excel opens it correctly.
 * - Formula-injection safe: a text cell that starts with `=`, `+`, `-`, `@`,
 *   a tab or a carriage return is prefixed with a single quote, so a
 *   spreadsheet never evaluates it. Numbers are written as numbers (a real
 *   `-2` stays `-2`); only strings are guarded.
 */
export type CsvCell = string | number | null | undefined;

const BOM = "﻿";
const DANGEROUS_START = /^[=+\-@\t\r]/;

/**
 * Text a spreadsheet treats as plain text: a value that could be read as a
 * formula (starts with `=`, `+`, `-`, `@`, a tab or a carriage return) gets a
 * leading single quote. Shared by the CSV and XLSX exports so both are guarded
 * the same way. Numbers never pass through this.
 */
export function neutralizeText(value: string): string {
  return DANGEROUS_START.test(value) ? `'${value}` : value;
}

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  const safe = neutralizeText(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return (
    BOM + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}
