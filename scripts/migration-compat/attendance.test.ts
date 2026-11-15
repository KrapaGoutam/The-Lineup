import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_MANIFEST_SCHEMA,
  ATTENDANCE_SNAPSHOT_SCHEMA,
  computeAttendanceStateHash,
  planAttendanceCompatibility,
  validateIdentityLinks,
} from "./attendance.mjs";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_MONKS = id(1);
const ORG_B = id(2);
const L_EXT = id(101); // Monk's-like: NULL mode, Neon links, no native history
const L_INT = id(102); // internal Attendance in use
const L_OFF = id(103); // explicitly disabled
const L_NEW = id(104); // NULL, no links, no history
const L_ARCH = id(105);
const P1 = id(201);
const P2 = id(202);
const P3 = id(203);

type Loc = {
  id: string;
  organizationId: string;
  active: boolean;
  archivedAt: string | null;
  attendanceMode: string | null;
  nativeSessionCount?: number;
  openNativeSessionCount?: number;
};

function snap(over: Partial<Record<string, unknown>> = {}) {
  const locations: Loc[] = [
    {
      id: L_EXT,
      organizationId: ORG_MONKS,
      active: true,
      archivedAt: null,
      attendanceMode: null,
      nativeSessionCount: 0,
      openNativeSessionCount: 0,
    },
    {
      id: L_INT,
      organizationId: ORG_B,
      active: true,
      archivedAt: null,
      attendanceMode: "internal_the_lineup",
      nativeSessionCount: 12,
      openNativeSessionCount: 1,
    },
    {
      id: L_OFF,
      organizationId: ORG_B,
      active: true,
      archivedAt: null,
      attendanceMode: "disabled",
      nativeSessionCount: 0,
      openNativeSessionCount: 0,
    },
    {
      id: L_NEW,
      organizationId: id(3),
      active: true,
      archivedAt: null,
      attendanceMode: null,
      nativeSessionCount: 0,
      openNativeSessionCount: 0,
    },
    {
      id: L_ARCH,
      organizationId: ORG_B,
      active: false,
      archivedAt: "2026-01-01T00:00:00Z",
      attendanceMode: null,
    },
  ];
  return {
    schema: ATTENDANCE_SNAPSHOT_SCHEMA,
    capturedAt: "2026-11-13T00:00:00Z",
    locations,
    memberships: [
      { organizationId: ORG_MONKS, profileId: P1, active: true },
      { organizationId: ORG_MONKS, profileId: P2, active: true },
      { organizationId: ORG_MONKS, profileId: P3, active: false },
    ],
    identityLinks: [
      { organizationId: ORG_MONKS, profileId: P1, neonUserId: 11 },
      { organizationId: ORG_MONKS, profileId: P2, neonUserId: 12 },
    ],
    neonUserIds: null,
    financialActivationEnabled: false,
    ...over,
  };
}
const manifest = (
  s: ReturnType<typeof snap>,
  locations: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  schema: ATTENDANCE_MANIFEST_SCHEMA,
  status: "approved",
  approvedBy: "owner-decision-ref-6",
  stateHash: computeAttendanceStateHash(s),
  locations,
  ...extra,
});
const codes = (plan: { blockers: { code: string }[] }) =>
  plan.blockers.map((b) => b.code);
type LocationReport = {
  locationId: string;
  currentMode: string | null;
  state: string;
};
const byLoc = (plan: { locations: LocationReport[] }, loc: string) =>
  plan.locations.find((l) => l.locationId === loc)!;

describe("B4 attendance planner: inspect and report (no manifest)", () => {
  const plan = planAttendanceCompatibility(snap());

  it("inspects each active location's mode and never invents one for a NULL (unconfigured) location", () => {
    expect(plan.verdict).toBe("REPORT_ONLY");
    expect(byLoc(plan, L_EXT).currentMode).toBeNull();
    expect(byLoc(plan, L_NEW).currentMode).toBeNull();
    expect(plan.counts).toMatchObject({
      activeLocations: 4,
      unconfigured: 2,
      configuredPreserved: 2,
      modeUpdates: 0,
    });
    expect(plan.modeUpdates).toBeNull();
    expect(plan.ownerDecisionRequiredFor.sort()).toEqual([L_EXT, L_NEW].sort());
  });

  it("identifies the legacy Monk's pattern as EVIDENCE for external, as a suggestion only", () => {
    const monks = byLoc(plan, L_EXT) as unknown as {
      evidence: { externalCompatible: boolean };
      suggestion: { mode: string; suggestionOnly: boolean };
    };
    expect(monks.evidence.externalCompatible).toBe(true);
    expect(monks.suggestion).toMatchObject({
      mode: "external",
      suggestionOnly: true,
    });
    // No links and no history => no suggestion at all (ambiguous organizations are not guessed).
    expect(
      (byLoc(plan, L_NEW) as unknown as { suggestion: unknown }).suggestion,
    ).toBeNull();
  });

  it("preserves existing internal Attendance and explicitly disabled locations", () => {
    expect(byLoc(plan, L_INT).state).toBe("configured_preserved");
    expect(byLoc(plan, L_OFF).state).toBe("configured_preserved");
    expect(
      (byLoc(plan, L_INT) as unknown as { suggestion: unknown }).suggestion,
    ).toBeNull();
  });

  it("keeps financial consumption OFF and touches nothing", () => {
    expect(plan.financialConsumption).toBe("OFF");
    expect(plan.touches).toEqual({
      timesheets: false,
      attendanceHistory: false,
      neon: false,
      financialSwitch: false,
      payroll: false,
    });
    expect(plan.authorization.neon).toMatch(/never contacted/);
  });
});

describe("B4 attendance planner: an owner-approved manifest", () => {
  it("REFUSES to produce updates while any unconfigured location lacks an owner-approved mode", () => {
    const s = snap();
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [{ locationId: L_EXT, mode: "external" }]),
    );
    expect(plan.verdict).toBe("REFUSED");
    expect(plan.blockers).toContainEqual({
      code: "owner_approved_mode_absent",
      locationId: L_NEW,
    });
    expect(plan.modeUpdates).toBeNull();
  });

  it("READY_FOR_OWNER_APPROVAL when every unconfigured location has an explicit mode; configured ones are untouched", () => {
    const s = snap();
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "external" },
        { locationId: L_NEW, mode: "internal_the_lineup" },
      ]),
    );
    expect(plan.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(plan.modeUpdates).toEqual([
      { locationId: L_EXT, from: null, to: "external" },
      { locationId: L_NEW, from: null, to: "internal_the_lineup" },
    ]);
    expect(
      plan.modeUpdates.some(
        (u: { locationId: string }) =>
          u.locationId === L_INT || u.locationId === L_OFF,
      ),
    ).toBe(false);
  });

  it("does not force every location into EXTERNAL: the owner's choice per location is the only source", () => {
    const s = snap();
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "disabled" },
        { locationId: L_NEW, mode: "disabled" },
      ]),
    );
    expect(plan.modeUpdates.map((u: { to: string }) => u.to)).toEqual([
      "disabled",
      "disabled",
    ]);
  });

  it("restating the current mode is a no-op, not a change", () => {
    const s = snap({
      locations: snap().locations.map((l) =>
        l.id === L_EXT || l.id === L_NEW
          ? { ...l, attendanceMode: "external" }
          : l,
      ),
    });
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "external" },
        { locationId: L_INT, mode: "internal_the_lineup" },
        { locationId: L_OFF, mode: "disabled" },
        { locationId: L_NEW, mode: "external" },
      ]),
    );
    // (L_NEW has no identity links; an unchanged mode is not re-validated as a transition.)
    expect(plan.modeUpdates).toBeNull();
    expect(plan.verdict).toBe("NOOP");
  });

  it("external mode needs identity links in the organization", () => {
    const s = snap();
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "external" },
        { locationId: L_NEW, mode: "external" },
      ]),
    );
    expect(codes(plan)).toContain("external_mode_without_identity_links");
    expect(plan.verdict).toBe("REFUSED");
  });

  it("rejects an invalid mode, a duplicate, an unknown or archived location, and a draft manifest", () => {
    const s = snap();
    expect(
      codes(
        planAttendanceCompatibility(
          s,
          manifest(s, [{ locationId: L_NEW, mode: "native" }]),
        ),
      ),
    ).toContain("manifest_mode_invalid");
    expect(
      codes(
        planAttendanceCompatibility(
          s,
          manifest(s, [
            { locationId: L_NEW, mode: "disabled" },
            { locationId: L_NEW, mode: "disabled" },
          ]),
        ),
      ),
    ).toContain("manifest_duplicate_location");
    expect(
      codes(
        planAttendanceCompatibility(
          s,
          manifest(s, [{ locationId: id(999), mode: "disabled" }]),
        ),
      ),
    ).toContain("manifest_location_unknown");
    expect(
      codes(
        planAttendanceCompatibility(
          s,
          manifest(s, [{ locationId: L_ARCH, mode: "disabled" }]),
        ),
      ),
    ).toContain("manifest_location_not_active");
    expect(
      codes(
        planAttendanceCompatibility(s, manifest(s, [], { status: "draft" })),
      ),
    ).toContain("manifest_not_approved");
    expect(
      codes(
        planAttendanceCompatibility(
          s,
          manifest(s, [], { stateHash: "0".repeat(64) }),
        ),
      ),
    ).toContain("manifest_state_drift");
    expect(
      codes(
        planAttendanceCompatibility(
          s,
          manifest(s, [{ locationId: L_NEW, mode: "disabled", force: true }]),
        ),
      ),
    ).toContain("manifest_unknown_key");
  });
});

describe("B4 attendance planner: source-transition conflicts", () => {
  const ack = (mode: string, loc: string) => ({
    locationId: loc,
    mode,
    acknowledgeTransitionConflict: true,
  });
  const base = (extra: unknown[]) => {
    const s = snap();
    return {
      s,
      decide: (locations: unknown[]) =>
        planAttendanceCompatibility(s, manifest(s, [...locations, ...extra])),
    };
  };
  // L_EXT and L_NEW are unconfigured: give them valid decisions so only the transition under test matters.
  const fill = [
    { locationId: L_EXT, mode: "external" },
    { locationId: L_NEW, mode: "disabled" },
  ];

  it("changing a configured mode is refused unless the owner names it and acknowledges the conflicts", () => {
    const { decide } = base(fill);
    const plan = decide([{ locationId: L_INT, mode: "external" }]);
    expect(plan.verdict).toBe("REFUSED");
    expect(plan.blockers).toContainEqual({
      code: "transition_requires_acknowledgement",
      locationId: L_INT,
      from: "internal_the_lineup",
      to: "external",
      conflicts: [
        "native_history_would_be_orphaned",
        "external_mode_without_identity_links",
      ],
    });
  });

  it("an acknowledged transition is listed with every conflict it accepted", () => {
    const { decide } = base(fill);
    const plan = decide([ack("disabled", L_INT)]);
    expect(plan.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(
      plan.modeUpdates.find(
        (u: { locationId: string }) => u.locationId === L_INT,
      ),
    ).toMatchObject({
      from: "internal_the_lineup",
      to: "disabled",
      acknowledgedConflicts: ["open_native_sessions_would_be_stranded"],
    });
  });

  it("re-enabling an explicitly disabled location is a conflict that must be acknowledged", () => {
    const { decide } = base(fill);
    expect(
      decide([{ locationId: L_OFF, mode: "internal_the_lineup" }]).blockers,
    ).toContainEqual(
      expect.objectContaining({
        code: "transition_requires_acknowledgement",
        locationId: L_OFF,
        conflicts: ["explicitly_disabled_location_reactivated"],
      }),
    );
  });

  it("external -> internal with Neon links present flags the double-count risk", () => {
    const s = snap({
      locations: snap().locations.map((l) =>
        l.id === L_EXT ? { ...l, attendanceMode: "external" } : l,
      ),
    });
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "internal_the_lineup" },
        { locationId: L_NEW, mode: "disabled" },
      ]),
    );
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({
        code: "transition_requires_acknowledgement",
        conflicts: ["neon_links_would_double_count_with_native"],
      }),
    );
  });
});

describe("B4 attendance planner: identity links (Supabase side only; Neon is never contacted)", () => {
  it("valid links produce no findings and report Neon verification as not performed", () => {
    const r = validateIdentityLinks(snap());
    expect(r.findings).toEqual([]);
    expect(r.neonVerification).toBe("not_performed");
    expect(r.links).toBe(2);
  });

  it("flags a link with no membership, an inactive member, a bad id and duplicates", () => {
    const s = snap({
      identityLinks: [
        { organizationId: ORG_MONKS, profileId: P3, neonUserId: 13 }, // inactive member
        { organizationId: ORG_MONKS, profileId: id(999), neonUserId: 14 }, // no membership
        { organizationId: ORG_MONKS, profileId: P1, neonUserId: 0 }, // invalid id
        { organizationId: ORG_MONKS, profileId: P1, neonUserId: 15 }, // duplicate profile link
        { organizationId: ORG_MONKS, profileId: P2, neonUserId: 15 }, // duplicate neon id
      ],
    });
    const codesFound = validateIdentityLinks(s).findings.map(
      (f: { code: string }) => f.code,
    );
    expect(codesFound).toEqual(
      expect.arrayContaining([
        "link_inactive_member",
        "link_without_membership",
        "invalid_neon_user_id",
        "duplicate_profile_link",
        "duplicate_neon_user_id",
      ]),
    );
  });

  it("verifies against an operator-supplied READ-ONLY export when given, never against Neon", () => {
    const s = snap({ neonUserIds: [11] });
    const r = validateIdentityLinks(s);
    expect(r.neonVerification).toBe("performed_against_supplied_export");
    expect(r.findings).toContainEqual(
      expect.objectContaining({
        code: "neon_user_not_in_supplied_export",
        neonUserId: 12,
      }),
    );
  });

  it("link errors block an external organization but only warn elsewhere", () => {
    const s = snap({ neonUserIds: [11] });
    const withExternal = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "external" },
        { locationId: L_NEW, mode: "disabled" },
      ]),
    );
    expect(withExternal.verdict).toBe("REFUSED");
    expect(codes(withExternal)).toContain(
      "identity_link_neon_user_not_in_supplied_export",
    );
    const withoutExternal = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "disabled" },
        { locationId: L_NEW, mode: "disabled" },
      ]),
    );
    expect(withoutExternal.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(
      withoutExternal.warnings.map((w: { code: string }) => w.code),
    ).toContain("identity_link_neon_user_not_in_supplied_export");
  });

  it("reports active external members that have no link yet", () => {
    const s = snap({
      memberships: [
        ...snap().memberships,
        { organizationId: ORG_MONKS, profileId: id(204), active: true },
      ],
    });
    const plan = planAttendanceCompatibility(
      s,
      manifest(s, [
        { locationId: L_EXT, mode: "external" },
        { locationId: L_NEW, mode: "disabled" },
      ]),
    );
    expect(plan.warnings).toContainEqual({
      code: "external_members_without_identity_link",
      locationId: L_EXT,
      count: 1,
    });
  });
});

describe("B4 attendance planner: financial switch and malformed input", () => {
  it("refuses to plan on top of a financial-consumption switch that is not OFF", () => {
    const plan = planAttendanceCompatibility(
      snap({ financialActivationEnabled: true }),
    );
    expect(plan.verdict).toBe("REFUSED");
    expect(codes(plan)).toContain("financial_activation_not_off");
    expect(plan.modeUpdates).toBeNull();
  });

  it("refuses a malformed snapshot and an invalid stored mode", () => {
    expect(planAttendanceCompatibility({ schema: "x" } as never).verdict).toBe(
      "REFUSED",
    );
    const bad = snap({
      locations: [{ ...snap().locations[0], attendanceMode: "native" }],
    });
    expect(planAttendanceCompatibility(bad).reasons).toContain(
      "attendance_mode_invalid",
    );
  });

  it("is deterministic and idempotent", () => {
    const s = snap();
    const m = manifest(s, [
      { locationId: L_EXT, mode: "external" },
      { locationId: L_NEW, mode: "disabled" },
    ]);
    expect(JSON.stringify(planAttendanceCompatibility(s, m))).toBe(
      JSON.stringify(planAttendanceCompatibility(s, m)),
    );
  });
});

describe("B4 attendance planner: independent-review fix (P3-5)", () => {
  it("unconfigured -> internal_the_lineup while Neon links exist needs an acknowledged transition", () => {
    const s = snap();
    const decide = (extra: Record<string, unknown> = {}) =>
      planAttendanceCompatibility(
        s,
        manifest(s, [
          { locationId: L_EXT, mode: "internal_the_lineup", ...extra },
          { locationId: L_NEW, mode: "disabled" },
        ]),
      );
    const refused = decide();
    expect(refused.verdict).toBe("REFUSED");
    expect(refused.blockers).toContainEqual({
      code: "transition_requires_acknowledgement",
      locationId: L_EXT,
      from: null,
      to: "internal_the_lineup",
      conflicts: ["neon_links_would_double_count_with_native"],
    });
    const ok = decide({ acknowledgeTransitionConflict: true });
    expect(ok.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(ok.modeUpdates[0]).toMatchObject({
      acknowledgedConflicts: ["neon_links_would_double_count_with_native"],
    });
  });
});
