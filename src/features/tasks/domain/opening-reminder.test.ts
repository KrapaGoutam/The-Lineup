import { describe, expect, it } from "vitest";

import { mapNotificationRow } from "../data/task-mapper";
import {
  OPENING_REMINDER_OFFSET_MINUTES,
  OPENING_REMINDER_STAGES,
  openingReminderDedupeKey,
  parseOpeningReminder,
} from "./opening-reminder";

const valid = {
  stage: "plus_15",
  service_date: "2026-06-01",
  location_id: "00000000-0000-0000-0000-000000042121",
  stage_at: "2026-06-01T14:15:00Z",
  incomplete_count: 3,
  incomplete_now: 2,
};

describe("opening reminder contract (T-4)", () => {
  it("has exactly the three locked stages, 0 / 15 / 30 minutes after opening", () => {
    expect([...OPENING_REMINDER_STAGES]).toEqual([
      "open",
      "plus_15",
      "plus_30",
    ]);
    expect(OPENING_REMINDER_OFFSET_MINUTES).toEqual({
      open: 0,
      plus_15: 15,
      plus_30: 30,
    });
  });

  it("builds the same dedupe key the database stores", () => {
    expect(
      openingReminderDedupeKey(
        "00000000-0000-0000-0000-000000042121",
        "2026-06-01",
        "open",
      ),
    ).toBe(
      "opening_reminder:00000000-0000-0000-0000-000000042121:2026-06-01:open",
    );
  });

  it("parses a stored payload into camelCase", () => {
    expect(parseOpeningReminder(valid)).toEqual({
      stage: "plus_15",
      serviceDate: "2026-06-01",
      locationId: "00000000-0000-0000-0000-000000042121",
      stageAt: "2026-06-01T14:15:00Z",
      incompleteCount: 3,
      incompleteNow: 2,
    });
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "open"],
    ["an unknown stage", { ...valid, stage: "plus_45" }],
    ["the SQL-style upper-case stage", { ...valid, stage: "OPEN_PLUS_15" }],
    ["a malformed date", { ...valid, service_date: "06/01/2026" }],
    ["a missing location", { ...valid, location_id: "" }],
    ["an unparseable stage instant", { ...valid, stage_at: "soon" }],
    ["a negative count", { ...valid, incomplete_count: -1 }],
    ["a fractional count", { ...valid, incomplete_now: 1.5 }],
    ["a string count", { ...valid, incomplete_count: "3" }],
  ])("rejects %s", (_label, raw) => {
    expect(parseOpeningReminder(raw)).toBeNull();
  });

  it("maps a notification row: only an opening_reminder carries a reminder", () => {
    const base = {
      id: 7,
      title: "Opening tasks are still incomplete",
      body: "3 Opening tasks are not complete",
      task_id: null,
      checklist_instance_id: null,
      created_at: "2026-06-01T14:16:00Z",
      read_at: null,
    };
    const reminder = mapNotificationRow({
      ...base,
      type: "opening_reminder",
      payload: valid,
    });
    expect(reminder.reminder?.stage).toBe("plus_15");
    expect(reminder.taskId).toBeNull();
    expect(
      mapNotificationRow({ ...base, type: "opening_reminder", payload: null })
        .reminder,
    ).toBeNull();
    expect(
      mapNotificationRow({
        ...base,
        type: "checklist_available",
        payload: valid,
      }).reminder,
    ).toBeNull();
  });
});
