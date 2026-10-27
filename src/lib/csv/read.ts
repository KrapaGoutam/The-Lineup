/**
 * RFC 4180 CSV reader for imports. Small, dependency-free and bounded: a hard
 * cap on size, rows, columns and cell length, so a hostile file cannot make it
 * allocate without limit.
 *
 * Handles quoted fields, doubled quotes, embedded newlines, CRLF / LF / CR,
 * a UTF-8 or UTF-16 byte-order mark, and the `,` `;` tab delimiters (sniffed
 * from the first line). Control characters are stripped from every cell.
 */

export const CSV_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  /** Data rows, not counting the header. */
  maxRows: 5000,
  maxColumns: 40,
  /** The parser's cap on any one cell; the importer applies tighter per-field caps. */
  maxCell: 500,
} as const;

export type Delimiter = "," | ";" | "\t";

/** One record, numbered the way a spreadsheet numbers rows (the header is row 1). */
export type CsvRecord = { rowNumber: number; cells: string[] };

export type CsvParseResult =
  | {
      ok: true;
      delimiter: Delimiter;
      header: CsvRecord;
      /** Data rows; completely blank lines are dropped but still count in `rowNumber`. */
      rows: CsvRecord[];
    }
  | { ok: false; error: string };

export type CsvDecodeResult =
  | { ok: true; text: string; warnings: string[] }
  | { ok: false; error: string };

/** UTF-8 (with or without BOM) or UTF-16 with a BOM, as bytes → text. */
export function decodeCsvBytes(bytes: Uint8Array): CsvDecodeResult {
  if (bytes.length > CSV_LIMITS.maxBytes) {
    return { ok: false, error: "That file is larger than 5 MB." };
  }
  const warnings: string[] = [];
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  } else {
    text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("�")) {
      warnings.push(
        "Some characters could not be read as UTF-8 and were replaced. Save the file as UTF-8 to keep them.",
      );
    }
  }
  return { ok: true, text, warnings };
}

// C0 controls except tab / newline / carriage return, and DEL.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sniffDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (counts[","] + counts[";"] + counts["\t"] > 0 || char === "\n") break;
    } else if (!quoted && char in counts) counts[char as Delimiter] += 1;
  }
  const best = (["\t", ";", ","] as Delimiter[]).reduce((a, b) =>
    counts[b] > counts[a] ? b : a,
  );
  return counts[best] === 0 ? "," : best;
}

export function parseCsv(input: string): CsvParseResult {
  const text = input.replace(/^﻿/, "");
  if (text.length > CSV_LIMITS.maxBytes) {
    return { ok: false, error: "That file is larger than 5 MB." };
  }
  const delimiter = sniffDelimiter(text);

  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let wasQuoted = false;
  let atFieldStart = true;
  let rowNumber = 1;

  const endCell = (): string | null => {
    const clean = cell.replace(CONTROL, "");
    if (clean.length > CSV_LIMITS.maxCell) {
      return `Row ${rowNumber} has a value longer than ${CSV_LIMITS.maxCell} characters.`;
    }
    cells.push(clean);
    cell = "";
    wasQuoted = false;
    atFieldStart = true;
    return null;
  };

  const endRecord = (): string | null => {
    const error = endCell();
    if (error) return error;
    if (cells.length > CSV_LIMITS.maxColumns) {
      return `Row ${rowNumber} has more than ${CSV_LIMITS.maxColumns} columns.`;
    }
    const blank = cells.every((value) => value.trim() === "");
    if (!blank) records.push({ rowNumber, cells });
    if (records.length > CSV_LIMITS.maxRows + 1) {
      return `That file has more than ${CSV_LIMITS.maxRows.toLocaleString("en-US")} rows.`;
    }
    cells = [];
    rowNumber += 1;
    return null;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && atFieldStart && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      atFieldStart = false;
      continue;
    }
    if (char === delimiter) {
      const error = endCell();
      if (error) return { ok: false, error };
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      const error = endRecord();
      if (error) return { ok: false, error };
      continue;
    }
    cell += char;
    atFieldStart = false;
  }
  if (quoted) {
    return {
      ok: false,
      error: `A quoted value starting in row ${rowNumber} is never closed.`,
    };
  }
  if (cell !== "" || cells.length > 0 || wasQuoted) {
    const error = endRecord();
    if (error) return { ok: false, error };
  }

  const [header, ...rows] = records;
  if (!header) return { ok: false, error: "That file is empty." };
  return { ok: true, delimiter, header, rows };
}
