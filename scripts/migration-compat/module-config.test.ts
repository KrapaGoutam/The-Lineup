import { describe, expect, it } from "vitest";

import { CONFIGURABLE_MODULE_KEYS } from "../../src/features/modules/domain/module-registry";
import { MODULE_KEYS } from "./common.mjs";
import {
  computeModuleStateHash,
  MODULE_MANIFEST_SCHEMA,
  MODULE_SNAPSHOT_SCHEMA,
  planModuleConfiguration,
} from "./module-config.mjs";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const REAL = id(101);
const HARNESS = id(102);
const ARCHIVED = id(103);

type Cfg = { locationId: string; moduleKey: string; isEnabled: boolean };
function snap(configs: Cfg[] = [], over: Record<string, unknown> = {}) {
  return {
    schema: MODULE_SNAPSHOT_SCHEMA,
    capturedAt: "2026-11-13T00:00:00Z",
    scope: "environment",
    locations: [
      {
        id: REAL,
        organizationId: ORG,
        active: true,
        archivedAt: null,
        name: "The Monk's DEV",
        organizationSlug: "monks",
      },
      {
        id: HARNESS,
        organizationId: id(2),
        active: true,
        archivedAt: null,
        name: "InvRec aa11",
        organizationSlug: "invrec-aa11",
      },
      {
        id: ARCHIVED,
        organizationId: ORG,
        active: false,
        archivedAt: "2026-01-01T00:00:00Z",
      },
    ],
    moduleConfigs: configs,
    ...over,
  };
}
const all = (value: boolean) =>
  Object.fromEntries(MODULE_KEYS.map((k) => [k, value]));
const decision = (
  locationId: string,
  cls: string,
  modules: Record<string, unknown>,
  extra = {},
) => ({
  locationId,
  class: cls,
  modules,
  ...extra,
});
function manifest(
  s: ReturnType<typeof snap>,
  locations: unknown[],
  extra: Record<string, unknown> = {},
) {
  return {
    schema: MODULE_MANIFEST_SCHEMA,
    status: "approved",
    approvedBy: "owner-decision-ref-5",
    stateHash: computeModuleStateHash(s),
    locations,
    ...extra,
  };
}
const codes = (plan: { blockers: { code: string }[] }) =>
  plan.blockers.map((b) => b.code);
const mix = { ...all(false), bar_inventory: true, recipes: true };

describe("B3 module planner: keys and shape", () => {
  it("knows exactly the nine canonical keys and no `settings` (no drift from the registry)", () => {
    expect([...MODULE_KEYS].sort()).toEqual(
      [...CONFIGURABLE_MODULE_KEYS].sort(),
    );
    expect(MODULE_KEYS).not.toContain("settings");
    expect(MODULE_KEYS).toHaveLength(9);
  });
});

describe("B3 module planner: report-only without an owner manifest", () => {
  const plan = planModuleConfiguration(snap());

  it("produces a completeness report and the list of decisions still required, nothing else", () => {
    expect(plan.verdict).toBe("REPORT_ONLY");
    expect(plan.insertRows).toBeNull();
    expect(plan.overrides).toBeNull();
    expect(plan.counts.rowsToInsert).toBe(0);
    expect(plan.decisionsRequired).toHaveLength(2); // the two ACTIVE locations
    expect(plan.decisionsRequired[0].missingModules).toHaveLength(9);
    expect(plan.readiness.completeBefore).toBe(0);
  });

  it("never enables or proposes anything by itself (no silent blanket enablement)", () => {
    for (const loc of plan.locations)
      for (const m of loc.modules) expect(m.proposed).toBeNull();
    expect(plan.touches).toEqual({
      existingRows: false,
      memberships: false,
      locations: false,
      enforcementFlag: false,
    });
    expect(plan.authorization.enforcementActivation).toMatch(/NOT AUTHORIZED/);
  });

  it("hints which locations look like harness fixtures, without deciding", () => {
    const hints = Object.fromEntries(
      plan.locations.map(
        (l: { locationId: string; classification: { hint: string } }) => [
          l.locationId,
          l.classification.hint,
        ],
      ),
    );
    expect(hints[HARNESS]).toBe("harness-like");
    expect(hints[REAL]).toBe("unknown");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(planModuleConfiguration(snap()))).toBe(
      JSON.stringify(planModuleConfiguration(snap())),
    );
  });
});

describe("B3 module planner: an explicit owner manifest", () => {
  it("READY_FOR_OWNER_APPROVAL: lists exactly the rows to insert, with a before/after table", () => {
    const s = snap();
    const plan = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(plan.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(plan.insertRows).toHaveLength(18);
    expect(
      plan.insertRows
        .filter((r: { isEnabled: boolean }) => r.isEnabled)
        .map((r: { moduleKey: string }) => r.moduleKey)
        .sort(),
    ).toEqual(["bar_inventory", "recipes"]);
    const real = plan.locations.find(
      (l: { locationId: string }) => l.locationId === REAL,
    );
    expect(real.configuredBefore).toBe(0);
    expect(real.completeAfter).toBe(true);
    expect(
      real.modules.every((m: { action: string }) => m.action === "insert"),
    ).toBe(true);
    expect(plan.readiness.enforcementReadyAfter).toBe(true);
  });

  it("archived locations get no rows and need no decision", () => {
    const s = snap();
    const plan = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(
      plan.insertRows.some(
        (r: { locationId: string }) => r.locationId === ARCHIVED,
      ),
    ).toBe(false);
    expect(
      plan.locations.find(
        (l: { locationId: string }) => l.locationId === ARCHIVED,
      ).active,
    ).toBe(false);
    const withArchived = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", all(false)),
        decision(ARCHIVED, "retired", all(false)),
      ]),
    );
    expect(codes(withArchived)).toContain("manifest_location_not_active");
  });

  it("PRESERVES explicit existing settings: the Monk's 8-of-9 disabled stay disabled", () => {
    const existing: Cfg[] = MODULE_KEYS.map((k) => ({
      locationId: REAL,
      moduleKey: k,
      isEnabled: k === "bar_inventory",
    }));
    const s = snap(existing);
    // A manifest that would enable another module on an existing explicit row is refused...
    const refused = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", {
          ...all(false),
          bar_inventory: true,
          tasks: true,
        }),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(refused.verdict).toBe("REFUSED");
    expect(refused.blockers).toContainEqual({
      code: "existing_setting_would_change",
      locationId: REAL,
      moduleKey: "tasks",
      existing: false,
      proposed: true,
    });
    expect(refused.insertRows).toBeNull();
    // ...a manifest that agrees with them changes nothing for that location...
    const agreed = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", { ...all(false), bar_inventory: true }),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(agreed.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(
      agreed.insertRows.some(
        (r: { locationId: string }) => r.locationId === REAL,
      ),
    ).toBe(false);
    // ...and only an EXPLICIT override can change one (still a dry-run).
    const overridden = planModuleConfiguration(
      s,
      manifest(s, [
        decision(
          REAL,
          "real",
          { ...all(false), bar_inventory: true, tasks: true },
          { overrideExisting: ["tasks"] },
        ),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(overridden.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(overridden.overrides).toEqual([
      { locationId: REAL, moduleKey: "tasks", from: false, to: true },
    ]);
  });

  it("an owner manifest that matches the existing state is a NOOP", () => {
    const existing: Cfg[] = [REAL, HARNESS].flatMap((loc) =>
      MODULE_KEYS.map((k) => ({
        locationId: loc,
        moduleKey: k,
        isEnabled: false,
      })),
    );
    const s = snap(existing);
    const plan = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", all(false)),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(plan.verdict).toBe("NOOP");
    expect(plan.insertRows).toBeNull();
    expect(plan.readiness.completeBefore).toBe(2);
  });
});

describe("B3 module planner: rejects missing or invalid decisions", () => {
  const run = (build: (s: ReturnType<typeof snap>) => unknown) => {
    const s = snap();
    return planModuleConfiguration(s, build(s) as never);
  };

  it("a missing location decision", () => {
    const plan = run((s) => manifest(s, [decision(REAL, "real", mix)]));
    expect(plan.verdict).toBe("REFUSED");
    expect(plan.blockers).toContainEqual({
      code: "location_decision_missing",
      locationId: HARNESS,
    });
  });

  it("a missing module decision (all nine must be decided)", () => {
    const partial: Record<string, unknown> = { ...mix };
    delete partial.payroll;
    const plan = run((s) =>
      manifest(s, [
        decision(REAL, "real", partial),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(plan.blockers).toContainEqual({
      code: "module_decision_missing",
      locationId: REAL,
      moduleKey: "payroll",
    });
  });

  it("a non-boolean decision", () => {
    const plan = run((s) =>
      manifest(s, [
        decision(REAL, "real", { ...mix, tips: "yes" }),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(codes(plan)).toContain("module_decision_invalid");
  });

  it("`settings` is system-required and an unknown module key is rejected", () => {
    const plan = run((s) =>
      manifest(s, [
        decision(REAL, "real", { ...mix, settings: true, kiosk: true }),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(codes(plan)).toEqual(
      expect.arrayContaining([
        "settings_is_system_required",
        "module_key_unknown",
      ]),
    );
  });

  it("blanket shorthand keys are refused (typos and `all: true` are never ignored)", () => {
    const plan = run((s) =>
      manifest(
        s,
        [decision(REAL, "real", mix), decision(HARNESS, "harness", all(false))],
        { enableAll: true },
      ),
    );
    expect(codes(plan)).toContain("manifest_unknown_key");
    const nested = run((s) =>
      manifest(s, [
        { ...decision(REAL, "real", mix), all: true },
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(codes(nested)).toContain("manifest_unknown_key");
  });

  it("every-module-on-every-location needs an explicit blanket acknowledgement", () => {
    const build = (ack?: boolean) =>
      run((s) =>
        manifest(
          s,
          [
            decision(REAL, "real", all(true)),
            decision(HARNESS, "real", all(true)),
          ],
          ack ? { acknowledgeBlanketEnablement: true } : {},
        ),
      );
    expect(codes(build())).toContain("blanket_enablement_refused");
    expect(codes(build(true))).not.toContain("blanket_enablement_refused");
  });

  it("enabling modules on a harness location needs an acknowledgement", () => {
    const plan = run((s) =>
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", mix),
      ]),
    );
    expect(codes(plan)).toContain("harness_enablement_not_acknowledged");
    const ok = run((s) =>
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", mix, {
          acknowledgeHarnessEnablement: true,
        }),
      ]),
    );
    expect(ok.verdict).toBe("READY_FOR_OWNER_APPROVAL");
  });

  it("a retired class for an active location, and an unknown class, are refused", () => {
    const retired = run((s) =>
      manifest(s, [
        decision(REAL, "retired", all(false)),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(codes(retired)).toContain("class_retired_but_active");
    const unknown = run((s) =>
      manifest(s, [
        decision(REAL, "demo", all(false)),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(codes(unknown)).toContain("location_class_invalid");
  });

  it("a draft manifest, wrong schema, missing approver and state drift are refused", () => {
    expect(codes(run((s) => manifest(s, [], { status: "draft" })))).toContain(
      "manifest_not_approved",
    );
    expect(codes(run((s) => manifest(s, [], { schema: "x" })))).toContain(
      "manifest_schema_mismatch",
    );
    expect(codes(run((s) => manifest(s, [], { approvedBy: " " })))).toContain(
      "manifest_incomplete",
    );
    expect(
      codes(run((s) => manifest(s, [], { stateHash: "f".repeat(64) }))),
    ).toContain("manifest_state_drift");
  });

  it("a duplicated or unknown location in the manifest is refused", () => {
    const dup = run((s) =>
      manifest(s, [
        decision(REAL, "real", mix),
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(codes(dup)).toContain("manifest_duplicate_location");
  });

  it("a declared-real location with a harness-like name is warned about, not silently accepted", () => {
    const s = snap();
    const plan = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "real", all(false)),
      ]),
    );
    expect(plan.warnings).toContainEqual({
      code: "declared_real_but_harness_like",
      locationId: HARNESS,
    });
  });
});

describe("B3 module planner: enforcement-readiness projection", () => {
  it("a selection can never prove environment-wide readiness", () => {
    const s = snap([], { scope: "selected" });
    const plan = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", all(false)),
      ]),
    );
    expect(plan.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(plan.readiness.enforcementReadyAfter).toBe(false);
  });

  it("refused plans claim no readiness and write nothing", () => {
    const s = snap();
    const plan = planModuleConfiguration(
      s,
      manifest(s, [decision(REAL, "real", mix)]),
    );
    expect(plan.readiness.enforcementReadyAfter).toBe(false);
    expect(plan.insertRows).toBeNull();
    expect(plan.counts.rowsToInsert).toBe(0);
  });

  it("a malformed snapshot is refused outright", () => {
    const plan = planModuleConfiguration({ schema: "x" } as never);
    expect(plan.verdict).toBe("REFUSED");
    expect(plan.insertRows).toBeNull();
  });

  it("an unknown module row in the snapshot is refused (the registry is the authority)", () => {
    const plan = planModuleConfiguration(
      snap([{ locationId: REAL, moduleKey: "settings", isEnabled: true }]),
    );
    expect(plan.verdict).toBe("REFUSED");
    expect(plan.reasons).toContain("config_unknown_module");
  });
});

describe("B3 module planner: independent-review fixes (P3-6)", () => {
  it("a decision for a location that is not in the snapshot is refused, never ignored", () => {
    const s = snap();
    const plan = planModuleConfiguration(
      s,
      manifest(s, [
        decision(REAL, "real", mix),
        decision(HARNESS, "harness", all(false)),
        decision(id(999), "real", mix),
      ]),
    );
    expect(plan.verdict).toBe("REFUSED");
    expect(plan.blockers).toContainEqual({
      code: "manifest_location_unknown",
      locationId: id(999),
    });
  });

  it("touches.existingRows is true exactly when an approved plan would override an existing setting", () => {
    const existing: Cfg[] = MODULE_KEYS.map((k) => ({
      locationId: REAL,
      moduleKey: k,
      isEnabled: false,
    }));
    const s = snap(existing);
    const base = [decision(HARNESS, "harness", all(false))];
    const plain = planModuleConfiguration(
      s,
      manifest(s, [decision(REAL, "real", all(false)), ...base]),
    );
    expect(plain.touches.existingRows).toBe(false);
    const overriding = planModuleConfiguration(
      s,
      manifest(s, [
        decision(
          REAL,
          "real",
          { ...all(false), tasks: true },
          { overrideExisting: ["tasks"] },
        ),
        ...base,
      ]),
    );
    expect(overriding.touches.existingRows).toBe(true);
  });
});
