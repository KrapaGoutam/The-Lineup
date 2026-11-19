import { describe, expect, it } from "vitest";

import type {
  TipsDay,
  TipsInterval,
  TipsRange,
  TipsShare,
} from "@/features/tips/domain/tips-range-model";

import {
  buildQuickActions,
  summarizeLowStock,
  summarizeOpenSessions,
  summarizePayroll,
  summarizeTipsToday,
  type QuickActionAccess,
  type StockLevelInput,
} from "./dashboard-model";

// ── Attendance ─────────────────────────────────────────────────────────────────────────

describe("summarizeOpenSessions", () => {
  it("counts distinct employees with an open session", () => {
    const card = summarizeOpenSessions(
      [
        { profile_id: "a", status: "active" },
        { profile_id: "a", status: "active" }, // duplicate session: still one person
        { profile_id: "b", status: "on_break" },
        { profile_id: "c", status: "closed" }, // not open
      ],
      "TheLineup Internal",
    );
    expect(card.clockedIn).toBe(2);
    expect(card.onBreak).toBe(1);
  });

  it("a valid empty answer is a real zero", () => {
    expect(summarizeOpenSessions([], "x")).toMatchObject({
      clockedIn: 0,
      onBreak: 0,
    });
  });

  it("an employee who is active on any row is not counted as on a break", () => {
    const card = summarizeOpenSessions(
      [
        { profile_id: "a", status: "on_break" },
        { profile_id: "a", status: "active" },
      ],
      "x",
    );
    expect(card).toMatchObject({ clockedIn: 1, onBreak: 0 });
  });

  it("ignores rows with no employee", () => {
    expect(
      summarizeOpenSessions([{ profile_id: null, status: "active" }], "x")
        .clockedIn,
    ).toBe(0);
  });
});

// ── Payroll ────────────────────────────────────────────────────────────────────────────

describe("summarizePayroll", () => {
  const period = (
    periodMonth: string,
    status: "draft" | "locked",
    balanceCents: number,
    grossCents = 10_000,
  ) => ({ periodMonth, status, grossCents, balanceCents });

  it("counts only draft periods of the current accounting month", () => {
    const card = summarizePayroll(
      [
        period("2026-11-01", "draft", 10_000),
        period("2026-11-01", "draft", 5_000),
        period("2026-11-01", "locked", 0), // locked is not a draft
        period("2026-10-01", "draft", 7_000), // another month
      ],
      "2026-11-01",
    );
    expect(card.draftPeriods).toBe(2);
    expect(card.periodMonth).toBe("2026-11-01");
  });

  it("outstanding balance never lets an overpaid period offset another", () => {
    const card = summarizePayroll(
      [
        period("2026-11-01", "locked", 10_000),
        period("2026-10-01", "locked", -4_000), // overpaid
      ],
      "2026-11-01",
    );
    expect(card.outstandingBalanceCents).toBe(10_000);
  });

  it("the draft count and the outstanding balance are independent measures", () => {
    // A locked period is not a draft but can still be owed; a draft can be settled.
    const card = summarizePayroll(
      [period("2026-11-01", "locked", 2_500), period("2026-11-01", "draft", 0)],
      "2026-11-01",
    );
    expect(card.draftPeriods).toBe(1);
    expect(card.outstandingBalanceCents).toBe(2_500);
  });

  it("no periods is a real zero, not a missing value", () => {
    expect(summarizePayroll([], "2026-11-01")).toMatchObject({
      draftPeriods: 0,
      outstandingBalanceCents: 0,
      periodsCounted: 0,
    });
  });
});

// ── Tips ───────────────────────────────────────────────────────────────────────────────

const share = (
  profileId: string,
  amountCents: number,
  cashCents: number,
  cardCents: number,
): TipsShare => ({
  profileId,
  amountCents,
  cashCents,
  cardCents,
  unclassifiedCents: amountCents - cashCents - cardCents,
});

const interval = (
  over: Partial<TipsInterval> & Pick<TipsInterval, "id">,
): TipsInterval => ({
  startsAt: "2026-11-19T22:00:00Z",
  endsAt: "2026-11-20T02:00:00Z",
  start: "4:00 PM",
  end: "8:00 PM",
  endsNextDay: false,
  amountCents: 0,
  cashCents: 0,
  cardCents: 0,
  tenderRecorded: true,
  revision: 1,
  voided: false,
  voidReason: null,
  participantIds: [],
  participantCount: 0,
  shares: [],
  ...over,
});

const rangeOf = (
  isManager: boolean,
  day: Partial<TipsDay> | null,
): TipsRange => ({
  timeZone: "America/Chicago",
  from: "2026-11-19",
  to: "2026-11-19",
  isManager,
  days: day
    ? [
        {
          poolId: 1,
          serviceDate: "2026-11-19",
          status: "saved",
          updatedAt: "2026-11-19T23:30:00Z",
          intervals: [],
          allocations: [],
          revisions: [],
          ...day,
        },
      ]
    : [],
});

describe("summarizeTipsToday", () => {
  it("manager total sums live intervals, excludes voided ones and keeps legacy as Not split", () => {
    const card = summarizeTipsToday(
      rangeOf(true, {
        intervals: [
          interval({
            id: "1",
            amountCents: 14_001,
            cashCents: 10_001,
            cardCents: 4_000,
          }),
          interval({ id: "2", amountCents: 999, voided: true, cashCents: 999 }),
          interval({ id: "3", amountCents: 3_333, tenderRecorded: false }),
        ],
      }),
      "2026-11-19",
      "viewer",
    );
    expect(card).toEqual({
      view: "manager",
      serviceDate: "2026-11-19",
      totalCents: 17_334,
      cashCents: 10_001,
      cardCents: 4_000,
      notSplitCents: 3_333,
      intervalCount: 2,
      lastUpdatedAt: "2026-11-19T23:30:00Z",
    });
  });

  it("a day with no saved tips is a real zero with no last-updated time", () => {
    expect(
      summarizeTipsToday(rangeOf(true, null), "2026-11-19", "v"),
    ).toMatchObject({
      view: "manager",
      totalCents: 0,
      intervalCount: 0,
      lastUpdatedAt: null,
    });
  });

  it("a day whose only interval is voided counts nothing", () => {
    expect(
      summarizeTipsToday(
        rangeOf(true, {
          intervals: [interval({ id: "1", amountCents: 500, voided: true })],
        }),
        "2026-11-19",
        "v",
      ),
    ).toMatchObject({ totalCents: 0, intervalCount: 0, lastUpdatedAt: null });
  });

  it("staff see only their own allocation, never a branch total", () => {
    const card = summarizeTipsToday(
      rangeOf(false, {
        allocations: [
          share("me", 7_001, 5_000, 2_001),
          share("other", 9_999, 9_999, 0),
        ],
      }),
      "2026-11-19",
      "me",
    );
    expect(card).toEqual({
      view: "staff",
      serviceDate: "2026-11-19",
      totalCents: 7_001,
      cashCents: 5_000,
      cardCents: 2_001,
      notSplitCents: 0,
    });
    expect(JSON.stringify(card)).not.toContain("intervalCount");
  });

  it("legacy staff money stays Not split instead of being assigned to cash or card", () => {
    const card = summarizeTipsToday(
      rangeOf(false, { allocations: [share("me", 1_667, 0, 0)] }),
      "2026-11-19",
      "me",
    );
    expect(card).toMatchObject({
      totalCents: 1_667,
      cashCents: 0,
      cardCents: 0,
      notSplitCents: 1_667,
    });
  });
});

// ── Low stock ──────────────────────────────────────────────────────────────────────────

describe("summarizeLowStock", () => {
  const stock = (
    product_id: string,
    on_hand: number,
    cutoff: number | null,
    over: Partial<StockLevelInput> = {},
  ): StockLevelInput => ({
    product_id,
    on_hand,
    backup: 0,
    cutoff,
    warning: null,
    par: null,
    version: 1,
    updated_at: null,
    ...over,
  });
  const now = new Date("2026-11-19T18:00:00Z");

  it("counts critical plus low using the Bar Inventory rules", () => {
    const card = summarizeLowStock(
      [
        { id: "crit", active: true },
        { id: "low", active: true },
        { id: "ok", active: true },
      ],
      [
        stock("crit", 2, 4), // total <= cutoff
        stock("low", 5, 4), // above cutoff, within the fallback warning (cutoff + 1)
        stock("ok", 20, 4),
      ],
      "America/Chicago",
      now,
    );
    expect(card).toEqual({ needsOrdering: 2, critical: 1, low: 1 });
  });

  it("excludes archived products and products with no cutoff", () => {
    const card = summarizeLowStock(
      [
        { id: "archived", active: false },
        { id: "nocutoff", active: true },
        { id: "crit", active: true },
      ],
      [
        stock("archived", 0, 4),
        stock("nocutoff", 0, null),
        stock("crit", 0, 4),
      ],
      "America/Chicago",
      now,
    );
    expect(card.needsOrdering).toBe(1);
  });

  it("adds on-hand and backup before comparing with the cutoff", () => {
    const card = summarizeLowStock(
      [{ id: "p", active: true }],
      [stock("p", 1, 4, { backup: 20 })],
      "America/Chicago",
      now,
    );
    expect(card.needsOrdering).toBe(0);
  });

  it("an explicit warning level wins over the fallback", () => {
    const card = summarizeLowStock(
      [{ id: "p", active: true }],
      [stock("p", 9, 4, { warning: 10 })],
      "America/Chicago",
      now,
    );
    expect(card).toEqual({ needsOrdering: 1, critical: 0, low: 1 });
  });

  it("a catalog with nothing low is a real zero", () => {
    expect(summarizeLowStock([], [], "America/Chicago", now)).toEqual({
      needsOrdering: 0,
      critical: 0,
      low: 0,
    });
  });
});

// ── Quick actions ──────────────────────────────────────────────────────────────────────

describe("buildQuickActions", () => {
  const everything: QuickActionAccess = {
    isManagement: true,
    canManagePayroll: true,
    canUseInventory: true,
    canUseTips: true,
    modules: {
      attendance: true,
      payroll: true,
      tips: true,
      bar_inventory: true,
      tasks: true,
      table_allocation: true,
    },
  };
  const ids = (access: QuickActionAccess) =>
    buildQuickActions(access).map((action) => action.id);

  it("management gets every operational shortcut plus Reporting", () => {
    expect(ids(everything)).toEqual([
      "attendance",
      "payroll",
      "tips",
      "inventory",
      "tasks",
      "allocation",
      "reporting",
    ]);
  });

  it("staff only get their own shortcuts: no payroll, inventory or reporting", () => {
    const staff = buildQuickActions({
      ...everything,
      isManagement: false,
      canManagePayroll: false,
      canUseInventory: false,
    });
    expect(staff.map((action) => action.label)).toEqual([
      "My Attendance",
      "My Tips",
      "My Tasks",
      "Table Allocation",
    ]);
  });

  it("an off module is never offered", () => {
    const withoutTips = ids({
      ...everything,
      modules: { ...everything.modules, tips: false, payroll: false },
    });
    expect(withoutTips).not.toContain("tips");
    expect(withoutTips).not.toContain("payroll");
  });

  it("an assistant without payroll authority does not get Payroll", () => {
    expect(ids({ ...everything, canManagePayroll: false })).not.toContain(
      "payroll",
    );
  });

  it("Reporting needs Attendance or an authorized Payroll", () => {
    expect(
      ids({
        ...everything,
        canManagePayroll: false,
        modules: { ...everything.modules, attendance: false },
      }),
    ).not.toContain("reporting");
  });

  it("Tips is not offered without the module's own authority", () => {
    expect(ids({ ...everything, canUseTips: false })).not.toContain("tips");
  });

  it("management destinations are real app tabs or the reporting route", () => {
    for (const action of buildQuickActions(everything)) {
      if (action.target.kind === "href") {
        expect(action.target.href).toBe("/reporting");
      } else {
        expect(action.target.tab).toBeTruthy();
      }
    }
  });
});
