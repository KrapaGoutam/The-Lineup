import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  applyCommand,
  emptyTasksState,
  type TasksState,
} from "../domain/task-engine";
import { ctxFor, TEAM } from "../domain/task-test-helpers";
import type { TaskTeamMember } from "../domain/task-types";
import { TasksModule } from "./tasks-module";

const TZ = "America/Chicago";
const OWNER: TaskTeamMember = {
  profileId: "olive",
  name: "Olive",
  designation: "owner",
};
const ROSTER = [...TEAM, OWNER];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

function seed(): TasksState {
  const today = zonedWallTimeFromInstant(new Date(), TZ).date;
  let state = emptyTasksState();
  const create = (
    title: string,
    assignmentMode: "individual" | "all_team",
    assigneeIds: string[],
  ) => {
    const result = applyCommand(
      state,
      {
        type: "create",
        input: {
          title,
          instructions: null,
          category: "cleaning",
          priority: "normal",
          startDate: null,
          dueDate: today,
          dueTime: null,
          dueWindow: "closing",
          assignmentMode,
          assigneeIds,
          eachPerson: false,
        },
      },
      ctxFor("mona"),
    );
    if (!result.ok) throw new Error(result.error);
    state = result.value;
  };
  create("Clean patio", "individual", ["ann"]);
  create("Polish bar", "individual", ["bea"]);
  create("Inventory count", "individual", ["mona"]);
  create("Team huddle", "all_team", []);
  return state;
}

function Harness({ who }: { who: TaskTeamMember }) {
  const [state, setState] = useState(seed);
  return (
    <TasksModule
      restaurantSlug="the-monks"
      user={who}
      demo={{
        state,
        setState,
        team: ROSTER,
        timeZone: TZ,
        organizationId: "org",
      }}
    />
  );
}

const by = (id: string) => ROSTER.find((m) => m.profileId === id)!;
const selector = () =>
  screen.findByRole("combobox", { name: "Show tasks for" });
const rowOf = (title: string) =>
  screen
    .getAllByTestId("task-row")
    .find((row) => row.getAttribute("data-task-title") === title);

describe("Management Today (T-2, #169)", () => {
  it.each([
    ["Owner", "olive"],
    ["Manager", "mona"],
    ["Assistant Manager", "asa"],
  ])(
    "%s: All Staff by default, every row names who it belongs to",
    async (_label, id) => {
      render(<Harness who={by(id)} />);
      const select = await selector();
      expect(select).toHaveValue("all");

      const names = (title: string) =>
        within(rowOf(title)!).getByTestId("task-staff").textContent;
      expect(names("Clean patio")).toBe("Ann");
      expect(names("Polish bar")).toBe("Bea");
      expect(names("Team huddle")).toBe("Whole team");
      expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
        "All Staff: 4 tasks today",
      );
    },
  );

  it("My Tasks shows the signed-in manager's work (assigned or shared)", async () => {
    const user = userEvent.setup();
    render(<Harness who={by("mona")} />);
    await user.selectOptions(await selector(), "mine");

    expect(rowOf("Inventory count")).toBeDefined();
    expect(rowOf("Team huddle")).toBeDefined();
    expect(rowOf("Clean patio")).toBeUndefined();
    expect(rowOf("Polish bar")).toBeUndefined();
  });

  it("a specific person is chosen by id and shows only that person's named work", async () => {
    const user = userEvent.setup();
    render(<Harness who={by("asa")} />);
    const select = await selector();
    const ann = within(select).getByRole("option", { name: "Ann" });
    expect(ann).toHaveValue("person:ann");

    await user.selectOptions(select, "person:ann");
    expect(rowOf("Clean patio")).toBeDefined();
    expect(rowOf("Polish bar")).toBeUndefined();
    // Shared work is not attributed to one person.
    expect(rowOf("Team huddle")).toBeUndefined();
    expect(screen.getByRole("status")).toHaveTextContent("Ann: 1 task today");
  });

  it("explains an empty person instead of a blank list", async () => {
    const user = userEvent.setup();
    render(<Harness who={by("mona")} />);
    await user.selectOptions(await selector(), "person:cal");
    expect(screen.getByText("No tasks today for Cal.")).toBeInTheDocument();
  });

  it("keeps the choice when hopping to another Tasks section and back", async () => {
    const user = userEvent.setup();
    render(<Harness who={by("mona")} />);
    await user.selectOptions(await selector(), "person:bea");
    await user.click(screen.getByRole("button", { name: "Opening" }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(await selector()).toHaveValue("person:bea");
  });

  it("completing from a person view attributes the action to the manager", async () => {
    const user = userEvent.setup();
    render(<Harness who={by("mona")} />);
    await user.selectOptions(await selector(), "person:bea");
    await user.click(
      screen.getByRole("checkbox", { name: /Mark complete: Polish bar/ }),
    );
    await waitFor(() =>
      expect(rowOf("Polish bar")).toHaveTextContent("Completed by Mona"),
    );
    // Still Bea's task: the assignee is unchanged.
    expect(
      within(rowOf("Polish bar")!).getByTestId("task-staff"),
    ).toHaveTextContent("Bea");
  });

  it("staff get no selector and no coworker work on Today (server snapshot is RLS-shaped)", async () => {
    render(<Harness who={by("ann")} />);
    expect(await screen.findByText("Up next for you")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Show tasks for" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Today’s work")).not.toBeInTheDocument();
    expect(screen.queryByText("Polish bar")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventory count")).not.toBeInTheDocument();
    expect(screen.getByText("Clean patio")).toBeInTheDocument();
  });
});
