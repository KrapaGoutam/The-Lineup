import { describe, expect, it } from "vitest";

import { MAX_IMPORT_ROWS, parseScheduleCsv } from "./parse-schedule-csv";
import type { ShiftDefaults } from "./shift-planning";

const defaults: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

const employees = [
  { id: "mia", name: "Mia Chen" },
  { id: "leo", name: "Leo Park" },
  { id: "dup1", name: "Alex Ray" },
  { id: "dup2", name: "Alex Ray" },
];

function csv(rows: string[]) {
  return [
    "employee_name,shift_kind,from_date,to_date,custom_start,custom_end,note",
    ...rows,
  ].join("\n");
}

describe("parseScheduleCsv", () => {
  it("parses a valid single-day row", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Mia Chen,morning,2026-09-14,,,,Patio"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].status).toBe("valid");
    expect(outcome.rows[0].employeeId).toBe("mia");
    expect(outcome.totalShiftCount).toBe(1);
  });

  it("expands a date range into multiple instances", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Leo Park,evening,2026-09-14,2026-09-16,,,"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].instances).toHaveLength(3);
    expect(outcome.totalShiftCount).toBe(3);
  });

  it("rejects a file missing required columns", () => {
    const outcome = parseScheduleCsv({
      text: "employee_name,shift_kind\nMia Chen,morning",
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.fileError).toContain("from_date");
  });

  it("rejects a file over the row cap", () => {
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      () => "Mia Chen,morning,2026-09-14,,,,",
    );
    const outcome = parseScheduleCsv({ text: csv(rows), employees, defaults });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.fileError).toContain(String(MAX_IMPORT_ROWS));
  });

  it("flags a row with an unresolved employee name", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Ghost Person,morning,2026-09-14,,,,"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].status).toBe("error");
    expect(outcome.rows[0].error).toContain("Unknown employee");
  });

  it("flags a row with an ambiguous duplicate employee name", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Alex Ray,morning,2026-09-14,,,,"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].status).toBe("error");
    expect(outcome.rows[0].error).toContain("more than one");
  });

  it("flags a bad shift kind", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Mia Chen,brunch,2026-09-14,,,,"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].status).toBe("error");
    expect(outcome.rows[0].error).toContain("Unknown shift kind");
  });

  it("flags a bad date via the underlying domain function", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Mia Chen,morning,not-a-date,,,,"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].status).toBe("error");
    expect(outcome.rows[0].error).toContain("ISO date");
  });

  it("flags a lone custom start without a matching end", () => {
    const outcome = parseScheduleCsv({
      text: csv(["Mia Chen,morning,2026-09-14,,10:00,,"]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].status).toBe("error");
    expect(outcome.rows[0].error).toContain("Custom start and end");
  });

  it("flags a duplicate row within the same file", () => {
    const outcome = parseScheduleCsv({
      text: csv([
        "Mia Chen,morning,2026-09-14,,,,",
        "Mia Chen,morning,2026-09-14,,,,",
      ]),
      employees,
      defaults,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rows[0].status).toBe("valid");
    expect(outcome.rows[1].status).toBe("error");
    expect(outcome.rows[1].error).toContain("Duplicate row");
  });
});
