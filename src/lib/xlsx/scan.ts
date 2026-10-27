/**
 * One linear pass over a worksheet's XML for what the guard must know before
 * the spreadsheet library parses it:
 *
 *  - how far right and down the data reaches. The library pads every row out
 *    to the widest cell, so a ~1 KB file with a value in column XFD and one in
 *    row 1,048,576 asks it for billions of slots and takes the server down.
 *  - formulas Excel never calculated (a blank there would read as "leave
 *    unchanged") and cells that show an Excel error (#N/A, #REF!, …, which the
 *    library also turns into blanks).
 *
 * It uses `indexOf`, never a regular expression that can backtrack across the
 * document: the XML is attacker-controlled and up to 30 MB, and a pattern like
 * `<c\b…>[\s\S]*?<\/c>` over thousands of unclosed `<c>` tags is quadratic.
 * Every tag it reads is length-capped.
 */

export const SHEET_SCAN_LIMITS = {
  /** Same as the CSV reader: a row wider than this is refused anyway. */
  maxColumn: 40,
  /** Spreadsheet rows, blank ones included, so 5,000 data rows fit with room. */
  maxRow: 50_000,
  /** The longest start tag we will read; anything longer is not a real tag. */
  maxTag: 4000,
} as const;

export type SheetScan =
  | { ok: true; gaps: string[]; errors: string[] }
  | { ok: false; reason: "malformed" | "too_wide" | "too_tall" };

type Tag = { text: string; end: number };

const isTagBoundary = (c: string | undefined) =>
  c === " " || c === ">" || c === "/" || c === "\n" || c === "\r" || c === "\t";

/** The next `<name …>` start tag at or after `from`; `"malformed"` if one never closes. */
function nextTag(
  xml: string,
  name: string,
  from: number,
): Tag | "malformed" | null {
  const open = `<${name}`;
  let at = from;
  for (;;) {
    at = xml.indexOf(open, at);
    if (at === -1) return null;
    if (!isTagBoundary(xml[at + open.length])) {
      at += 1;
      continue;
    }
    const end = xml.indexOf(">", at);
    if (end === -1 || end - at > SHEET_SCAN_LIMITS.maxTag) return "malformed";
    return { text: xml.slice(at, end + 1), end };
  }
}

/** An attribute's value, with either quote style (XML allows `r='A1'` too). */
export function attrOf(tag: string, name: string): string | null {
  for (const quote of ['"', "'"]) {
    const marker = `${name}=${quote}`;
    let start = tag.indexOf(marker);
    // The name must start an attribute (whitespace before it), not end another.
    while (start > 0 && !/\s/.test(tag[start - 1])) {
      start = tag.indexOf(marker, start + 1);
    }
    if (start === -1) continue;
    const from = start + marker.length;
    const stop = tag.indexOf(quote, from);
    if (stop !== -1) return tag.slice(from, stop);
  }
  return null;
}

/** "AB12" → column 28, row 12; null when it is not a plain cell reference. */
function parseRef(ref: string): { column: number; row: number } | null {
  let i = 0;
  let column = 0;
  while (i < ref.length && i < 4) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    column = column * 26 + (code - 64);
    i += 1;
  }
  if (i === 0 || i > 3) return null;
  const digits = ref.slice(i);
  if (!/^\d{1,8}$/.test(digits)) return null;
  return { column, row: Number(digits) };
}

const nonEmptyValue = (inner: string) => {
  const open = inner.indexOf("<v");
  if (open === -1) return false;
  const start = inner.indexOf(">", open);
  if (start === -1 || inner[start - 1] === "/") return false;
  const close = inner.indexOf("</v>", start);
  return close > start + 1;
};

const hasFormula = (inner: string) => {
  let at = 0;
  for (;;) {
    at = inner.indexOf("<f", at);
    if (at === -1) return false;
    if (isTagBoundary(inner[at + 2])) return true;
    at += 1;
  }
};

export function scanSheet(xml: string): SheetScan {
  const { maxColumn, maxRow } = SHEET_SCAN_LIMITS;
  const gaps: string[] = [];
  const errors: string[] = [];

  // Rows first: a `<row r="1048576">` costs the library a row of padding each.
  let at = 0;
  for (;;) {
    const row = nextTag(xml, "row", at);
    if (row === null) break;
    if (row === "malformed") return { ok: false, reason: "malformed" };
    at = row.end + 1;
    const r = attrOf(row.text, "r");
    if (r !== null && Number(r) > maxRow) {
      return { ok: false, reason: "too_tall" };
    }
  }

  at = 0;
  for (;;) {
    const cell = nextTag(xml, "c", at);
    if (cell === null) break;
    if (cell === "malformed") return { ok: false, reason: "malformed" };
    at = cell.end + 1;
    if (cell.text.endsWith("/>")) continue; // an empty, styled cell

    const close = xml.indexOf("</c>", at);
    if (close === -1) return { ok: false, reason: "malformed" };
    const inner = xml.slice(at, close);
    at = close + 4;

    const ref = attrOf(cell.text, "r");
    const type = attrOf(cell.text, "t");
    const formula = hasFormula(inner);
    const value = nonEmptyValue(inner) || inner.includes("<is");

    if (ref !== null && (value || formula)) {
      const where = parseRef(ref);
      if (where && where.column > maxColumn) {
        return { ok: false, reason: "too_wide" };
      }
      if (where && where.row > maxRow) {
        return { ok: false, reason: "too_tall" };
      }
    }
    if (type === "e") errors.push(ref ?? "?");
    // A formula whose result is the empty string is saved as <v></v> with
    // t="str": a real, intentional blank. Any other formula without a saved
    // value was never calculated.
    if (formula && !value && type !== "str") gaps.push(ref ?? "?");
  }
  return { ok: true, gaps, errors };
}

/** Every `<name …>` start tag in the document (length-capped, linear). */
export function startTags(xml: string, name: string): string[] | "malformed" {
  const found: string[] = [];
  let at = 0;
  for (;;) {
    const tag = nextTag(xml, name, at);
    if (tag === null) return found;
    if (tag === "malformed") return "malformed";
    found.push(tag.text);
    at = tag.end + 1;
  }
}
