import { describe, expect, it } from "vitest";

import {
  applyChangesetToSnapshot,
  computeStateHash,
  planOrganizationBackfill,
  ROLE_MANIFEST_SCHEMA,
  SNAPSHOT_SCHEMA,
} from "./role-backfill.mjs";

// ---------------------------------------------------------------------------------------------
// Fixtures: ids only, exactly like a real snapshot. All synthetic.
// ---------------------------------------------------------------------------------------------
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const LOC1 = id(101);
const LOC2 = id(102);
const P = {
  owner: id(201),
  gm: id(202),
  shift: id(203),
  host: id(204),
  server: id(205),
  extra: id(206),
};

type Loc = {
  id: string;
  organizationId: string;
  active: boolean;
  archivedAt: string | null;
};
type Mem = { profileId: string; roles: string[]; active: boolean };
type Row = {
  locationId: string;
  profileId: string;
  role: string;
  active: boolean;
};

function snap(
  over: {
    locations?: Loc[];
    memberships?: Mem[];
    rows?: Row[];
    overall?: string[];
  } = {},
) {
  return {
    schema: SNAPSHOT_SCHEMA,
    capturedAt: "2026-11-13T00:00:00Z",
    organizationId: ORG,
    locations: over.locations ?? [
      { id: LOC1, organizationId: ORG, active: true, archivedAt: null },
    ],
    memberships: over.memberships ?? [
      { profileId: P.owner, roles: ["owner"], active: true },
      { profileId: P.gm, roles: ["general_manager"], active: true },
      { profileId: P.shift, roles: ["shift_manager"], active: true },
      { profileId: P.host, roles: ["host"], active: true },
      { profileId: P.server, roles: ["server"], active: true },
    ],
    locationMemberships: over.rows ?? [],
    overallProfileIds: over.overall ?? [],
  };
}

const LADDER_ROWS = (loc = LOC1): Row[] => [
  { locationId: loc, profileId: P.owner, role: "manager", active: true },
  { locationId: loc, profileId: P.gm, role: "manager", active: true },
  {
    locationId: loc,
    profileId: P.shift,
    role: "assistant_manager",
    active: true,
  },
  { locationId: loc, profileId: P.host, role: "staff", active: true },
  { locationId: loc, profileId: P.server, role: "staff", active: true },
];

function manifestFor(
  snapshot: ReturnType<typeof snap>,
  over: Record<string, unknown> = {},
) {
  return {
    schema: ROLE_MANIFEST_SCHEMA,
    organizationId: ORG,
    stateHash: computeStateHash(snapshot),
    status: "approved",
    approvedBy: "owner-decision-ref-1",
    assignments: [],
    ...over,
  };
}

const codes = (plan: { exceptions: { code: string }[] }) =>
  plan.exceptions.map((e) => e.code);

describe("B2 validator: complete single-location organization (D-2 ladder)", () => {
  const plan = planOrganizationBackfill(snap());

  it("APPLY: one complete atomic changeset using only the approved ladder", () => {
    expect(plan.verdict).toBe("APPLY");
    expect(plan.exceptions).toEqual([]);
    expect(plan.changeset.atomicPerOrganization).toBe(true);
    const byProfile = Object.fromEntries(
      plan.changeset.insertRows.map(
        (r: { profileId: string; role: string }) => [r.profileId, r.role],
      ),
    );
    expect(byProfile).toEqual({
      [P.owner]: "manager",
      [P.gm]: "manager",
      [P.shift]: "assistant_manager",
      [P.host]: "staff",
      [P.server]: "staff",
    });
    for (const r of plan.changeset.insertRows) {
      expect(r.locationId).toBe(LOC1);
      expect(r.active).toBe(true);
    }
  });

  it("never touches organization roles, Overall roles, locations, module configs or existing rows", () => {
    expect(plan.changeset.touches).toEqual({
      memberships: false,
      overallRoles: false,
      locations: false,
      moduleConfigs: false,
      existingLocationMemberships: false,
    });
    expect(plan.expectedAfter.membershipsChanged).toBe(0);
    expect(plan.expectedAfter.overallRolesChanged).toBe(0);
  });

  it("demonstrates the ladder preserves effective capability BEFORE producing the assignments", () => {
    expect(plan.capability.verification).toBe("measured_n1");
    expect(plan.capability.reductions).toEqual([]);
    expect(plan.capability.expansions).toEqual([]);
    const strings = Object.fromEntries(
      plan.capability.rows.map(
        (r: { legacyRole: string; before: string; after: string }) => [
          r.legacyRole,
          [r.before, r.after],
        ],
      ),
    );
    expect(strings.general_manager).toEqual(["3:3:3:3:3:3", "3:3:3:3:3:3"]);
    expect(strings.shift_manager).toEqual(["2:2:2:2:2:2", "2:2:2:2:2:2"]);
    expect(strings.host).toEqual(["1:1:1:1:1:1", "1:1:1:1:1:1"]);
    expect(strings.server).toEqual(["1:1:1:1:1:1", "1:1:1:1:1:1"]);
    // The owner's Schedule/Tasks/Tips go 4 -> 3: the same capability BAND (manager).
    expect(strings.owner).toEqual(["4:4:4:4:4:4", "4:4:4:3:3:3"]);
  });

  it("lists every manager / assistant row as an E-1 flag with its shared-catalog consequence", () => {
    expect(plan.e1Flags).toHaveLength(3);
    for (const f of plan.e1Flags) {
      expect(f.sharedCatalogAuthority).toBe(
        "retained_by_single_location_exception",
      );
    }
  });

  it("reports the fallback cliff and a reconciliation checklist", () => {
    expect(plan.fallbackCliff.fallbackActiveToday).toBe(true);
    expect(plan.fallbackCliff.existingRowsAnyStatus).toBe(0);
    expect(plan.reconciliation.join(" ")).toMatch(/completeness query/);
    expect(plan.expectedAfter.activeLocationRows).toBe(5);
    expect(plan.expectedAfter.activeMembersWithoutActiveRow).toBe(0);
  });

  it("is execution-free by construction and ids-only", () => {
    expect(plan.authorization.dryRunOnly).toBe(true);
    expect(plan.authorization.executionAuthorized).toBe(false);
    expect(JSON.stringify(plan)).not.toMatch(/@|password|email/i);
  });
});

describe("B2 validator: idempotency, no-op and determinism", () => {
  it("dry-run is idempotent: planning twice is byte-identical", () => {
    const s = snap();
    expect(JSON.stringify(planOrganizationBackfill(s))).toBe(
      JSON.stringify(planOrganizationBackfill(s)),
    );
  });

  it("plan(apply(plan)) is a NOOP with no changeset (re-running yields zero changes)", () => {
    const s = snap();
    const first = planOrganizationBackfill(s);
    const applied = applyChangesetToSnapshot(s, first.changeset);
    const second = planOrganizationBackfill(applied);
    expect(second.verdict).toBe("NOOP");
    expect(second.changeset).toBeNull();
    expect(second.counts.rowsToInsert).toBe(0);
    expect(second.counts.alreadyPresent).toBe(5);
  });

  it("an already-correct mapping is a NOOP", () => {
    const plan = planOrganizationBackfill(snap({ rows: LADDER_ROWS() }));
    expect(plan.verdict).toBe("NOOP");
    expect(plan.changeset).toBeNull();
  });

  it("input order does not matter (deterministic, sorted output)", () => {
    const a = snap();
    const b = snap({ memberships: [...a.memberships].reverse() });
    const pa = planOrganizationBackfill(a);
    const pb = planOrganizationBackfill(b);
    expect(pa.stateHash).toBe(pb.stateHash);
    expect(JSON.stringify(pa)).toBe(JSON.stringify(pb));
  });

  it("the state hash changes when the organization changes", () => {
    expect(computeStateHash(snap())).not.toBe(
      computeStateHash(snap({ rows: [LADDER_ROWS()[0]] })),
    );
  });
});

describe("B2 validator: the P0 fallback cliff / partial organizations", () => {
  it("a single INACTIVE row at an ARCHIVED location already removes the fallback", () => {
    const s = snap({
      locations: [
        { id: LOC1, organizationId: ORG, active: true, archivedAt: null },
        {
          id: LOC2,
          organizationId: ORG,
          active: false,
          archivedAt: "2026-01-01T00:00:00Z",
        },
      ],
      rows: [
        {
          locationId: LOC2,
          profileId: P.owner,
          role: "manager",
          active: false,
        },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.fallbackCliff.fallbackActiveToday).toBe(false);
    expect(plan.fallbackCliff.existingRowsAnyStatus).toBe(1);
    // ...and the stray row is a conflict: never reactivated, never silently adopted.
    expect(codes(plan)).toContain("row_at_inactive_location");
    expect(plan.verdict).toBe("SKIP");
    expect(plan.changeset).toBeNull();
  });

  it("a partially migrated organization is COMPLETED atomically and warned about loudly", () => {
    const plan = planOrganizationBackfill(snap({ rows: [LADDER_ROWS()[0]] }));
    expect(plan.verdict).toBe("APPLY");
    expect(plan.counts.alreadyPresent).toBe(1);
    expect(plan.counts.rowsToInsert).toBe(4);
    const warning = plan.warnings.find(
      (w: { code: string }) => w.code === "organization_currently_partial",
    );
    expect(warning.affectedProfiles.sort()).toEqual(
      [P.gm, P.host, P.server, P.shift].sort(),
    );
    // Completing it never leaves anyone out.
    expect(plan.expectedAfter.activeMembersWithoutActiveRow).toBe(0);
  });

  it("a partial organization that cannot be COMPLETED is refused as a whole (no partial changeset)", () => {
    const s = snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        {
          profileId: P.server,
          roles: ["server", "shift_manager"],
          active: true,
        },
      ],
      rows: [
        { locationId: LOC1, profileId: P.owner, role: "manager", active: true },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(plan.changeset).toBeNull();
    expect(codes(plan)).toContain("multi_role_requires_explicit_mapping");
  });

  it("every active member is accounted for or the organization is refused (unmapped member)", () => {
    // A member with no target and no signed exclusion can only arise from a manifest-less N>=2.
    const s = snap({
      locations: [
        { id: LOC1, organizationId: ORG, active: true, archivedAt: null },
        { id: LOC2, organizationId: ORG, active: true, archivedAt: null },
      ],
    });
    const m = manifestFor(s, {
      assignments: [{ profileId: P.owner, locationId: LOC1, role: "manager" }],
    });
    const plan = planOrganizationBackfill(s, m);
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain(
      "multi_location_member_requires_explicit_assignment",
    );
    expect(plan.changeset).toBeNull();
  });
});

describe("B2 validator: multiple legacy roles (D-2b)", () => {
  const multi = () =>
    snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        {
          profileId: P.extra,
          roles: ["server", "shift_manager"],
          active: true,
        },
      ],
    });

  it("is never auto-mapped (not the first, not the highest, not combined, not dropped)", () => {
    const plan = planOrganizationBackfill(multi());
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toEqual(["multi_role_requires_explicit_mapping"]);
    expect(plan.changeset).toBeNull();
    expect(
      plan.members.find((m: { profileId: string }) => m.profileId === P.extra)
        .status,
    ).toBe("exception");
  });

  it("still inventories the exception (the tool reports instead of failing)", () => {
    const plan = planOrganizationBackfill(multi());
    expect(plan.counts.activeMembers).toBe(2);
    expect(plan.exceptions[0]).toMatchObject({
      profileId: P.extra,
      roles: ["server", "shift_manager"],
    });
  });

  it("an owner-chosen role at or below the highest legacy role is accepted", () => {
    const s = multi();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [
          { profileId: P.extra, locationId: LOC1, role: "assistant_manager" },
        ],
      }),
    );
    expect(plan.verdict).toBe("APPLY");
    expect(
      plan.changeset.insertRows.find(
        (r: { profileId: string }) => r.profileId === P.extra,
      ).role,
    ).toBe("assistant_manager");
  });

  it("combining roles to reach a broader role is refused (privilege expansion)", () => {
    const s = multi();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [
          { profileId: P.extra, locationId: LOC1, role: "manager" },
        ],
      }),
    );
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain("explicit_exceeds_ladder");
    expect(plan.changeset).toBeNull();
  });

  it("an empty roles array and an unknown role are skipped and reported", () => {
    const s = snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        { profileId: P.gm, roles: [], active: true },
        { profileId: P.server, roles: ["bartender"], active: true },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toEqual(
      expect.arrayContaining(["empty_roles", "unknown_role"]),
    );
  });
});

describe("B2 validator: multiple active locations (D-2c)", () => {
  const two = () =>
    snap({
      locations: [
        { id: LOC1, organizationId: ORG, active: true, archivedAt: null },
        { id: LOC2, organizationId: ORG, active: true, archivedAt: null },
      ],
    });

  it("never infers all-locations or a primary location: no manifest => SKIP, nothing proposed", () => {
    const plan = planOrganizationBackfill(two());
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain("multi_location_requires_complete_manifest");
    expect(
      codes(plan).filter(
        (c) => c === "multi_location_member_requires_explicit_assignment",
      ),
    ).toHaveLength(5);
    expect(plan.changeset).toBeNull();
    expect(plan.capability.verification).toBe("not_measured_n_ge_2");
  });

  const full = (
    s: ReturnType<typeof snap>,
    extra: Record<string, unknown> = {},
  ) =>
    manifestFor(s, {
      acknowledgeUnmeasuredCapability: true,
      assignments: [
        { profileId: P.owner, locationId: LOC1, role: "manager" },
        { profileId: P.owner, locationId: LOC2, role: "manager" },
        { profileId: P.gm, locationId: LOC1, role: "manager" },
        { profileId: P.shift, locationId: LOC2, role: "assistant_manager" },
        { profileId: P.host, locationId: LOC1, role: "staff" },
        { profileId: P.server, locationId: LOC2, role: "staff" },
      ],
      ...extra,
    });

  it("a complete, state-bound, approved manifest yields an APPLY with the explicit rows only", () => {
    const s = two();
    const plan = planOrganizationBackfill(s, full(s));
    expect(plan.verdict).toBe("APPLY");
    expect(plan.changeset.insertRows).toHaveLength(6);
    // Multi-location consequence for E-1: no shared-catalog authority from location rows.
    for (const f of plan.e1Flags)
      expect(f.sharedCatalogAuthority).toBe("none_organization_level_only");
  });

  it("requires the owner to acknowledge that capability is not measured at N >= 2", () => {
    const s = two();
    const plan = planOrganizationBackfill(
      s,
      full(s, { acknowledgeUnmeasuredCapability: false }),
    );
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain(
      "capability_not_measured_requires_acknowledgement",
    );
  });

  it("refuses a manifest whose state hash no longer matches (drift)", () => {
    const s = two();
    const m = full(s, { stateHash: "0".repeat(64) });
    const plan = planOrganizationBackfill(s, m);
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain("manifest_state_drift");
    expect(plan.changeset).toBeNull();
  });

  it("an assignment above a legacy role's ladder is refused even with a manifest", () => {
    const s = two();
    const plan = planOrganizationBackfill(
      s,
      full(s, {
        assignments: [
          { profileId: P.owner, locationId: LOC1, role: "manager" },
          { profileId: P.gm, locationId: LOC1, role: "manager" },
          { profileId: P.shift, locationId: LOC2, role: "manager" }, // shift_manager -> manager
          { profileId: P.host, locationId: LOC1, role: "assistant_manager" }, // host -> assistant
          { profileId: P.server, locationId: LOC2, role: "staff" },
        ],
      }),
    );
    expect(plan.verdict).toBe("SKIP");
    expect(
      codes(plan).filter((c) => c === "explicit_exceeds_ladder"),
    ).toHaveLength(2);
  });

  it("an owner-chosen LOWER role is a reduction and needs an explicit acknowledgement", () => {
    const s = two();
    const reduced = (ack?: boolean) =>
      planOrganizationBackfill(
        s,
        full(s, {
          assignments: [
            { profileId: P.owner, locationId: LOC1, role: "manager" },
            {
              profileId: P.gm,
              locationId: LOC1,
              role: "assistant_manager",
              ...(ack ? { acknowledgeReduction: true } : {}),
            },
            { profileId: P.shift, locationId: LOC2, role: "assistant_manager" },
            { profileId: P.host, locationId: LOC1, role: "staff" },
            { profileId: P.server, locationId: LOC2, role: "staff" },
          ],
        }),
      );
    expect(codes(reduced())).toContain("explicit_reduces_privilege");
    expect(reduced(true).verdict).toBe("APPLY");
  });
});

describe("B2 validator: active / inactive semantics and existing rows", () => {
  it("inactive members get nothing and are counted", () => {
    const s = snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        { profileId: P.server, roles: ["server"], active: false },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("APPLY");
    expect(plan.counts.inactiveMembers).toBe(1);
    expect(
      plan.changeset.insertRows.map((r: { profileId: string }) => r.profileId),
    ).toEqual([P.owner]);
  });

  it("an existing row for an inactive member is a conflict, never adopted or reactivated", () => {
    const s = snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        { profileId: P.server, roles: ["server"], active: false },
      ],
      rows: [
        { locationId: LOC1, profileId: P.server, role: "staff", active: true },
      ],
    });
    expect(codes(planOrganizationBackfill(s))).toContain(
      "row_without_active_membership",
    );
  });

  it("an INACTIVE row of an active member is never reactivated", () => {
    const s = snap({
      rows: [
        { locationId: LOC1, profileId: P.server, role: "staff", active: false },
        ...LADDER_ROWS().filter((r) => r.profileId !== P.server),
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain("inactive_row_never_reactivated");
    expect(plan.changeset).toBeNull();
  });

  it("an existing row with a DIFFERENT role is a conflict, never overwritten", () => {
    const s = snap({
      rows: [
        {
          locationId: LOC1,
          profileId: P.server,
          role: "manager",
          active: true,
        },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(plan.exceptions).toContainEqual({
      code: "differing_role",
      profileId: P.server,
      locationId: LOC1,
      existing: "manager",
      planned: "staff",
    });
  });

  it("the owner can adopt an existing differing row by listing it; it is not an expansion made BY the migration", () => {
    const s = snap({
      rows: [
        {
          locationId: LOC1,
          profileId: P.server,
          role: "manager",
          active: true,
        },
      ],
    });
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [
          { profileId: P.server, locationId: LOC1, role: "manager" },
        ],
      }),
    );
    expect(plan.verdict).toBe("APPLY");
    expect(plan.counts.alreadyPresent).toBe(1);
    expect(
      plan.changeset.insertRows.some(
        (r: { profileId: string }) => r.profileId === P.server,
      ),
    ).toBe(false);
  });

  it("a valid existing row that the plan does not contain is reported, not ignored", () => {
    const s = snap({
      memberships: [{ profileId: P.owner, roles: ["owner"], active: true }],
      rows: [
        { locationId: LOC1, profileId: P.owner, role: "manager", active: true },
        { locationId: LOC1, profileId: P.extra, role: "staff", active: true },
      ],
    });
    expect(codes(planOrganizationBackfill(s))).toContain(
      "row_without_active_membership",
    );
  });

  it("an Overall role holder is flagged but never assigned an Overall role", () => {
    const s = snap({ overall: [P.owner] });
    const plan = planOrganizationBackfill(s);
    expect(
      plan.members.find((m: { profileId: string }) => m.profileId === P.owner)
        .overallRoleHolder,
    ).toBe(true);
    expect(plan.changeset.touches.overallRoles).toBe(false);
  });
});

describe("B2 validator: duplicates, missing targets and tenant boundaries", () => {
  it("duplicate legacy membership records are refused", () => {
    const s = snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        { profileId: P.owner, roles: ["owner"], active: true },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(plan.reasons).toContain("duplicate_membership");
    expect(plan.changeset).toBeNull();
  });

  it("duplicate location rows are refused", () => {
    const s = snap({
      rows: [
        { locationId: LOC1, profileId: P.owner, role: "manager", active: true },
        { locationId: LOC1, profileId: P.owner, role: "manager", active: true },
      ],
    });
    expect(planOrganizationBackfill(s).reasons).toContain(
      "duplicate_location_row",
    );
  });

  it("no active location: nothing can be mapped, the whole organization is skipped", () => {
    const s = snap({
      locations: [
        {
          id: LOC1,
          organizationId: ORG,
          active: false,
          archivedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain("no_active_location");
    expect(plan.changeset).toBeNull();
  });

  it("a manifest naming a location that is not in the organization is refused (missing target)", () => {
    const s = snap();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [
          { profileId: P.server, locationId: id(999), role: "staff" },
        ],
      }),
    );
    expect(codes(plan)).toContain("manifest_location_not_in_organization");
    expect(plan.verdict).toBe("SKIP");
  });

  it("a location of ANOTHER organization inside the snapshot is a cross-tenant mismatch", () => {
    const s = snap({
      locations: [
        { id: LOC1, organizationId: ORG, active: true, archivedAt: null },
        { id: LOC2, organizationId: id(2), active: true, archivedAt: null },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.verdict).toBe("SKIP");
    expect(plan.reasons).toContain("cross_tenant_location");
  });

  it("a row pointing at a location outside the organization is refused", () => {
    const s = snap({
      rows: [
        {
          locationId: id(555),
          profileId: P.owner,
          role: "manager",
          active: true,
        },
      ],
    });
    expect(planOrganizationBackfill(s).reasons).toContain(
      "row_location_not_in_organization",
    );
  });

  it("a manifest bound to another organization is refused", () => {
    const s = snap();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, { organizationId: id(2) }),
    );
    expect(codes(plan)).toContain("manifest_organization_mismatch");
    expect(plan.verdict).toBe("SKIP");
  });

  it("a malformed snapshot is refused outright, with no changeset", () => {
    const plan = planOrganizationBackfill({ schema: "wrong" } as never);
    expect(plan.verdict).toBe("SKIP");
    expect(plan.changeset).toBeNull();
    expect(plan.reasons).toContain("snapshot_schema_mismatch");
  });
});

describe("B2 validator: aborted / incomplete manifests", () => {
  const cases: [
    string,
    (s: ReturnType<typeof snap>) => Record<string, unknown>,
    string,
  ][] = [
    [
      "a draft (not approved) manifest",
      (s) => manifestFor(s, { status: "draft" }),
      "manifest_not_approved",
    ],
    [
      "a manifest with no approver",
      (s) => manifestFor(s, { approvedBy: "" }),
      "manifest_incomplete",
    ],
    [
      "a manifest with no assignments list",
      (s) => manifestFor(s, { assignments: undefined }),
      "manifest_incomplete",
    ],
    [
      "a blanket shorthand key",
      (s) => manifestFor(s, { assignAllLocations: true }),
      "manifest_unknown_key",
    ],
    [
      "a wrong schema version",
      (s) => manifestFor(s, { schema: "v0" }),
      "manifest_schema_mismatch",
    ],
  ];
  for (const [label, build, code] of cases) {
    it(`${label} => SKIP (${code}) and no changeset`, () => {
      const s = snap();
      const plan = planOrganizationBackfill(s, build(s));
      expect(plan.verdict).toBe("SKIP");
      expect(codes(plan)).toContain(code);
      expect(plan.changeset).toBeNull();
    });
  }

  it("an assignment naming an inactive or foreign profile is refused", () => {
    const s = snap({
      memberships: [{ profileId: P.owner, roles: ["owner"], active: true }],
    });
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [{ profileId: id(777), locationId: LOC1, role: "staff" }],
      }),
    );
    expect(codes(plan)).toContain("manifest_profile_not_active_member");
  });

  it("an owner-signed exclusion removes the member from the plan and prints the access loss", () => {
    const s = snap();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        intentionallyUnassigned: [
          { profileId: P.server, reason: "left the company" },
        ],
      }),
    );
    expect(plan.verdict).toBe("APPLY");
    expect(plan.accessLossIfApplied).toEqual([P.server]);
    expect(
      plan.changeset.insertRows.some(
        (r: { profileId: string }) => r.profileId === P.server,
      ),
    ).toBe(false);
  });
});

describe("B2 validator: privilege ladder is exact", () => {
  it("host and server can never become assistant managers, and nobody is reduced", () => {
    const plan = planOrganizationBackfill(snap());
    for (const r of plan.changeset.insertRows) {
      if (r.profileId === P.host || r.profileId === P.server)
        expect(r.role).toBe("staff");
    }
    expect(plan.capability.reductions).toEqual([]);
  });
});

describe("B2 validator: independent-review fixes (P2-2, P2-3, P3)", () => {
  const multiOwner = () =>
    snap({
      memberships: [
        { profileId: P.owner, roles: ["owner", "server"], active: true },
      ],
    });

  it("P2-2: a multi-role member cannot be silently downgraded below their highest role", () => {
    const s = multiOwner();
    const down = (ack?: boolean) =>
      planOrganizationBackfill(
        s,
        manifestFor(s, {
          assignments: [
            {
              profileId: P.owner,
              locationId: LOC1,
              role: "staff",
              ...(ack ? { acknowledgeReduction: true } : {}),
            },
          ],
        }),
      );
    const refused = down();
    expect(refused.verdict).toBe("SKIP");
    expect(codes(refused)).toContain("explicit_reduces_privilege");
    expect(refused.changeset).toBeNull();
    expect(down(true).verdict).toBe("APPLY");
  });

  it("an acknowledged reduction for a single-role member is applied and stays loudly visible", () => {
    const s = snap();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [
          {
            profileId: P.gm,
            locationId: LOC1,
            role: "staff",
            acknowledgeReduction: true,
          },
          { profileId: P.owner, locationId: LOC1, role: "manager" },
          { profileId: P.shift, locationId: LOC1, role: "assistant_manager" },
          { profileId: P.host, locationId: LOC1, role: "staff" },
          { profileId: P.server, locationId: LOC1, role: "staff" },
        ],
      }),
    );
    expect(plan.verdict).toBe("APPLY");
    expect(plan.capability.reductions.length).toBeGreaterThan(0);
    expect(
      plan.warnings.some(
        (w: { code: string; profileId?: string }) =>
          w.code === "acknowledged_capability_reduction" &&
          w.profileId === P.gm,
      ),
    ).toBe(true);
  });

  it("P2-3: a profile both assigned and listed as intentionally unassigned is a contradiction, not a silent win", () => {
    const s = snap();
    const plan = planOrganizationBackfill(
      s,
      manifestFor(s, {
        assignments: [
          { profileId: P.owner, locationId: LOC1, role: "manager" },
        ],
        intentionallyUnassigned: [{ profileId: P.owner, reason: "x" }],
      }),
    );
    expect(plan.verdict).toBe("SKIP");
    expect(codes(plan)).toContain("manifest_conflicting_entries");
    expect(plan.changeset).toBeNull();
  });

  it("P3: unassigned entries and acknowledgement lists are validated", () => {
    const s = snap();
    const run = (extra: Record<string, unknown>) =>
      planOrganizationBackfill(s, manifestFor(s, extra));
    expect(
      codes(
        run({
          intentionallyUnassigned: [
            { profileId: P.server, all: true, role: "manager" },
          ],
        }),
      ),
    ).toContain("manifest_unknown_key");
    expect(
      codes(run({ intentionallyUnassigned: [{ profileId: "nope" }] })),
    ).toContain("manifest_unassigned_entry_invalid");
    expect(codes(run({ acknowledgeExpansions: true }))).toContain(
      "manifest_incomplete",
    );
    expect(codes(run({ acknowledgeExpansions: "*" }))).toContain(
      "manifest_incomplete",
    );
  });

  it("P3: inactive members are called out so a later reactivation is not a surprise lock-out", () => {
    const s = snap({
      memberships: [
        { profileId: P.owner, roles: ["owner"], active: true },
        { profileId: P.server, roles: ["server"], active: false },
      ],
    });
    const plan = planOrganizationBackfill(s);
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({
        code: "inactive_members_not_mapped",
        profiles: [P.server],
      }),
    );
  });
});
