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
          instructions: "Wipe it down",
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
  create("Team huddle", "all_team", []);
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
    />
  );
}

describe("Tasks workspace (demo engine)", () => {
  it("shows staff only their own work and lets them complete it (TASK-005)", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="ann" />);

    await user.click(screen.getByRole("button", { name: "My Tasks" }));
    const patio = await screen.findByRole("checkbox", {
      name: /Mark complete: Clean patio/,
    });
    expect(screen.queryByText("Polish bar")).not.toBeInTheDocument();
    expect(screen.getByText("Team huddle")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New task/ }),
    ).not.toBeInTheDocument();

    await user.click(patio);
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Reopen: Clean patio/ }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("hides the audit history from staff (TASK-060)", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="ann" />);
    await user.click(screen.getByRole("button", { name: "My Tasks" }));
    await user.click(await screen.findByText("Clean patio"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Wipe it down")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("region", { name: "Task history" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Reassign/ }),
    ).not.toBeInTheDocument();
  });

  it("gives managers creation, history and completion on behalf (TASK-006/061)", async () => {
    const user = userEvent.setup();
    render(<Harness profileId="mona" />);

    expect(
      screen.getByRole("button", { name: /New task/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "My Tasks" }));
    // Managers see tasks open to the team; open the shared one.
    await user.click(await screen.findByText("Team huddle"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("region", { name: "Task history" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Created")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Reassign/ }),
    ).toBeInTheDocument();
  });
});
