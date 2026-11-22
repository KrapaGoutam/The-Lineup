import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { applyChoreCommand, emptyChoreState } from "../domain/chore-engine";
import type { ChoreCommand } from "../domain/chore-commands";
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

/** Two finished chore runs (one completed, one cancelled) and one in progress, built through the real demo engine. */
function choreHistory() {
  let state = emptyChoreState();
  const ctx = {
    viewer: { profileId: "mona", name: "Mona", isManager: true },
    team: TEAM,
    organizationId: "org",
    locationId: "demo-location",
    now: new Date("2026-11-10T18:00:00Z"),
    timeZone: TZ,
  };
  const run = (command: ChoreCommand, who = ctx.viewer) => {
    const result = applyChoreCommand(state, command, {
      ...ctx,
      viewer: who,
    });
    if (!result.ok) throw new Error(result.error);
    state = result.value;
    return result.outcome;
  };
  run({
    type: "boardSave",
    boardId: null,
    name: "Mango Lassi",
    description: null,
    staffAccess: "own_column",
    managerOverride: true,
    defaultMode: "all_columns",
    recurrenceIntent: "continuous",
    resetIntent: "automatic_after_completion",
    expectedVersion: null,
  });
  const boardId = state.boards[0].id;
  run({
    type: "columnSave",
    boardId,
    columnId: null,
    label: "Ann",
    profileId: "ann",
  });
  run({
    type: "rowSave",
    boardId,
    rowId: null,
    title: "Bucket 1",
    instructions: null,
    required: true,
    mode: "all_columns",
    columnIds: [],
  });
  const columnId = state.boards[0].columns[0].id;
  const rowId = state.boards[0].rows[0].id;
  // Ann completes the only required cell: the run closes by itself and run 2 opens.
  const outcome = run(
    { type: "cellSet", boardId, rowId, columnId, done: true },
    { profileId: "ann", name: "Ann", isManager: false },
  );
  expect(outcome).toBe("checked_closed");
  return state;
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
      id: "open-nov",
      title: "Refill dining room napkins",
      status: "open",
      assignmentMode: "anyone",
      dueDate: "2026-11-20",
    }),
    makeTask({
      id: "prog-oct",
      title: "Check refrigerator temperatures",
      status: "in_progress",
      assignmentMode: "individual",
      assignees: [ann],
      dueDate: "2026-10-05",
    }),
  ];
  return {
    ...state,
    tasks,
    chores: choreHistory(),
    instances: [
      {
        id: "inst-close",
        templateId: "tpl",
        kind: "closing",
        name: "Closing",
        serviceDate: "2026-11-01",
      },
    ],
    events: [createdEvent("nov-1", "2026-11-02T01:10:00Z")],
  };
}

function Harness({ profileId = "mona" }: { profileId?: string }) {
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
    />
  );
}

async function openHistory(profileId = "mona") {
  const user = userEvent.setup();
  render(<Harness profileId={profileId} />);
  await user.click(screen.getByRole("button", { name: "History" }));
  await screen.findByRole("region", { name: "Task history" });
  await screen.findByText(/Clean espresso station|Restock tequila shelf/);
  return user;
}

function month(name: string) {
  return screen.getByRole("region", { name });
}

describe("Tasks → History (unified)", () => {
  it("offers All / Tasks / Chore Wheel and keeps the existing sections", async () => {
    await openHistory();
    const type = screen.getByRole("group", { name: "History type" });
    for (const label of ["All", "Tasks", "Chore Wheel"]) {
      expect(
        within(type).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
    for (const name of ["Today", "My Tasks", "All Tasks", "Chore Wheel"]) {
      expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
    }
  });

  it("groups by month, then Completed and Not completed, keeping the real status", async () => {
    const user = await openHistory();
    // Open every month.
    for (const header of screen.getAllByRole("button", { expanded: false })) {
      if (/20\d\d/.test(header.textContent ?? "")) await user.click(header);
    }
    const nov = month("November 2026");
    const novDone = within(nov).getByTestId("history-completed");
    expect(novDone).toHaveTextContent("Polish bar");
    expect(novDone).toHaveTextContent("Restock tequila shelf");
    const novOpen = within(nov).getByTestId("history-not-completed");
    expect(novOpen).toHaveTextContent("Refill dining room napkins");
    expect(novOpen).toHaveTextContent("Not Started");
    expect(novOpen).not.toHaveTextContent("Polish bar");

    const oct = month("October 2026");
    expect(within(oct).getByTestId("history-completed")).toHaveTextContent(
      "Clean espresso station",
    );
    const octOpen = within(oct).getByTestId("history-not-completed");
    expect(octOpen).toHaveTextContent("Check refrigerator temperatures");
    expect(octOpen).toHaveTextContent("In Progress");
    // The grouping basis is stated on each row.
    expect(novOpen).toHaveTextContent("Due");
    expect(novDone).toHaveTextContent("Completed");
  });

  it("shows chore runs (completed, in progress) next to tasks and filters by type", async () => {
    const user = await openHistory();
    for (const header of screen.getAllByRole("button", { expanded: false })) {
      if (/20\d\d/.test(header.textContent ?? "")) await user.click(header);
    }
    const runs = await screen.findAllByTestId("history-run-row");
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const finished = runs.find((r) => /Run 1/.test(r.textContent ?? ""));
    const live = runs.find((r) => /Run 2/.test(r.textContent ?? ""));
    expect(finished).toHaveTextContent("Mango Lassi");
    expect(finished).toHaveTextContent("Completed");
    expect(finished).toHaveTextContent("1 of 1 required");
    // Closed automatically: never attributed to the employee who ticked the last cell.
    expect(finished).toHaveTextContent("Closed automatically");
    expect(finished).not.toHaveTextContent("Closed by Ann");
    expect(live).toHaveTextContent("In progress");
    expect(
      finished?.closest("[data-testid='history-completed']"),
    ).not.toBeNull();
    expect(
      live?.closest("[data-testid='history-not-completed']"),
    ).not.toBeNull();

    const type = screen.getByRole("group", { name: "History type" });
    await user.click(within(type).getByRole("button", { name: "Tasks" }));
    expect(screen.queryAllByTestId("history-run-row")).toHaveLength(0);
    expect(screen.getAllByTestId("history-task-row").length).toBeGreaterThan(0);

    await user.click(within(type).getByRole("button", { name: "Chore Wheel" }));
    expect(screen.queryAllByTestId("history-task-row")).toHaveLength(0);
    expect(screen.getAllByTestId("history-run-row").length).toBe(2);
  });

  it("a manager changes a completed task's status and it moves to Not completed", async () => {
    const user = await openHistory();
    for (const header of screen.getAllByRole("button", { expanded: false })) {
      if (/20\d\d/.test(header.textContent ?? "")) await user.click(header);
    }
    const nov = month("November 2026");
    expect(within(nov).getByTestId("history-completed")).toHaveTextContent(
      "Polish bar",
    );
    // Completed tasks cannot be edited or reassigned until they are reopened: the row says so.
    const picker = within(nov).getByRole("combobox", {
      name: "Status: Polish bar",
    });
    await user.selectOptions(picker, "in_progress");

    await waitFor(() => {
      const open = screen
        .getAllByTestId("history-not-completed")
        .some((el) => /Polish bar/.test(el.textContent ?? ""));
      expect(open).toBe(true);
    });
    for (const el of screen.getAllByTestId("history-completed")) {
      expect(el).not.toHaveTextContent("Polish bar");
    }
    // The new status is visible on the row.
    const row = screen
      .getAllByTestId("history-task-row")
      .find((r) => /Polish bar/.test(r.textContent ?? ""));
    expect(row).toHaveTextContent("In Progress");
  });

  it("filters by status, employee and search without losing the grouping", async () => {
    const user = await openHistory();
    await user.click(screen.getByRole("button", { name: /Filter/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Employee" }),
      "bea",
    );
    const rows = screen.getAllByTestId("history-task-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.textContent).toMatch(/Bea|Mona/);
    // Runs belong to the whole board, so an employee filter hides them.
    expect(screen.queryAllByTestId("history-run-row")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await user.type(
      screen.getByRole("searchbox", { name: "Search history" }),
      "mango",
    );
    expect(await screen.findAllByTestId("history-run-row")).not.toHaveLength(0);
    expect(screen.queryAllByTestId("history-task-row")).toHaveLength(0);
    await user.clear(screen.getByRole("searchbox", { name: "Search history" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search history" }),
      "zzz",
    );
    expect(
      await screen.findByText("Nothing matches these filters."),
    ).toBeInTheDocument();
  });

  it("only managers can open the saved run (staff see the summary)", async () => {
    const user = await openHistory("ann");
    for (const header of screen.getAllByRole("button", { expanded: false })) {
      if (/20\d\d/.test(header.textContent ?? "")) await user.click(header);
    }
    expect(screen.queryByTestId("history-open-run")).not.toBeInTheDocument();
  });

  it("a manager opens the frozen run and appends a correction without changing the original", async () => {
    const user = await openHistory();
    for (const header of screen.getAllByRole("button", { expanded: false })) {
      if (/20\d\d/.test(header.textContent ?? "")) await user.click(header);
    }
    await user.click(screen.getByTestId("history-open-run"));
    const dialog = await screen.findByTestId("chore-run-detail");
    expect(dialog).toHaveTextContent("1 of 1 required checks");
    expect(within(dialog).getByRole("table")).toHaveTextContent("Bucket 1");
    expect(dialog).toHaveTextContent(
      "None. This is exactly what was recorded.",
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: /Correct Bucket 1, Ann: done/,
      }),
    );
    const form = within(dialog).getByTestId("chore-correction-form");
    await user.type(
      within(form).getByTestId("chore-correction-reason"),
      "Ann was off shift",
    );
    await user.click(within(form).getByTestId("chore-correction-save"));

    const list = await within(dialog).findByTestId("chore-corrections");
    expect(list).toHaveTextContent("done → not done");
    expect(list).toHaveTextContent("Ann was off shift");
    expect(list).toHaveTextContent("originally recorded by Ann");
    // Recorded vs corrected are shown separately.
    expect(dialog).toHaveTextContent("1 of 1 required checks");
    expect(dialog).toHaveTextContent("After corrections");
  });
});

describe("HistoryView data states", () => {
  const snapshot = { timeZone: TZ, today: "2026-11-02" };
  function controller(loadHistoryFeed: TasksController["loadHistoryFeed"]) {
    return {
      snapshot,
      loadHistoryFeed,
      viewer: viewer("mona"),
      pendingIds: new Set<string>(),
      now: new Date("2026-11-02T12:00:00Z"),
    } as unknown as TasksController;
  }
  const noop = () => undefined;
  const props = {
    categoryName: () => "Other",
    execute: vi.fn(),
    onOpen: noop,
    onEdit: noop,
    onReassign: noop,
    onDelete: noop,
  };

  it("recovers from a failed load with Try again", async () => {
    const load = vi
      .fn<TasksController["loadHistoryFeed"]>()
      .mockResolvedValueOnce({
        ok: false,
        error: "Task history could not be loaded.",
      })
      .mockResolvedValue({
        ok: true,
        data: {
          truncated: false,
          events: [],
          tasks: [
            {
              task: done({
                id: "x",
                title: "Wipe menus",
                completedAt: "2026-11-01T15:00:00Z",
              }),
              assignedAt: null,
              archived: false,
            },
          ],
        },
      });
    const user = userEvent.setup();
    render(<HistoryView controller={controller(load)} {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Task history could not be loaded.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Wipe menus")).toBeInTheDocument();
    // No stored assigned time: shown as missing, never guessed.
    expect(screen.getByText("Wipe menus").closest("li")?.textContent).toContain(
      "Assigned: —",
    );
  });

  it("asks for a month when only the most recent records were loaded", async () => {
    const load = vi.fn<TasksController["loadHistoryFeed"]>().mockResolvedValue({
      ok: true,
      data: { tasks: [], events: [], truncated: true },
    });
    render(<HistoryView controller={controller(load)} {...props} />);
    expect(
      await screen.findByText(/choose a month for older ones/),
    ).toBeInTheDocument();
  });
});
