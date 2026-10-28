import { describe, expect, it } from "vitest";

import type { OpeningReminder, OpeningReminderStage } from "./opening-reminder";
import {
  countIncompleteOpeningWork,
  openingReminderCopy,
  selectOpeningReminderPopup,
} from "./opening-reminder-popup";
import { makeTask, viewer } from "./task-test-helpers";
import type { NotificationView } from "./task-types";

const TODAY = "2026-10-30";
const LOC = "loc-1";

let seq = 0;
function reminder(
  stage: OpeningReminderStage,
  overrides: Partial<OpeningReminder> = {},
  view: Partial<NotificationView> = {},
): NotificationView {
  seq += 1;
  return {
    id: seq,
    type: "opening_reminder",
    // Titles are deliberately misleading: the stage must come from the payload.
    title: "Opening tasks are overdue",
    body: null,
    taskId: null,
    checklistInstanceId: null,
    createdAt: "2026-10-30T14:34:00Z",
    readAt: null,
    reminder: {
      stage,
      serviceDate: TODAY,
      locationId: LOC,
      stageAt: "2026-10-30T14:00:00Z",
      incompleteCount: 3,
      incompleteNow: 3,
      ...overrides,
    },
    ...view,
  };
}

const select = (reminders: NotificationView[], currentIncomplete = 3) =>
  selectOpeningReminderPopup({
    reminders,
    today: TODAY,
    locationId: LOC,
    currentIncomplete,
  });

describe("Opening reminder popup selection (T-5)", () => {
  it("no reminders -> no popup", () => {
    expect(select([])).toBeNull();
  });

  it("one unread OPEN -> the OPEN popup", () => {
    const open = reminder("open");
    expect(select([open])?.reminder.stage).toBe("open");
    expect(select([open])?.notificationId).toBe(open.id);
  });

  it("OPEN + +15 unread -> +15 only", () => {
    const popup = select([reminder("open"), reminder("plus_15")]);
    expect(popup?.reminder.stage).toBe("plus_15");
  });

  it("CATCH-UP: OPEN + +15 + +30 all stored and unread -> the +30 popup only", () => {
    const rows = [reminder("open"), reminder("plus_15"), reminder("plus_30")];
    const popup = select(rows);
    expect(popup?.reminder.stage).toBe("plus_30");
    expect(popup?.notificationId).toBe(rows[2].id);
    // Selection is presentation: it never touches or drops the stored rows.
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.readAt === null)).toBe(true);
  });

  it("stage priority holds whatever the order of the input", () => {
    const rows = [reminder("plus_30"), reminder("open"), reminder("plus_15")];
    expect(select(rows)?.reminder.stage).toBe("plus_30");
    expect(select([...rows].reverse())?.reminder.stage).toBe("plus_30");
  });

  it("stage comes from the payload, never from the title text", () => {
    const rows = [
      reminder("open", {}, { title: "Opening tasks are overdue" }),
      reminder("plus_30", {}, { title: "Opening tasks are not complete" }),
    ];
    expect(select(rows)?.reminder.stage).toBe("plus_30");
  });

  it("dismissing +30 does not surface the older unread +15 / OPEN", () => {
    const open = reminder("open");
    const p15 = reminder("plus_15");
    const p30 = reminder("plus_30", {}, { readAt: "2026-10-30T14:35:00Z" });
    expect(select([open, p15, p30])).toBeNull();
    // ...and they stay unread history: the selector did not mark anything.
    expect(open.readAt).toBeNull();
    expect(p15.readAt).toBeNull();
  });

  it("a read OPEN does not hide a later, higher stage", () => {
    const open = reminder("open", {}, { readAt: "2026-10-30T14:01:00Z" });
    expect(select([open, reminder("plus_15")])?.reminder.stage).toBe("plus_15");
  });

  it("a read +15 hides OPEN but not +30", () => {
    const p15 = reminder("plus_15", {}, { readAt: "2026-10-30T14:16:00Z" });
    expect(select([p15, reminder("open")])).toBeNull();
    expect(
      select([p15, reminder("open"), reminder("plus_30")])?.reminder.stage,
    ).toBe("plus_30");
  });

  it("everything read -> no popup", () => {
    const readAt = "2026-10-30T14:40:00Z";
    expect(
      select([
        reminder("open", {}, { readAt }),
        reminder("plus_30", {}, { readAt }),
      ]),
    ).toBeNull();
  });

  it("work completed or cancelled since the reminder was stored -> no popup", () => {
    const rows = [reminder("open"), reminder("plus_15"), reminder("plus_30")];
    expect(select(rows, 0)).toBeNull();
    expect(select(rows, 1)?.reminder.stage).toBe("plus_30");
  });

  it("only today's service date at this location can pop", () => {
    expect(
      select([reminder("plus_30", { serviceDate: "2026-10-29" })]),
    ).toBeNull();
    expect(
      select([reminder("plus_30", { locationId: "other-location" })]),
    ).toBeNull();
    expect(
      selectOpeningReminderPopup({
        reminders: [reminder("plus_30")],
        today: TODAY,
        locationId: null,
        currentIncomplete: 3,
      }),
    ).toBeNull();
  });

  it("an older day's acknowledged reminder does not suppress today's", () => {
    const yesterday = reminder(
      "plus_30",
      { serviceDate: "2026-10-29" },
      { readAt: "2026-10-29T15:00:00Z" },
    );
    expect(select([yesterday, reminder("open")])?.reminder.stage).toBe("open");
  });

  it("ignores other notification types and unparseable payloads", () => {
    const other: NotificationView = {
      ...reminder("plus_30"),
      type: "checklist_available",
    };
    const malformed: NotificationView = {
      ...reminder("plus_30"),
      reminder: null,
    };
    expect(select([other, malformed])).toBeNull();
  });
});

describe("Opening reminder copy", () => {
  const stages: OpeningReminderStage[] = ["open", "plus_15", "plus_30"];

  it("management copy is concise and carries the live count", () => {
    const copy = openingReminderCopy("plus_15", {
      isManagement: true,
      currentIncomplete: 3,
    });
    expect(copy.title).toBe("Opening Tasks Need Attention");
    expect(copy.description).toBe("3 Opening items are still incomplete.");
    expect(copy.cta).toBe("View Opening Tasks");
    expect(
      openingReminderCopy("open", { isManagement: true, currentIncomplete: 1 })
        .description,
    ).toBe("1 Opening item to complete.");
  });

  it("staff copy shows no number and names no one", () => {
    for (const stage of stages) {
      const copy = openingReminderCopy(stage, {
        isManagement: false,
        currentIncomplete: 7,
      });
      expect(copy.title).toBe("Opening Task Reminder");
      expect(copy.cta).toBe("View My Opening Tasks");
      expect(`${copy.title} ${copy.description}`).not.toMatch(/\d/);
    }
  });

  it("never claims an elapsed time", () => {
    for (const isManagement of [true, false]) {
      for (const stage of stages) {
        const copy = openingReminderCopy(stage, {
          isManagement,
          currentIncomplete: 3,
        });
        expect(`${copy.title} ${copy.description}`).not.toMatch(
          /minute|late|min\b/i,
        );
      }
    }
  });

  it("urgency rises with the stage", () => {
    const tones = stages.map(
      (stage) =>
        openingReminderCopy(stage, { isManagement: true, currentIncomplete: 2 })
          .tone,
    );
    expect(tones).toEqual(["accent", "warning", "danger"]);
  });
});

describe("countIncompleteOpeningWork (live actionability)", () => {
  const instances = new Set(["inst-today"]);
  const item = (overrides = {}) =>
    makeTask({
      kind: "opening",
      checklistInstanceId: "inst-today",
      assignmentMode: "anyone",
      ...overrides,
    });

  it("management counts every open item; staff only what they may work", () => {
    const tasks = [
      item({ id: "a", assignmentMode: "anyone" }),
      item({
        id: "b",
        assignmentMode: "individual",
        assignees: [{ profileId: "ann", name: "Ann" }],
      }),
      item({
        id: "c",
        assignmentMode: "individual",
        assignees: [{ profileId: "bea", name: "Bea" }],
      }),
    ];
    expect(countIncompleteOpeningWork(tasks, instances, viewer("mona"))).toBe(
      3,
    );
    expect(countIncompleteOpeningWork(tasks, instances, viewer("ann"))).toBe(2);
    expect(countIncompleteOpeningWork(tasks, instances, viewer("cal"))).toBe(1);
  });

  it("completed and cancelled items do not count; blocked and in progress do", () => {
    const tasks = [
      item({ id: "a", status: "completed" }),
      item({ id: "b", status: "cancelled" }),
      item({ id: "c", status: "blocked" }),
      item({ id: "d", status: "in_progress" }),
      item({ id: "e", status: "open" }),
    ];
    expect(countIncompleteOpeningWork(tasks, instances, viewer("mona"))).toBe(
      3,
    );
  });

  it("ignores other days' checklists, closing items and ordinary tasks", () => {
    const tasks = [
      item({ id: "a", checklistInstanceId: "inst-yesterday" }),
      item({ id: "b", kind: "closing" }),
      item({ id: "c", kind: "task", checklistInstanceId: null }),
    ];
    expect(countIncompleteOpeningWork(tasks, instances, viewer("mona"))).toBe(
      0,
    );
  });
});
