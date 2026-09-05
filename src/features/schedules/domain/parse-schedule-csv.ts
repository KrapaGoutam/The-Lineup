import {
  createShiftInstances,
  type ShiftDefaults,
  type ShiftInstance,
  type ShiftKind,
} from "./shift-planning";

export type EmployeeLookup = { id: string; name: string };

export type CsvRowInput = {
  employeeName: string;
  shiftKind: string;
  fromDate: string;
  toDate: string;
  customStart: string;
  customEnd: string;
  note: string;
};

export type ParsedRow = {
  rowNumber: number;
  raw: CsvRowInput;
  status: "valid" | "error";
  error?: string;
  employeeId?: string;
  instances?: ShiftInstance[];
};

export type ParseOutcome =
  | { ok: true; rows: ParsedRow[]; totalShiftCount: number }
  | { ok: false; fileError: string };

const REQUIRED_HEADERS = ["employee_name", "shift_kind", "from_date"] as const;
const VALID_SHIFT_KINDS: ShiftKind[] = ["morning", "evening", "full_day"];
export const MAX_IMPORT_ROWS = 500;

export const CSV_TEMPLATE = `employee_name,shift_kind,from_date,to_date,custom_start,custom_end,note
Mia Chen,morning,2026-09-14,,,,`;

/** Minimal RFC4180-style parser: handles quoted fields with embedded commas/quotes. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsvText(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

/**
 * CSV row -> createShiftInstances() input, reusing 100% of the existing
 * pure expansion/default/overnight logic. See
 * docs/features/008-bulk-schedule-import.md.
 */
export function parseScheduleCsv(input: {
  text: string;
  employees: EmployeeLookup[];
  defaults: ShiftDefaults;
}): ParseOutcome {
  const lines = parseCsvText(input.text);
  if (lines.length === 0) {
    return { ok: false, fileError: "The file is empty." };
  }

  const header = lines[0].map((cell) => cell.trim().toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter(
    (name) => !header.includes(name),
  );
  if (missingHeaders.length > 0) {
    return {
      ok: false,
      fileError: `Missing required column(s): ${missingHeaders.join(", ")}.`,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      fileError: `A file cannot have more than ${MAX_IMPORT_ROWS} rows (found ${dataLines.length}).`,
    };
  }

  const columnIndex = (name: string) => header.indexOf(name);
  const seenRowKeys = new Set<string>();

  const rows: ParsedRow[] = dataLines.map((cells, index) => {
    const rowNumber = index + 1;
    const get = (name: string) => {
      const columnAt = columnIndex(name);
      return columnAt >= 0 ? (cells[columnAt] ?? "").trim() : "";
    };
    const raw: CsvRowInput = {
      employeeName: get("employee_name"),
      shiftKind: get("shift_kind"),
      fromDate: get("from_date"),
      toDate: get("to_date"),
      customStart: get("custom_start"),
      customEnd: get("custom_end"),
      note: get("note"),
    };

    if (!raw.employeeName) {
      return {
        rowNumber,
        raw,
        status: "error",
        error: "Missing employee name.",
      };
    }
    if (!raw.shiftKind) {
      return { rowNumber, raw, status: "error", error: "Missing shift kind." };
    }
    if (!VALID_SHIFT_KINDS.includes(raw.shiftKind as ShiftKind)) {
      return {
        rowNumber,
        raw,
        status: "error",
        error: `Unknown shift kind "${raw.shiftKind}". Use morning, evening, or full_day.`,
      };
    }
    if (!raw.fromDate) {
      return { rowNumber, raw, status: "error", error: "Missing from date." };
    }

    const matches = input.employees.filter(
      (employee) =>
        employee.name.trim().toLowerCase() ===
        raw.employeeName.trim().toLowerCase(),
    );
    if (matches.length === 0) {
      return {
        rowNumber,
        raw,
        status: "error",
        error: `Unknown employee "${raw.employeeName}".`,
      };
    }
    if (matches.length > 1) {
      return {
        rowNumber,
        raw,
        status: "error",
        error: `"${raw.employeeName}" matches more than one active employee — rename one of them or use a different value.`,
      };
    }

    const dedupeKey = `${matches[0].id}|${raw.shiftKind}|${raw.fromDate}`;
    if (seenRowKeys.has(dedupeKey)) {
      return {
        rowNumber,
        raw,
        status: "error",
        error:
          "Duplicate row: same employee, shift kind, and from date as an earlier row in this file.",
      };
    }
    seenRowKeys.add(dedupeKey);

    try {
      const instances = createShiftInstances({
        shiftKind: raw.shiftKind as ShiftKind,
        fromDate: raw.fromDate,
        toDate: raw.toDate || undefined,
        customStart: raw.customStart || undefined,
        customEnd: raw.customEnd || undefined,
        defaults: input.defaults,
      });
      return {
        rowNumber,
        raw,
        status: "valid",
        employeeId: matches[0].id,
        instances,
      };
    } catch (caught) {
      return {
        rowNumber,
        raw,
        status: "error",
        error:
          caught instanceof Error
            ? caught.message
            : "Unable to parse this row.",
      };
    }
  });

  const totalShiftCount = rows
    .filter((row) => row.status === "valid")
    .reduce((sum, row) => sum + (row.instances?.length ?? 0), 0);

  return { ok: true, rows, totalShiftCount };
}
