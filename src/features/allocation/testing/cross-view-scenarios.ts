/**
 * Table Allocation cross-view integrity (X4) -- the machine-readable scenario
 * matrix. ONE list of scenarios drives three layers:
 *
 *   1. domain      (cross-view-matrix.test.ts)  every scenario through the pure
 *                  reducer + shared claim classifier + read model, asserting all
 *                  five views from the same canonical expectation.
 *   2. component   the new views/dialogs reuse the same expectation helpers.
 *   3. Playwright  (tests/e2e/table-allocation-cross-view.spec.ts) drives the
 *                  same steps through the real UI of each origin, on desktop,
 *                  tablet and mobile, and asserts all five views after the
 *                  action (and after every checkpoint).
 *
 * Test-only module: nothing in the app imports it.
 *
 * Roles (A, B, C) are mapped to concrete servers by each layer. A step names
 * the ORIGIN it is performed from; only actions a view really supports appear
 * (Grid: type/skip/unassign; Floor: tile -> server, occupied tile ->
 * transfer/end/unassign/assign-elsewhere; Picker: cell -> tile, skip;
 * Servers: "+ Table", chip -> transfer/end/unassign). Dashboard is read-only.
 */
export type Role = "A" | "B" | "C";
export type Origin = "grid" | "floor" | "picker" | "servers";

export type Step = (
  | { do: "assign"; via: Origin; who: Role; table: string }
  | {
      do: "conflict";
      via: Origin;
      who: Role;
      table: string;
      choose: "transfer" | "end-assign" | "cancel";
    }
  | { do: "same-server"; via: Origin; who: Role; table: string }
  | { do: "end"; via: "floor" | "servers"; table: string }
  | { do: "transfer"; via: "floor" | "servers"; table: string; to: Role }
  | { do: "unassign"; via: "grid" | "floor" | "servers"; table: string }
  | { do: "skip"; via: "grid" | "picker"; who: Role }
  | { do: "undo" }
  | { do: "redo" }
) & {
  /** Assert all five views right after this step (not only at the end). */
  then?: Expectation;
};

export type Expectation = {
  /** Owner of each watched physical table; null = available. */
  owners: Record<string, Role | null>;
  /** Physical tables each server actively holds. Omitted role = none. */
  active: Partial<Record<Role, string[]>>;
  /** Whole-assignment labels each server has ENDED (session history). */
  ended: Partial<Record<Role, string[]>>;
  /** Change of the Dashboard "Active tables" count versus before the steps. */
  activeDelta: number;
  /** Whose turn is next (domain layer only; the demo board has seed data). */
  next?: Role | null;
};

export type Scenario = {
  id: string;
  title: string;
  steps: Step[];
  expect: Expectation;
};

const ORIGINS: Origin[] = ["grid", "floor", "picker", "servers"];

const held = (who: Role, table: string): Step => ({
  do: "assign",
  via: "floor",
  who,
  table,
});

function perOrigin(
  prefix: string,
  make: (origin: Origin) => Omit<Scenario, "id"> & { title: string },
): Scenario[] {
  return ORIGINS.map((origin) => {
    const scenario = make(origin);
    return {
      ...scenario,
      id: `${prefix}-${origin}`,
      title: `${scenario.title} (from ${origin})`,
    };
  });
}

export const SCENARIOS: Scenario[] = [
  // ---- plain assignment from every origin ----------------------------------
  ...perOrigin("XM-001-assign", (origin) => ({
    title: "mapped available table is assigned",
    steps: [{ do: "assign", via: origin, who: "A", table: "T3" }],
    expect: {
      owners: { T3: "A" },
      active: { A: ["T3"] },
      ended: {},
      activeDelta: 1,
      next: "B",
    },
  })),

  // ---- same-server duplicate ---------------------------------------------------
  ...perOrigin("XM-020-same-server", (origin) => ({
    title: "the same server asking for its own table is a no-op",
    steps: [
      held("A", "T6"),
      { do: "same-server", via: origin, who: "A", table: "T6" },
    ],
    expect: {
      owners: { T6: "A" },
      active: { A: ["T6"] },
      ended: {},
      activeDelta: 1,
      next: "B",
    },
  })),

  // ---- occupied by another server ------------------------------------------------
  ...perOrigin("XM-021-transfer", (origin) => ({
    title: "occupied table -> Transfer",
    steps: [
      held("A", "T6"),
      {
        do: "conflict",
        via: origin,
        who: "B",
        table: "T6",
        choose: "transfer",
      },
    ],
    expect: {
      owners: { T6: "B" },
      active: { B: ["T6"] },
      ended: { A: ["T6"] },
      activeDelta: 1,
      next: "C",
    },
  })),
  ...perOrigin("XM-022-end-assign", (origin) => ({
    title: "occupied table -> End + Assign",
    steps: [
      held("A", "T6"),
      {
        do: "conflict",
        via: origin,
        who: "B",
        table: "T6",
        choose: "end-assign",
      },
    ],
    expect: {
      owners: { T6: "B" },
      active: { B: ["T6"] },
      ended: { A: ["T6"] },
      activeDelta: 1,
      next: "C",
    },
  })),
  ...perOrigin("XM-023-cancel", (origin) => ({
    title: "occupied table -> Cancel changes nothing",
    steps: [
      held("A", "T6"),
      { do: "conflict", via: origin, who: "B", table: "T6", choose: "cancel" },
    ],
    expect: {
      owners: { T6: "A" },
      active: { A: ["T6"] },
      ended: {},
      activeDelta: 1,
      next: "B",
    },
  })),

  // ---- combined assignment (T4 + T5 belongs to A as ONE assignment) -----------------
  ...perOrigin("XM-040-combined-transfer", (origin) => ({
    title: "combined holder -> Transfer moves the whole T4 + T5 assignment",
    steps: [
      { do: "assign", via: "grid", who: "A", table: "T4 + T5" },
      {
        do: "conflict",
        via: origin,
        who: "B",
        table: "T4",
        choose: "transfer",
      },
    ],
    expect: {
      owners: { T4: "B", T5: "B" },
      active: { B: ["T4", "T5"] },
      ended: { A: ["T4 + T5"] },
      activeDelta: 2,
      next: "C",
    },
  })),
  ...perOrigin("XM-041-combined-end-assign", (origin) => ({
    title:
      "combined holder -> End + Assign ends the WHOLE assignment, then assigns only T4",
    steps: [
      { do: "assign", via: "grid", who: "A", table: "T4 + T5" },
      {
        do: "conflict",
        via: origin,
        who: "B",
        table: "T4",
        choose: "end-assign",
      },
    ],
    expect: {
      owners: { T4: "B", T5: null },
      active: { B: ["T4"] },
      ended: { A: ["T4 + T5"] },
      activeDelta: 1,
      next: "C",
    },
  })),
  ...perOrigin("XM-042-combined-cancel", (origin) => ({
    title: "combined holder -> Cancel leaves the assignment intact",
    steps: [
      { do: "assign", via: "grid", who: "A", table: "T4 + T5" },
      { do: "conflict", via: origin, who: "B", table: "T4", choose: "cancel" },
    ],
    expect: {
      owners: { T4: "A", T5: "A" },
      active: { A: ["T4", "T5"] },
      ended: {},
      activeDelta: 2,
      next: "B",
    },
  })),

  // ---- ended history, then reassignment -----------------------------------------------
  ...(["floor", "servers"] as const).map(
    (via): Scenario => ({
      id: `XM-030-ended-reassign-${via}`,
      title: `A ends T2 (from ${via}): history stays, count drops; B then assigns T2`,
      steps: [
        held("A", "T2"),
        {
          do: "end",
          via,
          table: "T2",
          then: {
            owners: { T2: null },
            active: {},
            ended: { A: ["T2"] },
            activeDelta: 0,
            next: "B",
          },
        },
        { do: "assign", via: "grid", who: "B", table: "T2" },
      ],
      expect: {
        owners: { T2: "B" },
        active: { B: ["T2"] },
        ended: { A: ["T2"] },
        activeDelta: 1,
        next: "C",
      },
    }),
  ),

  // ---- transfer chain -----------------------------------------------------------------------
  ...(["floor", "servers"] as const).map(
    (via): Scenario => ({
      id: `XM-031-transfer-chain-${via}`,
      title: `A owns T3 -> transfer to B -> transfer to C -> end (from ${via})`,
      steps: [
        held("A", "T3"),
        {
          do: "transfer",
          via,
          table: "T3",
          to: "B",
          then: {
            owners: { T3: "B" },
            active: { B: ["T3"] },
            ended: { A: ["T3"] },
            activeDelta: 1,
          },
        },
        {
          do: "transfer",
          via,
          table: "T3",
          to: "C",
          then: {
            owners: { T3: "C" },
            active: { C: ["T3"] },
            ended: { A: ["T3"], B: ["T3"] },
            activeDelta: 1,
          },
        },
        { do: "end", via, table: "T3" },
      ],
      expect: {
        owners: { T3: null },
        active: {},
        ended: { A: ["T3"], B: ["T3"], C: ["T3"] },
        activeDelta: 0,
      },
    }),
  ),

  // ---- unassign (correction: removes the entry, no history) ---------------------------------
  ...(["grid", "floor", "servers"] as const).map(
    (via): Scenario => ({
      id: `XM-060-unassign-${via}`,
      title: `Unassign removes the entry entirely (from ${via})`,
      steps: [held("A", "T3"), { do: "unassign", via, table: "T3" }],
      expect: {
        owners: { T3: null },
        active: {},
        ended: {},
        activeDelta: 0,
      },
    }),
  ),

  // ---- skip -----------------------------------------------------------------------------------------
  ...(["grid", "picker"] as const).map(
    (via): Scenario => ({
      id: `XM-050-skip-${via}`,
      title: `Skip records a turn without occupying a table (from ${via})`,
      steps: [{ do: "skip", via, who: "A" }],
      expect: {
        owners: {},
        active: {},
        ended: {},
        activeDelta: 0,
        next: "B",
      },
    }),
  ),

  // ---- undo / redo of End + Assign -------------------------------------------------------------------
  {
    id: "XM-024-end-assign-undo-redo",
    title: "End + Assign, Undo restores the displaced owner, Redo re-applies",
    steps: [
      held("A", "T6"),
      {
        do: "conflict",
        via: "floor",
        who: "B",
        table: "T6",
        choose: "end-assign",
      },
      {
        do: "undo",
        then: {
          owners: { T6: "A" },
          active: { A: ["T6"] },
          ended: {},
          activeDelta: 1,
        },
      },
      { do: "redo" },
    ],
    expect: {
      owners: { T6: "B" },
      active: { B: ["T6"] },
      ended: { A: ["T6"] },
      activeDelta: 1,
    },
  },

  // ---- off-map: "1" is NOT "T1" -------------------------------------------------------------------------
  {
    id: "XM-011-offmap-distinct-from-T1",
    title: 'free-text "1" and mapped T1 are different tables',
    steps: [
      { do: "assign", via: "grid", who: "A", table: "1" },
      {
        do: "assign",
        via: "grid",
        who: "B",
        table: "T1",
        then: {
          owners: { "1": "A", T1: "B" },
          active: { A: ["1"], B: ["T1"] },
          ended: {},
          activeDelta: 2,
        },
      },
    ],
    expect: {
      owners: { "1": "A", T1: "B" },
      active: { A: ["1"], B: ["T1"] },
      ended: {},
      activeDelta: 2,
    },
  },
  {
    id: "XM-012-offmap-held-never-marks-T1",
    title: 'an off-map "1" held by A leaves mapped T1 available',
    steps: [{ do: "assign", via: "grid", who: "A", table: "1" }],
    expect: {
      owners: { "1": "A", T1: null },
      active: { A: ["1"] },
      ended: {},
      activeDelta: 1,
    },
  },
  {
    id: "XM-013-offmap-conflict-end-assign",
    title: "an off-map table is guarded like any other: End + Assign",
    steps: [
      { do: "assign", via: "grid", who: "A", table: "1" },
      {
        do: "conflict",
        via: "grid",
        who: "B",
        table: "1",
        choose: "end-assign",
      },
    ],
    expect: {
      owners: { "1": "B", T1: null },
      active: { B: ["1"] },
      ended: { A: ["1"] },
      activeDelta: 1,
    },
  },
];

export type ViewSnapshots = {
  grid: {
    active: Record<string, Role | null>;
    ended: Record<string, string[]>;
  };
  floor: Record<string, Role | null>;
  picker: Record<string, Role | null>;
  servers: Record<Role, { active: string[]; ended: string[] }>;
  dashboard: { activeTables: number; next: Role | null };
};

function labelParts(label: string): string[] {
  return label
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Every physical table (or free-text label) a scenario talks about. */
export function watchedTables(scenario: Scenario): string[] {
  const labels = new Set<string>();
  const add = (e: Expectation) => {
    for (const t of Object.keys(e.owners)) labels.add(t);
    for (const list of Object.values(e.active))
      list?.forEach((t) => labels.add(t));
  };
  add(scenario.expect);
  for (const step of scenario.steps) if (step.then) add(step.then);
  for (const step of scenario.steps) {
    if ("table" in step) labelParts(step.table).forEach((t) => labels.add(t));
  }
  return [...labels];
}

const sameSet = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/**
 * Compare all five views with ONE expectation. Returns human-readable
 * mismatches (empty = every view agrees with the canonical expectation).
 */
export function checkViews(
  views: ViewSnapshots,
  expectation: Expectation,
  baselineActive = 0,
): string[] {
  const errors: string[] = [];
  const roles = ["A", "B", "C"] as const;

  for (const [table, role] of Object.entries(expectation.owners)) {
    if (views.grid.active[table] !== role)
      errors.push(
        `grid: ${table} owner ${views.grid.active[table]} != ${role}`,
      );
    if (views.floor[table] !== role)
      errors.push(`floor: ${table} owner ${views.floor[table]} != ${role}`);
    if (views.picker[table] !== role)
      errors.push(`picker: ${table} owner ${views.picker[table]} != ${role}`);
  }
  for (const role of roles) {
    const wantActive = expectation.active[role] ?? [];
    if (!sameSet(views.servers[role].active, wantActive))
      errors.push(
        `servers: ${role} active [${views.servers[role].active}] != [${wantActive}]`,
      );
    const wantEnded = expectation.ended[role] ?? [];
    if (!sameSet(views.servers[role].ended, wantEnded))
      errors.push(
        `servers: ${role} ended [${views.servers[role].ended}] != [${wantEnded}]`,
      );
    if (!sameSet(views.grid.ended[role] ?? [], wantEnded))
      errors.push(
        `grid: ${role} ended [${views.grid.ended[role] ?? []}] != [${wantEnded}]`,
      );
  }
  const wantTotal = baselineActive + expectation.activeDelta;
  if (views.dashboard.activeTables !== wantTotal)
    errors.push(
      `dashboard: active tables ${views.dashboard.activeTables} != ${wantTotal}`,
    );
  if (
    expectation.next !== undefined &&
    views.dashboard.next !== expectation.next
  )
    errors.push(
      `dashboard: next ${views.dashboard.next} != ${expectation.next}`,
    );
  return errors;
}
