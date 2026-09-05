import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";

import { CsvImportPanel } from "./csv-import-panel";

const shiftDefaults: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

const employees = [{ id: "mia", name: "Mia Chen" }];

function makeCsvFile(text: string) {
  return new File([text], "shifts.csv", { type: "text/csv" });
}

describe("CsvImportPanel", () => {
  it("previews a valid row and commits it as a draft shift", async () => {
    const onCommit = vi.fn();
    render(
      <CsvImportPanel
        employees={employees}
        shiftDefaults={shiftDefaults}
        onCommit={onCommit}
        onClose={vi.fn()}
      />,
    );
    const file = makeCsvFile(
      [
        "employee_name,shift_kind,from_date,to_date,custom_start,custom_end,note",
        "Mia Chen,morning,2026-09-14,,,,",
      ].join("\n"),
    );
    const input = screen.getByLabelText(/Choose CSV file/);
    await userEvent.upload(input, file);

    await waitFor(() => expect(screen.getByText("Valid")).toBeInTheDocument());
    const commitButton = screen.getByRole("button", {
      name: /Create 1 draft shift/,
    });
    expect(commitButton).toBeEnabled();

    await userEvent.click(commitButton);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toHaveLength(1);
  });

  it("blocks commit on an unresolved error row, then allows it once skipped", async () => {
    const onCommit = vi.fn();
    render(
      <CsvImportPanel
        employees={employees}
        shiftDefaults={shiftDefaults}
        onCommit={onCommit}
        onClose={vi.fn()}
      />,
    );
    const file = makeCsvFile(
      [
        "employee_name,shift_kind,from_date,to_date,custom_start,custom_end,note",
        "Ghost Person,morning,2026-09-14,,,,",
        "Mia Chen,morning,2026-09-15,,,,",
      ].join("\n"),
    );
    const input = screen.getByLabelText(/Choose CSV file/);
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(screen.getByText(/Unknown employee/)).toBeInTheDocument(),
    );
    const commitButton = screen.getByRole("button", {
      name: /Create.*draft shift/,
    });
    expect(commitButton).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Skip this row"));
    await waitFor(() => expect(commitButton).toBeEnabled());

    await userEvent.click(commitButton);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toHaveLength(1);
  });
});
