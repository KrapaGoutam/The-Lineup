import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import {
  applyCommand,
  emptyTasksState,
  type TasksState,
} from "../domain/task-engine";
import { ctxFor, TEAM, viewer } from "../domain/task-test-helpers";
import { TasksModule } from "./tasks-module";

const TZ = "America/Chicago";

beforeAll(() => {
  // jsdom has no <dialog> modal support; mirror what the browser does.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

function seed(): TasksState {
  let state = emptyTasksState();
  const create = (
    title: string,
    assigneeIds: string[],
    checklist?: { title: string }[],
  ) => {
    const result = applyCommand(
      state,
      {
        type: "create",
        input: {
          title,
          instructions: "Wipe it down",
          category: "kitchen",
          priority: "normal",
          startDate: null,
          dueDate: null,
          dueTime: null,
          dueWindow: null,
          assignmentMode: "individual",
          assigneeIds,
          eachPerson: false,
          checklist,
        },
      },
      ctxFor("mona"),
    );
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  };
  create("Clean patio", ["ann"]);
  create(
    "Opening Kitchen",
    ["ann"],
    [{ title: "Check fridge temps" }, { title: "Refill lassi" }],
  );
  create("Polish bar", ["bea"]);
  return state;
}

function Harness({ profileId }: { profileId: string }) {
  const [state, setState] = useState(seed);
  return (
    <TasksModule
      restaurantSlug="the-monks"
      user={viewer(profileId)}
      demo={{
        state,
        setState,
        team: TEAM,
        timeZone: TZ,
        organizationId: "org",
      }}
      contextLabel="Monks · Webster"
    />
  );
}

async function openAllTasks(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "All Tasks" }));
  return screen.findByRole("region", { name: "All tasks" });
}

describe("All Tasks register (demo engine)", () => {
  it("shows the context, summary and only the tasks this viewer may see", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="ann" />);
    const region = await openAllTasks(user);
    expect(within(region).getByText(/Monks · Webster/)).toBeInTheDocument();
    expect(within(region).getByTestId("register-summary")).toHaveTextContent(
      "2 tasks",
    );
    expect(within(region).getByText("Clean patio")).toBeInTheDocument();
    expect(within(region).queryByText("Polish bar")).not.toBeInTheDocument();
  });

  it("gives staff no manager actions (edit, reassign, delete)", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="ann" />);
    const region = await openAllTasks(user);
    expect(
      within(region).queryByRole("button", { name: /^Delete:/ }),
    ).not.toBeInTheDocument();
    expect(
      within(region).queryByRole("button", { name: /^Reassign:/ }),
    ).not.toBeInTheDocument();
    expect(
      within(region).queryByRole("button", { name: /^Edit:/ }),
    ).not.toBeInTheDocument();
  });

  it("searches (including checklist steps) and filters by status", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    const region = await openAllTasks(user);
    await user.type(
      within(region).getByRole("searchbox", { name: "Search tasks" }),
      "lassi",
    );
    expect(within(region).getByText("Opening Kitchen")).toBeInTheDocument();
    expect(within(region).queryByText("Clean patio")).not.toBeInTheDocument();

    await user.clear(within(region).getByRole("searchbox"));
    await user.selectOptions(
      within(region).getByRole("combobox", { name: "Status: Clean patio" }),
      "In Progress",
    );
    await user.click(
      within(region).getByRole("button", { name: /^In Progress/ }),
    );
    expect(within(region).getByText("Clean patio")).toBeInTheDocument();
    expect(within(region).queryByText("Polish bar")).not.toBeInTheDocument();
  });

  it("changes status from the row without leaving the list", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    const region = await openAllTasks(user);
    const select = within(region).getByRole("combobox", {
      name: "Status: Polish bar",
    });
    await user.selectOptions(select, "Completed");
    await waitFor(() => expect(select).toHaveValue("completed"));
    await user.selectOptions(select, "Not Started");
    await waitFor(() => expect(select).toHaveValue("open"));
  });

  it("shows checklist progress on the row", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    const region = await openAllTasks(user);
    expect(within(region).getByText("0 of 2 steps")).toBeInTheDocument();
  });

  it("deletes a history-free task after an explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    const region = await openAllTasks(user);
    await user.click(
      within(region).getByRole("button", { name: "Delete: Polish bar" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/archived instead/)).toBeInTheDocument();
    // Nothing is removed until the person confirms.
    expect(within(region).getByText("Polish bar")).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Delete task" }),
    );
    await waitFor(() =>
      expect(within(region).queryByText("Polish bar")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Task deleted.");
  });

  it("archives (not deletes) a task that already has history", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    const region = await openAllTasks(user);
    await user.selectOptions(
      within(region).getByRole("combobox", { name: "Status: Polish bar" }),
      "In Progress",
    );
    await user.click(
      within(region).getByRole("button", { name: "Delete: Polish bar" }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete task",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/archived/i),
    );
    expect(within(region).queryByText("Polish bar")).not.toBeInTheDocument();
  });

  it("reassigns from the row", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    const region = await openAllTasks(user);
    await user.click(
      within(region).getByRole("button", { name: "Reassign: Clean patio" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      dialog.querySelector<HTMLSelectElement>("#reassign-dialog-person")!,
      "cal",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save assignment" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const row = within(region).getByText("Clean patio").closest("li")!;
    expect(within(row).getByTestId("task-staff")).toHaveTextContent("Cal");
  });
});

describe("Checklists tab (demo engine)", () => {
  it("lists only tasks that have steps, and ticks a step without completing the task", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="ann" />);
    await user.click(screen.getByRole("button", { name: "Checklists" }));
    const region = await screen.findByRole("region", { name: "Checklists" });
    expect(within(region).getByText("Opening Kitchen")).toBeInTheDocument();
    expect(within(region).queryByText("Clean patio")).not.toBeInTheDocument();
    expect(within(region).getByText("0 of 2 completed")).toBeInTheDocument();

    await user.click(
      within(region).getByRole("checkbox", {
        name: "Check: Check fridge temps",
      }),
    );
    await waitFor(() =>
      expect(within(region).getByText("1 of 2 completed")).toBeInTheDocument(),
    );
    await user.click(
      within(region).getByRole("checkbox", { name: "Check: Refill lassi" }),
    );
    await waitFor(() =>
      expect(within(region).getByText("2 of 2 completed")).toBeInTheDocument(),
    );
    // Every step is ticked, but the parent task is still Not Started.
    expect(within(region).getByText("Not Started")).toBeInTheDocument();
    // Unticking works too.
    await user.click(
      within(region).getByRole("checkbox", { name: "Uncheck: Refill lassi" }),
    );
    await waitFor(() =>
      expect(within(region).getByText("1 of 2 completed")).toBeInTheDocument(),
    );
  });

  it("offers staff no structure editing and managers a New checklist action", async () => {
    const user = userEvent.setup();
    const staff = render(<Harness profileId="ann" />);
    await user.click(screen.getByRole("button", { name: "Checklists" }));
    expect(
      screen.queryByRole("button", { name: /New checklist/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Edit steps/ }),
    ).not.toBeInTheDocument();
    staff.unmount();

    render(<Harness profileId="mona" />);
    await user.click(screen.getByRole("button", { name: "Checklists" }));
    expect(
      screen.getByRole("button", { name: /New checklist/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit steps: Opening Kitchen" }),
    ).toBeInTheDocument();
  });

  it("creates a checklist-enabled task from New checklist and edits its steps", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);
    await user.click(screen.getByRole("button", { name: "Checklists" }));
    await user.click(screen.getByRole("button", { name: /New checklist/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "New checklist" }),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Title"), "Closing bar");
    await user.selectOptions(
      dialog.querySelector<HTMLSelectElement>("#task-person")!,
      "ann",
    );
    await user.type(within(dialog).getByLabelText("Step 1"), "Wipe taps");
    await user.click(within(dialog).getByRole("button", { name: "Add step" }));
    await user.type(within(dialog).getByLabelText("Step 2"), "Empty ice");
    // Reorder: move step 2 up, so "Empty ice" is first.
    await user.click(
      within(dialog).getByRole("button", { name: "Move step 2 up" }),
    );
    expect(within(dialog).getByLabelText("Step 1")).toHaveValue("Empty ice");
    await user.click(
      within(dialog).getByRole("button", { name: "Create task" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const region = screen.getByRole("region", { name: "Checklists" });
    const card = within(region).getByText("Closing bar").closest("li")!;
    const labels = within(card)
      .getAllByRole("checkbox")
      .map((box) => box.getAttribute("aria-label"));
    expect(labels).toEqual(["Check: Empty ice", "Check: Wipe taps"]);
  });
});
