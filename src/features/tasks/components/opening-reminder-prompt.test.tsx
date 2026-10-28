import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { OpeningReminderStage } from "../domain/opening-reminder";
import type { OpeningReminderPromptData } from "../domain/opening-reminder-popup";
import type { NotificationView } from "../domain/task-types";
import {
  WAKE_HEARTBEAT_MS,
  type OpeningReminderLoadResult,
  type OpeningReminderSource,
} from "../hooks/use-opening-reminder-prompt";
import { OpeningReminderPrompt } from "./opening-reminder-prompt";

const TODAY = "2026-10-30";
const LOC = "loc-1";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    if (this.hasAttribute("open")) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    }
  };
});

let seq = 0;
function row(stage: OpeningReminderStage, readAt: string | null = null) {
  seq += 1;
  const n: NotificationView = {
    id: seq,
    type: "opening_reminder",
    title: "Opening tasks are overdue",
    body: null,
    taskId: null,
    checklistInstanceId: null,
    createdAt: "2026-10-30T14:34:00Z",
    readAt,
    reminder: {
      stage,
      serviceDate: TODAY,
      locationId: LOC,
      stageAt: "2026-10-30T14:00:00Z",
      incompleteCount: 3,
      incompleteNow: 3,
    },
  };
  return n;
}

/** A tiny stand-in for the database: it outlives any component mounted on it. */
function fakeServer(initial: NotificationView[], currentIncomplete = 3) {
  const server = {
    reminders: initial,
    currentIncomplete,
    loads: 0,
    acks: [] as number[],
    failNextLoad: false,
    failAck: false,
    next: null as OpeningReminderLoadResult | null,
    source: {
      async load(): Promise<OpeningReminderLoadResult> {
        server.loads += 1;
        if (server.next) return server.next;
        if (server.failNextLoad) {
          server.failNextLoad = false;
          throw new Error("network");
        }
        const data: OpeningReminderPromptData = {
          today: TODAY,
          locationId: LOC,
          currentIncomplete: server.currentIncomplete,
          reminders: server.reminders.map((n) => ({ ...n })),
        };
        return { ok: true, data };
      },
      async acknowledge(id: number) {
        server.acks.push(id);
        if (server.failAck) return false;
        server.reminders = server.reminders.map((n) =>
          n.id === id ? { ...n, readAt: "2026-10-30T14:35:00Z" } : n,
        );
        return true;
      },
    } satisfies OpeningReminderSource,
  };
  return server;
}

const dialogs = () => screen.queryAllByRole("dialog");

async function mount(
  server: ReturnType<typeof fakeServer>,
  props: { isManagement?: boolean; onViewTasks?: () => void } = {},
) {
  const view = render(
    <OpeningReminderPrompt
      source={server.source}
      isManagement={props.isManagement ?? true}
      onViewTasks={props.onViewTasks ?? (() => {})}
      onSessionInvalid={() => {}}
    />,
  );
  await act(async () => {});
  return view;
}

beforeEach(() => {
  seq = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Opening reminder popup (T-5)", () => {
  it("CATCH-UP: OPEN + +15 + +30 stored -> exactly one dialog, the +30 one", async () => {
    const server = fakeServer([row("open"), row("plus_15"), row("plus_30")]);
    await mount(server);
    expect(dialogs()).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "Opening Tasks Need Attention" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 Opening items need attention."),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    // Accessible name and description are wired to the dialog.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(
      "3 Opening items need attention.",
    );
  });

  it("a single OPEN and a single +15 each get their own popup", async () => {
    const open = await mount(fakeServer([row("open")]));
    expect(screen.getByText("Opening Tasks Are Ready")).toBeInTheDocument();
    open.unmount();
    await mount(fakeServer([row("plus_15")]));
    expect(
      screen.getByText("3 Opening items are still incomplete."),
    ).toBeInTheDocument();
  });

  it("Dismiss acknowledges only the shown reminder and keeps the older ones unread", async () => {
    const server = fakeServer([row("open"), row("plus_15"), row("plus_30")]);
    await mount(server);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await act(async () => {});
    expect(server.acks).toEqual([3]);
    expect(dialogs()).toHaveLength(0);
    expect(server.reminders.map((n) => !!n.readAt)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("RELOAD after dismiss: a fresh mount on the same server state shows nothing", async () => {
    const server = fakeServer([row("open"), row("plus_15"), row("plus_30")]);
    const first = await mount(server);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await act(async () => {});
    first.unmount();
    await mount(server);
    expect(dialogs()).toHaveLength(0);
  });

  it("the close button and Escape are the same acknowledgement as Dismiss", async () => {
    const closeServer = fakeServer([row("plus_15")]);
    const a = await mount(closeServer);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => {});
    expect(closeServer.acks).toEqual([closeServer.reminders[0].id]);
    a.unmount();

    const escServer = fakeServer([row("plus_15")]);
    await mount(escServer);
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(screen.getByRole("dialog"), cancel);
    await act(async () => {});
    expect(escServer.acks).toEqual([escServer.reminders[0].id]);
    expect(dialogs()).toHaveLength(0);
  });

  it("View Opening Tasks acknowledges, then navigates once", async () => {
    const server = fakeServer([row("open"), row("plus_30")]);
    const onViewTasks = vi.fn();
    await mount(server, { onViewTasks });
    fireEvent.click(screen.getByRole("button", { name: "View Opening Tasks" }));
    await act(async () => {});
    expect(onViewTasks).toHaveBeenCalledTimes(1);
    expect(server.acks).toEqual([2]);
    expect(dialogs()).toHaveLength(0);
  });

  it("focus starts on the primary action", async () => {
    await mount(fakeServer([row("plus_30")]));
    expect(
      screen.getByRole("button", { name: "View Opening Tasks" }),
    ).toHaveFocus();
  });

  it("completed or cancelled work since the reminder: no popup", async () => {
    const server = fakeServer([row("open"), row("plus_15"), row("plus_30")], 0);
    await mount(server);
    expect(dialogs()).toHaveLength(0);
  });

  it("Staff see their own generic reminder: no number, no names", async () => {
    await mount(fakeServer([row("plus_15")], 2), { isManagement: false });
    const dialog = screen.getByRole("dialog", {
      name: "Opening Task Reminder",
    });
    expect(dialog).toHaveAccessibleDescription(
      "You still have Opening work to complete.",
    );
    expect(
      screen.getByRole("button", { name: "View My Opening Tasks" }),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/\d/);
  });

  it("a failed wake neither crashes nor invents a reminder, and the next wake recovers", async () => {
    vi.useFakeTimers();
    const server = fakeServer([row("plus_30")]);
    server.failNextLoad = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount(server);
    expect(dialogs()).toHaveLength(0);
    errors.mockRestore();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAKE_HEARTBEAT_MS);
    });
    expect(dialogs()).toHaveLength(1);
  });

  it("an acknowledge that fails brings the popup back (server truth wins)", async () => {
    const server = fakeServer([row("plus_30")]);
    server.failAck = true;
    await mount(server);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await act(async () => {});
    expect(dialogs()).toHaveLength(1);
  });

  it("a session that is no longer valid is reported, not shown", async () => {
    const server = fakeServer([row("plus_30")]);
    server.next = { ok: false, sessionInvalid: true };
    const onSessionInvalid = vi.fn();
    render(
      <OpeningReminderPrompt
        source={server.source}
        isManagement
        onViewTasks={() => {}}
        onSessionInvalid={onSessionInvalid}
      />,
    );
    await act(async () => {});
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
    expect(dialogs()).toHaveLength(0);
  });
});

describe("Opening reminder wake-up", () => {
  it("a focus + visibility + online burst costs one request", async () => {
    const server = fakeServer([]);
    await mount(server);
    expect(server.loads).toBe(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    expect(server.loads).toBe(1);
  });

  it("wakes again on focus once the minimum interval has passed", async () => {
    vi.useFakeTimers();
    const server = fakeServer([]);
    await mount(server);
    expect(server.loads).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
      window.dispatchEvent(new Event("focus"));
    });
    expect(server.loads).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
      window.dispatchEvent(new Event("online"));
    });
    expect(server.loads).toBe(3);
  });

  it("a hidden tab does not wake on its own", async () => {
    vi.useFakeTimers();
    const server = fakeServer([]);
    await mount(server);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAKE_HEARTBEAT_MS * 3);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(server.loads).toBe(1);
    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(server.loads).toBe(2);
    visibility.mockRestore();
  });

  it("the heartbeat brings a newly stored stage onto a device left open", async () => {
    vi.useFakeTimers();
    const server = fakeServer([row("open")]);
    await mount(server);
    expect(screen.getByText("Opening Tasks Are Ready")).toBeInTheDocument();
    // +15 is stored by the database while the dialog is up: one dialog, new text.
    server.reminders = [...server.reminders, row("plus_15")];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAKE_HEARTBEAT_MS);
    });
    expect(dialogs()).toHaveLength(1);
    expect(
      screen.getByText("3 Opening items are still incomplete."),
    ).toBeInTheDocument();
  });

  it("another tab acknowledging converges on the next wake", async () => {
    vi.useFakeTimers();
    const server = fakeServer([row("plus_30")]);
    await mount(server);
    expect(dialogs()).toHaveLength(1);
    server.reminders = server.reminders.map((n) => ({
      ...n,
      readAt: "2026-10-30T14:36:00Z",
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WAKE_HEARTBEAT_MS);
    });
    expect(dialogs()).toHaveLength(0);
  });
});
