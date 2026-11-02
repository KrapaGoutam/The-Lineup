import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { emptyTasksState, type TasksState } from "../domain/task-engine";
import { TEAM, makeTask, viewer } from "../domain/task-test-helpers";
import type { TaskEventView, TaskView } from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { HistoryView } from "./history-view";
import { TasksModule } from "./tasks-module";

const TZ = "America/Chicago";
const ann = { profileId: "ann", name: "Ann" };
const bea = { profileId: "bea", name: "Bea" };
const mona = { profileId: "mona", name: "Mona" };

function done(overrides: Partial<TaskView>): TaskView {
  return makeTask({
    status: "completed",
    assignmentMode: "individual",
    assignees: [ann],
    completedBy: ann,
    ...overrides,
  });
}

function createdEvent(taskId: string, createdAt: string): TaskEventView {
  return {
    id: Math.random(),
    taskId,
    type: "created",
    actor: mona,
    payload: {},
    createdAt,
  };
}

function seed(): TasksState {
  const state = emptyTasksState();
  const tasks: TaskView[] = [
    done({
      id: "oct-1",
      title: "Clean espresso station",
      completedAt: "2026-10-15T18:00:00Z",
    }),
    done({
      id: "nov-1",
      title: "Restock tequila shelf",
      kind: "closing",
      checklistInstanceId: "inst-close",
      assignees: [bea],
      completedBy: mona,
      completedAt: "2026-11-02T03:42:00Z",
    }),
    done({
      id: "nov-2",
      title: "Polish bar",
      assignees: [bea],
      completedBy: bea,
      completedAt: "2026-11-01T15:00:00Z",
    }),
    makeTask({
      id: "open-1",
      title: "Still open task",
      status: "open",
      assignmentMode: "anyone",
    }),
  ];
  return {
    ...state,
    tasks,
    instances: [
      {
        id: "inst-close",
        templateId: "tpl",
        kind: "closing",
        name: "Closing",
        serviceDate: "2026-11-01",
      },
    ],
    events: [
      createdEvent("nov-1", "2026-11-02T01:10:00Z"),
      createdEvent("nov-2", "2026-10-30T15:00:00Z"),
    ],
  };
}

function Harness({
  profileId = "mona",
  initial = seed,
}: {
  profileId?: string;
  initial?: () => TasksState;
}) {
  const [state, setState] = useState(initial);
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
    />
  );
}

async function openHistory(profileId = "mona", initial = seed) {
  const user = userEvent.setup();
  render(<Harness profileId={profileId} initial={initial} />);
  await user.click(screen.getByRole("button", { name: "History" }));
  await screen.findByRole("region", { name: "Completed task history" });
  return user;
}

/** The record rows currently shown, in order. */
function rowTitles(): string[] {
  return screen
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("p")?.textContent ?? "");
}

describe("Tasks → History", () => {
  it("adds a History tab without removing the existing ones (managers and staff)", () => {
    const { unmount } = render(<Harness profileId="mona" />);
    for (const name of [
      "Today",
      "My Tasks",
      "Opening",
      "Closing",
      "Assigned",
      "Manage",
      "History",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    unmount();
    render(<Harness profileId="ann" />);
    for (const name of ["Today", "My Tasks", "Opening", "Closing", "History"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Manage" }),
    ).not.toBeInTheDocument();
  });

  it("shows completed tasks only, newest completion first, grouped by month", async () => {
    await openHistory();
    expect(screen.queryByText("Still open task")).not.toBeInTheDocument();

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "November 2026 · 2 tasks",
      "October 2026 · 1 task",
    ]);

    // Newest month is open by default; October is collapsed until opened.
    expect(rowTitles()).toEqual(["Restock tequila shelf", "Polish bar"]);
    expect(
      screen.queryByText("Clean espresso station"),
    ).not.toBeInTheDocument();
  });

  it("collapses and expands month sections", async () => {
    const user = await openHistory();
    const october = screen.getByRole("button", { name: /October 2026/ });
    expect(october).toHaveAttribute("aria-expanded", "false");
    await user.click(october);
    expect(october).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Clean espresso station")).toBeInTheDocument();

    const november = screen.getByRole("button", { name: /November 2026/ });
    await user.click(november);
    expect(screen.queryByText("Polish bar")).not.toBeInTheDocument();
  });

  it("shows task, assigned to, completed by, assigned time, completed time and type", async () => {
    await openHistory();
    const row = screen
      .getByText("Restock tequila shelf")
      .closest("li") as HTMLElement;
    const r = within(row);
    expect(r.getByText("Restock tequila shelf")).toBeInTheDocument();
    // Assigned To (Bea) and Completed By (Mona) are different people.
    expect(row.textContent).toContain("Assigned to: Bea");
    expect(row.textContent).toContain("Completed by: Mona");
    expect(row.textContent).toContain("Completed: Nov 1 · 9:42 PM");
    expect(row.textContent).toContain("Assigned: 7:10 PM");
    expect(r.getByText("Closing")).toBeInTheDocument();

    const other = screen.getByText("Polish bar").closest("li") as HTMLElement;
    expect(within(other).getByText("Regular")).toBeInTheDocument();
    // Assigned Oct 30, completed Nov 1: the assigned stamp keeps its date.
    expect(other.textContent).toContain("Assigned: Oct 30 · 10:00 AM");
  });

  it("is read-only: rows carry no actions", async () => {
    await openHistory();
    const section = screen.getByRole("region", {
      name: "Completed task history",
    });
    const row = within(section)
      .getByText("Polish bar")
      .closest("li") as HTMLElement;
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(within(row).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("searches by title", async () => {
    const user = await openHistory();
    await user.type(
      screen.getByRole("searchbox", { name: "Search task history" }),
      "espresso",
    );
    expect(screen.getByText("Clean espresso station")).toBeInTheDocument();
    expect(screen.queryByText("Polish bar")).not.toBeInTheDocument();
  });

  it("filters by assigned to, completed by and type, and clears them", async () => {
    const user = await openHistory();
    await user.click(screen.getByRole("button", { name: /Filter/ }));

    await user.selectOptions(screen.getByLabelText("Assigned to"), "bea");
    expect(rowTitles().sort()).toEqual(["Polish bar", "Restock tequila shelf"]);

    await user.selectOptions(screen.getByLabelText("Completed by"), "mona");
    expect(rowTitles()).toEqual(["Restock tequila shelf"]);

    await user.selectOptions(screen.getByLabelText("Task type"), "task");
    expect(
      screen.getByText("No task history matches these filters."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rowTitles()).toEqual(["Restock tequila shelf", "Polish bar"]);
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
  });

  it("filters by month and expands matches that would otherwise be collapsed", async () => {
    const user = await openHistory();
    await user.click(screen.getByRole("button", { name: /Filter/ }));
    await user.selectOptions(screen.getByLabelText("Month"), "2026-10");
    expect(rowTitles()).toEqual(["Clean espresso station"]);
  });

  it("offers a custom date range", async () => {
    const user = await openHistory();
    await user.click(screen.getByRole("button", { name: /Filter/ }));
    await user.selectOptions(screen.getByLabelText("Completed"), "custom");
    await user.type(screen.getByLabelText("From"), "2026-11-02");
    expect(
      screen.getByText("No task history matches these filters."),
    ).toBeInTheDocument();
  });

  it("sorts oldest first when asked, oldest month first", async () => {
    const user = await openHistory();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort order" }),
      "oldest",
    );
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "October 2026 · 1 task",
      "November 2026 · 2 tasks",
    ]);
  });

  it("explains an empty search", async () => {
    const user = await openHistory();
    await user.type(
      screen.getByRole("searchbox", { name: "Search task history" }),
      "zzz",
    );
    expect(
      screen.getByText("No completed tasks match your search."),
    ).toBeInTheDocument();
  });

  it("explains an empty history", async () => {
    await openHistory("mona", emptyTasksState);
    expect(screen.getByText("No completed tasks yet.")).toBeInTheDocument();
  });

  it("only shows staff the tasks they may already see", async () => {
    // "Polish bar" is individually assigned to Bea; Ann must not see it.
    await openHistory("ann");
    expect(screen.queryByText("Polish bar")).not.toBeInTheDocument();
    expect(screen.getByText("Restock tequila shelf")).toBeInTheDocument();
  });
});

describe("HistoryView data states", () => {
  const snapshot = { timeZone: TZ, today: "2026-11-02" };
  function controller(loadHistory: TasksController["loadHistory"]) {
    return { snapshot, loadHistory } as unknown as TasksController;
  }

  it("shows loading, then recovers from a failed load with Try again", async () => {
    const loadHistory = vi
      .fn<TasksController["loadHistory"]>()
      .mockResolvedValueOnce({
        ok: false,
        error: "Task history could not be loaded.",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          truncated: false,
          entries: [
            {
              id: "x",
              title: "Wipe menus",
              kind: "task",
              assignmentMode: "individual",
              assignees: [ann],
              completedBy: ann,
              completedAt: "2026-11-01T15:00:00Z",
              assignedAt: null,
            },
          ],
        },
      });
    const user = userEvent.setup();
    render(<HistoryView controller={controller(loadHistory)} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Task history could not be loaded.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Wipe menus")).toBeInTheDocument();
    // No stored assigned time: shown as missing, never guessed.
    expect(screen.getByText("Wipe menus").closest("li")?.textContent).toContain(
      "Assigned: —",
    );
    await waitFor(() => expect(loadHistory).toHaveBeenCalledTimes(2));
  });

  it("notes when only the most recent completions are shown", async () => {
    const loadHistory = vi
      .fn<TasksController["loadHistory"]>()
      .mockResolvedValue({
        ok: true,
        data: { entries: [], truncated: true },
      });
    render(<HistoryView controller={controller(loadHistory)} />);
    expect(
      await screen.findByText(/showing the most recent 0 completions/),
    ).toBeInTheDocument();
  });
});
