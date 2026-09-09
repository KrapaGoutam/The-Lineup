import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attendanceRosterFilename,
  attendanceSingleFilename,
  combinedStatementFilename,
  combinedStatementRosterFilename,
  formatMonthYearShort,
  payrollRosterFilename,
  payrollSingleFilename,
  triggerPrintWithFilename,
} from "./print-utils";

describe("formatMonthYearShort", () => {
  it("formats an abbreviated month and year", () => {
    expect(formatMonthYearShort(2026, 9)).toBe("Sep 2026");
    expect(formatMonthYearShort(2026, 1)).toBe("Jan 2026");
    expect(formatMonthYearShort(2026, 12)).toBe("Dec 2026");
  });
});

describe("filename conventions", () => {
  it("roster attendance: 'Staff attendance Report <Mon> <Year>'", () => {
    expect(attendanceRosterFilename(2026, 9)).toBe(
      "Staff attendance Report Sep 2026",
    );
  });

  it("single attendance: '<Name> Attendance Report <Mon> <Year>'", () => {
    expect(attendanceSingleFilename("Anil", 2026, 9)).toBe(
      "Anil Attendance Report Sep 2026",
    );
  });

  it("single payroll: '<Name> Payroll Report <Mon> <Year>'", () => {
    expect(payrollSingleFilename("Anil", { year: 2026, month: 6 })).toBe(
      "Anil Payroll Report Jun 2026",
    );
  });

  it("single payroll, all open months: '<Name> Payroll Report All Open Months'", () => {
    expect(payrollSingleFilename("Anil", "all-open-months")).toBe(
      "Anil Payroll Report All Open Months",
    );
  });

  it("roster payroll: 'Staff Payroll Report <Mon> <Year>'", () => {
    expect(payrollRosterFilename({ year: 2026, month: 9 })).toBe(
      "Staff Payroll Report Sep 2026",
    );
  });

  it("roster payroll, all open months: 'Staff Payroll Report All Open Months'", () => {
    expect(payrollRosterFilename("all-open-months")).toBe(
      "Staff Payroll Report All Open Months",
    );
  });

  it("combined statement: '<Name> Monthly Report <Mon> <Year>'", () => {
    expect(combinedStatementFilename("Conan", 2026, 7)).toBe(
      "Conan Monthly Report Jul 2026",
    );
  });

  it("combined statement, all employees: 'Staff Payroll Statements <Mon> <Year>'", () => {
    expect(combinedStatementRosterFilename(2026, 9)).toBe(
      "Staff Payroll Statements Sep 2026",
    );
  });

  it("roster and single conventions capitalize 'Report' differently on purpose", () => {
    // "Staff attendance Report" (lowercase attendance) vs "Staff Payroll
    // Report" (capital Payroll) -- both spelled exactly as specified,
    // not a typo to unify.
    expect(attendanceRosterFilename(2026, 9)).toContain("Staff attendance");
    expect(payrollRosterFilename({ year: 2026, month: 9 })).toContain(
      "Staff Payroll",
    );
  });
});

describe("triggerPrintWithFilename", () => {
  let printSpy: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    printSpy = vi.fn<() => void>();
    window.print = printSpy;
    document.title = "ServiceFlow";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets document.title before printing, calling onBeforePrint first", () => {
    const order: string[] = [];
    triggerPrintWithFilename("Anil Attendance Report Sep 2026", () => {
      order.push("onBeforePrint");
      expect(document.title).toBe("Anil Attendance Report Sep 2026");
    });
    // The title write and onBeforePrint callback happen synchronously,
    // before window.print() is ever reached (still pending behind the
    // internal setTimeout).
    expect(document.title).toBe("Anil Attendance Report Sep 2026");
    expect(printSpy).not.toHaveBeenCalled();
    order.push("checked");
    expect(order).toEqual(["onBeforePrint", "checked"]);

    vi.advanceTimersByTime(50);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("restores the original title once afterprint fires", () => {
    triggerPrintWithFilename("Staff Payroll Report Sep 2026");
    vi.advanceTimersByTime(50);
    expect(document.title).toBe("Staff Payroll Report Sep 2026");

    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("ServiceFlow");
  });

  it("restores the original title via the fallback timeout if afterprint never fires", () => {
    triggerPrintWithFilename("Staff Payroll Report Sep 2026");
    vi.advanceTimersByTime(50); // fire window.print()
    expect(document.title).toBe("Staff Payroll Report Sep 2026");

    vi.advanceTimersByTime(2000); // fallback restore, no afterprint dispatched
    expect(document.title).toBe("ServiceFlow");
  });

  it("does not double-restore if afterprint fires before the fallback timeout", () => {
    triggerPrintWithFilename("Conan Monthly Report Jul 2026");
    vi.advanceTimersByTime(50);
    window.dispatchEvent(new Event("afterprint"));
    document.title = "Something else entirely";

    // The fallback timeout still fires, but its listener was already
    // removed by the first restore -- it must not stomp on whatever the
    // title is by then.
    vi.advanceTimersByTime(2000);
    expect(document.title).toBe("Something else entirely");
  });
});
