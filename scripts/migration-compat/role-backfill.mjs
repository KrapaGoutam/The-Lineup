// V2-008 Batch B2: organization-ATOMIC role-backfill validator and dry-run planner. PURE.
//
// Input  : one organization snapshot (snapshot.mjs) + an optional owner-approved manifest.
// Output : a verdict - APPLY (a complete, reviewable changeset), NOOP (already correct) or SKIP
//          (an exception report and NO changeset). It never writes anything and has no executor.
//
// Why atomic: the deployed legacy fallback disappears for an organization as soon as ANY
// location_memberships row of ANY status exists at ANY of its locations, while the TypeScript
// resolver has no fallback at all. A half-applied organization therefore locks real people out
// (measured in pgTAP 0081, "partial"). The plan is emitted only for a COMPLETE organization.
//
// Policies (owner-adopted for local tooling): D-2 ladder, D-2b conservative multi-role,
// D-2c conservative multi-location. See OWNER_DECISIONS_REQUIRED.md section 4.5 for the contract.
import {
  LADDER,
  LEGACY_ROLES,
  LOCATION_ROLE_RANK,
  LOCATION_ROLES,
  byKey,
  isActiveLocation,
  isPlainObject,
  isUuid,
  sha256,
  uniqueSorted,
  unknownKeys,
} from "./common.mjs";
import { compareBands, levelString, levelsFor } from "./capability-model.mjs";

export const SNAPSHOT_SCHEMA = "v2-008.org-snapshot/1";
export const ROLE_MANIFEST_SCHEMA = "v2-008.role-manifest/1";

const SNAPSHOT_KEYS = [
  "schema",
  "capturedAt",
  "organizationId",
  "locations",
  "memberships",
  "locationMemberships",
  "overallProfileIds",
];
const MANIFEST_KEYS = [
  "schema",
  "organizationId",
  "stateHash",
  "status",
  "approvedBy",
  "assignments",
  "intentionallyUnassigned",
  "acknowledgeExpansions",
  "acknowledgeUnmeasuredCapability",
];
const UNASSIGNED_KEYS = ["profileId", "reason"];
const ASSIGNMENT_KEYS = [
  "profileId",
  "locationId",
  "role",
  "acknowledgeReduction",
];

/**
 * Structural validation of a snapshot. Returns exception objects (empty = well formed).
 * @param {any} snapshot
 * @returns {any[]}
 */
export function validateSnapshot(snapshot) {
  const errors = [];
  const bad = (code, detail = {}) => errors.push({ code, ...detail });
  if (!isPlainObject(snapshot)) return [{ code: "snapshot_not_an_object" }];
  for (const k of unknownKeys(snapshot, SNAPSHOT_KEYS))
    bad("snapshot_unknown_key", { key: k });
  if (snapshot.schema !== SNAPSHOT_SCHEMA) bad("snapshot_schema_mismatch");
  if (!isUuid(snapshot.organizationId)) bad("snapshot_organization_id_invalid");
  for (const key of ["locations", "memberships", "locationMemberships"]) {
    if (!Array.isArray(snapshot[key])) bad("snapshot_array_missing", { key });
  }
  if (errors.length) return errors;

  const locationIds = new Set();
  for (const l of snapshot.locations) {
    if (!isUuid(l.id)) bad("location_id_invalid");
    else if (locationIds.has(l.id))
      bad("duplicate_location", { locationId: l.id });
    locationIds.add(l.id);
    if (l.organizationId !== snapshot.organizationId) {
      // A location of another tenant inside this organization's snapshot.
      bad("cross_tenant_location", { locationId: l.id });
    }
    if (typeof l.active !== "boolean")
      bad("location_active_invalid", { locationId: l.id });
  }
  const seenMember = new Set();
  for (const m of snapshot.memberships) {
    if (!isUuid(m.profileId)) bad("membership_profile_invalid");
    if (seenMember.has(m.profileId)) {
      bad("duplicate_membership", { profileId: m.profileId });
    }
    seenMember.add(m.profileId);
    if (!Array.isArray(m.roles) || typeof m.active !== "boolean") {
      bad("membership_shape_invalid", { profileId: m.profileId });
    }
  }
  const seenRow = new Set();
  for (const r of snapshot.locationMemberships) {
    if (!isUuid(r.locationId) || !isUuid(r.profileId)) {
      bad("location_row_ids_invalid");
      continue;
    }
    if (!locationIds.has(r.locationId)) {
      // A row pointing at a location that is not in this organization's snapshot.
      bad("row_location_not_in_organization", {
        locationId: r.locationId,
        profileId: r.profileId,
      });
    }
    const key = `${r.locationId}|${r.profileId}`;
    if (seenRow.has(key))
      bad("duplicate_location_row", {
        locationId: r.locationId,
        profileId: r.profileId,
      });
    seenRow.add(key);
    if (!LOCATION_ROLES.includes(r.role) || typeof r.active !== "boolean") {
      bad("location_row_shape_invalid", {
        locationId: r.locationId,
        profileId: r.profileId,
      });
    }
  }
  return errors;
}

/**
 * Hash of everything that decides the plan. A manifest is bound to it; drift => refusal.
 * @param {any} snapshot
 * @returns {string}
 */
export function computeStateHash(snapshot) {
  return sha256({
    organizationId: snapshot.organizationId,
    locations: [...snapshot.locations]
      .map((l) => ({
        id: l.id,
        active: l.active,
        archived: (l.archivedAt ?? null) !== null,
      }))
      .sort(byKey((l) => l.id)),
    memberships: [...snapshot.memberships]
      .map((m) => ({
        profileId: m.profileId,
        roles: [...m.roles].sort(),
        active: m.active,
      }))
      .sort(byKey((m) => m.profileId)),
    locationMemberships: [...snapshot.locationMemberships]
      .map((r) => ({
        locationId: r.locationId,
        profileId: r.profileId,
        role: r.role,
        active: r.active,
      }))
      .sort(byKey((r) => `${r.locationId}|${r.profileId}`)),
  });
}

/**
 * Manifest validation. Returns exception objects (empty = usable).
 * @param {any} manifest
 * @param {any} snapshot
 * @param {string} stateHash
 * @returns {any[]}
 */
export function validateRoleManifest(manifest, snapshot, stateHash) {
  const errors = [];
  const bad = (code, detail = {}) => errors.push({ code, ...detail });
  if (!isPlainObject(manifest)) return [{ code: "manifest_not_an_object" }];
  for (const k of unknownKeys(manifest, MANIFEST_KEYS))
    bad("manifest_unknown_key", { key: k });
  if (manifest.schema !== ROLE_MANIFEST_SCHEMA) bad("manifest_schema_mismatch");
  if (manifest.status !== "approved") bad("manifest_not_approved");
  if (
    typeof manifest.approvedBy !== "string" ||
    manifest.approvedBy.trim() === ""
  ) {
    bad("manifest_incomplete", { field: "approvedBy" });
  }
  if (manifest.organizationId !== snapshot.organizationId)
    bad("manifest_organization_mismatch");
  if (manifest.stateHash !== stateHash) bad("manifest_state_drift");
  if (!Array.isArray(manifest.assignments))
    bad("manifest_incomplete", { field: "assignments" });
  if (
    manifest.intentionallyUnassigned !== undefined &&
    !Array.isArray(manifest.intentionallyUnassigned)
  ) {
    bad("manifest_incomplete", { field: "intentionallyUnassigned" });
  }
  for (const u of Array.isArray(manifest.intentionallyUnassigned)
    ? manifest.intentionallyUnassigned
    : []) {
    if (!isPlainObject(u) || !isUuid(u.profileId)) {
      bad("manifest_unassigned_entry_invalid");
      continue;
    }
    for (const k of unknownKeys(u, UNASSIGNED_KEYS))
      bad("manifest_unknown_key", { key: k, profileId: u.profileId });
  }
  if (
    manifest.acknowledgeExpansions !== undefined &&
    (!Array.isArray(manifest.acknowledgeExpansions) ||
      !manifest.acknowledgeExpansions.every(isUuid))
  ) {
    bad("manifest_incomplete", { field: "acknowledgeExpansions" });
  }
  {
    const listed = new Set(
      (Array.isArray(manifest.assignments) ? manifest.assignments : []).map(
        (a) => a?.profileId,
      ),
    );
    for (const u of Array.isArray(manifest.intentionallyUnassigned)
      ? manifest.intentionallyUnassigned
      : []) {
      if (u && listed.has(u.profileId))
        bad("manifest_conflicting_entries", { profileId: u.profileId });
    }
  }
  for (const a of manifest.assignments ?? []) {
    if (!isPlainObject(a)) {
      bad("manifest_assignment_invalid");
      continue;
    }
    for (const k of unknownKeys(a, ASSIGNMENT_KEYS))
      bad("manifest_unknown_key", { key: k });
    if (
      !isUuid(a.profileId) ||
      !isUuid(a.locationId) ||
      !LOCATION_ROLES.includes(a.role)
    ) {
      bad("manifest_assignment_invalid", { profileId: a.profileId });
    }
  }
  return errors;
}

const rowKey = (locationId, profileId) => `${locationId}|${profileId}`;

/**
 * @param {any} snapshot  see SNAPSHOT_SCHEMA
 * @param {any} [manifest]  see ROLE_MANIFEST_SCHEMA; null/undefined = no owner decisions supplied
 * @returns {any} the plan (a JSON document; see the tests for its shape)
 */
export function planOrganizationBackfill(snapshot, manifest = null) {
  const authorization = {
    dryRunOnly: true,
    executionAuthorized: false,
    note: "Planning output only. No writer exists in this package; Hosted DEV writes need D-7, per step.",
  };
  const structural = validateSnapshot(snapshot);
  if (structural.length) {
    return {
      schema: "v2-008.role-plan/1",
      organizationId: isUuid(snapshot?.organizationId)
        ? snapshot.organizationId
        : null,
      verdict: "SKIP",
      reasons: uniqueSorted(structural.map((e) => e.code)),
      exceptions: structural,
      changeset: null,
      authorization,
    };
  }

  const orgId = snapshot.organizationId;
  const stateHash = computeStateHash(snapshot);
  const exceptions = [];
  const warnings = [];
  const add = (code, detail = {}) => exceptions.push({ code, ...detail });

  // ---- manifest -------------------------------------------------------------------------
  let usableManifest = null;
  if (manifest !== null && manifest !== undefined) {
    const manifestErrors = validateRoleManifest(manifest, snapshot, stateHash);
    if (manifestErrors.length) {
      for (const e of manifestErrors) exceptions.push(e);
    } else {
      usableManifest = manifest;
    }
  }

  // ---- facts ----------------------------------------------------------------------------
  const locationById = new Map(snapshot.locations.map((l) => [l.id, l]));
  const activeLocations = snapshot.locations
    .filter(isActiveLocation)
    .sort(byKey((l) => l.id));
  const N = activeLocations.length;
  const membersByProfile = new Map(
    snapshot.memberships.map((m) => [m.profileId, m]),
  );
  const activeMembers = snapshot.memberships
    .filter((m) => m.active)
    .sort(byKey((m) => m.profileId));
  const existingRows = snapshot.locationMemberships;
  const existingByKey = new Map(
    existingRows.map((r) => [rowKey(r.locationId, r.profileId), r]),
  );
  const overall = new Set(snapshot.overallProfileIds ?? []);
  // Profiles whose owner-chosen LOWER role was explicitly acknowledged (an accepted reduction).
  const acknowledgedReductions = new Set();
  const inactiveMembers = snapshot.memberships
    .filter((m) => !m.active)
    .map((m) => m.profileId)
    .sort();
  if (inactiveMembers.length) {
    // They receive no row. Once any row exists the fallback is gone, so reactivating one of them
    // later means a lock-out until an owner assigns them: say so now.
    warnings.push({
      code: "inactive_members_not_mapped",
      profiles: inactiveMembers,
      detail:
        "Inactive members get no location row. Reactivating one after the backfill leaves them without operational access until an owner assigns them.",
    });
  }

  const signedUnassigned = new Map(
    (usableManifest?.intentionallyUnassigned ?? []).map((u) => [
      u.profileId,
      u,
    ]),
  );
  const explicitByProfile = new Map();
  const rejectedExplicit = new Set(); // profiles whose manifest entries were refused above
  for (const a of usableManifest?.assignments ?? []) {
    const list = explicitByProfile.get(a.profileId) ?? [];
    list.push(a);
    explicitByProfile.set(a.profileId, list);
  }
  const acknowledgedExpansions = new Set(
    usableManifest?.acknowledgeExpansions ?? [],
  );

  // Manifest hygiene: every assignment must name an ACTIVE member of THIS organization.
  for (const [profileId, list] of explicitByProfile) {
    const member = membersByProfile.get(profileId);
    if (!member || !member.active) {
      add("manifest_profile_not_active_member", { profileId });
      rejectedExplicit.add(profileId);
      continue;
    }
    const seen = new Set();
    for (const a of list) {
      const loc = locationById.get(a.locationId);
      if (!loc)
        add("manifest_location_not_in_organization", {
          profileId,
          locationId: a.locationId,
        });
      else if (!isActiveLocation(loc))
        add("manifest_location_not_active", {
          profileId,
          locationId: a.locationId,
        });
      if (seen.has(a.locationId))
        add("manifest_duplicate_assignment", {
          profileId,
          locationId: a.locationId,
        });
      seen.add(a.locationId);
    }
  }
  for (const profileId of signedUnassigned.keys()) {
    const member = membersByProfile.get(profileId);
    if (!member || !member.active)
      add("manifest_unassigned_not_active_member", { profileId });
  }

  // ---- fallback-cliff facts ----------------------------------------------------------
  const cliff = {
    activeLocations: N,
    existingRowsAnyStatus: existingRows.length,
    fallbackActiveToday: N === 1 && existingRows.length === 0,
    currentlyPartial: [],
    explanation:
      "The legacy fallback applies only while the organization has exactly one active location and no location_memberships row of ANY status at ANY location. The first row removes it for every unassigned member.",
  };
  if (existingRows.length > 0) {
    const covered = new Set(
      existingRows
        .filter(
          (r) =>
            r.active && isActiveLocation(locationById.get(r.locationId) ?? {}),
        )
        .map((r) => r.profileId),
    );
    cliff.currentlyPartial = activeMembers
      .filter((m) => !covered.has(m.profileId))
      .map((m) => m.profileId);
  }
  if (cliff.currentlyPartial.length > 0) {
    // Not a blocker: completing the organization is exactly what removes the lock-out. Loud, though.
    warnings.push({
      code: "organization_currently_partial",
      affectedProfiles: cliff.currentlyPartial,
      detail:
        "These active members have no active location row although other rows exist: they have no operational access today.",
    });
  }

  // ---- member resolution ---------------------------------------------------------------
  const target = new Map(); // rowKey -> {locationId, profileId, role, origin}
  const members = [];
  const setTarget = (locationId, profileId, role, origin) => {
    target.set(rowKey(locationId, profileId), {
      locationId,
      profileId,
      role,
      origin,
    });
  };
  if (N >= 2 && usableManifest === null) {
    add("multi_location_requires_complete_manifest", { activeLocations: N });
  }
  if (N === 0) add("no_active_location");

  for (const m of activeMembers) {
    const profileId = m.profileId;
    const roles = uniqueSorted(m.roles);
    const entry = {
      profileId,
      legacyRoles: roles,
      overallRoleHolder: overall.has(profileId),
      status: "",
      rows: [],
    };
    members.push(entry);

    if (signedUnassigned.has(profileId)) {
      entry.status = "unassigned_signed";
      const hasRow = existingRows.some((r) => r.profileId === profileId);
      if (hasRow) add("row_for_intentionally_unassigned_member", { profileId });
      continue;
    }
    if (roles.length === 0) {
      entry.status = "exception";
      add("empty_roles", { profileId });
      continue;
    }
    const unknown = roles.filter((r) => !LEGACY_ROLES.includes(r));
    if (unknown.length) {
      entry.status = "exception";
      add("unknown_role", { profileId, roles: unknown });
      continue;
    }
    const ladderRoles = roles.map((r) => LADDER[r]);
    const ceiling = ladderRoles.sort(
      (a, b) => LOCATION_ROLE_RANK[b] - LOCATION_ROLE_RANK[a],
    )[0];
    const explicit = rejectedExplicit.has(profileId)
      ? undefined
      : explicitByProfile.get(profileId);

    if (explicit && explicit.length) {
      for (const a of explicit) {
        const loc = locationById.get(a.locationId);
        if (!loc || !isActiveLocation(loc)) continue; // already reported
        const existing = existingByKey.get(rowKey(a.locationId, profileId));
        const equalsExisting =
          existing && existing.active && existing.role === a.role;
        if (!equalsExisting) {
          // CREATING a row: never above what the legacy roles already grant (no combining roles).
          if (LOCATION_ROLE_RANK[a.role] > LOCATION_ROLE_RANK[ceiling]) {
            add("explicit_exceeds_ladder", {
              profileId,
              locationId: a.locationId,
              role: a.role,
              ceiling,
            });
            continue;
          }
          // Any owner-chosen role below the highest legacy role is a reduction, for one role or
          // several: a location row overrides the organization role in Tasks/Tips/Schedule.
          if (LOCATION_ROLE_RANK[a.role] < LOCATION_ROLE_RANK[ceiling]) {
            if (!a.acknowledgeReduction) {
              add("explicit_reduces_privilege", {
                profileId,
                locationId: a.locationId,
                role: a.role,
                ladder: ceiling,
              });
              continue;
            }
            acknowledgedReductions.add(profileId);
          }
        }
        setTarget(a.locationId, profileId, a.role, "manifest");
      }
      entry.status = "mapped";
      continue;
    }
    if (roles.length > 1) {
      entry.status = "exception";
      add("multi_role_requires_explicit_mapping", { profileId, roles });
      continue;
    }
    if (N === 1) {
      setTarget(activeLocations[0].id, profileId, LADDER[roles[0]], "ladder");
      entry.status = "mapped";
    } else if (N >= 2) {
      entry.status = "exception";
      add("multi_location_member_requires_explicit_assignment", {
        profileId,
        activeLocations: N,
      });
    } else {
      entry.status = "exception";
    }
  }

  // ---- existing rows vs target (rule 3) --------------------------------------------------
  const alreadyPresent = new Set();
  for (const r of [...existingRows].sort(
    byKey((x) => rowKey(x.locationId, x.profileId)),
  )) {
    const key = rowKey(r.locationId, r.profileId);
    const member = membersByProfile.get(r.profileId);
    const loc = locationById.get(r.locationId);
    const where = { profileId: r.profileId, locationId: r.locationId };
    if (!member || !member.active) {
      add("row_without_active_membership", where);
      continue;
    }
    if (!loc || !isActiveLocation(loc)) {
      add("row_at_inactive_location", where);
      continue;
    }
    if (!r.active) {
      // Never reactivated: an owner may have deactivated it on purpose.
      add("inactive_row_never_reactivated", where);
      continue;
    }
    const t = target.get(key);
    if (!t) {
      if (!signedUnassigned.has(r.profileId))
        add("existing_row_not_in_plan", { ...where, role: r.role });
      continue;
    }
    if (t.role !== r.role) {
      add("differing_role", { ...where, existing: r.role, planned: t.role });
      continue;
    }
    alreadyPresent.add(key);
  }

  // ---- completeness (rule 2) -----------------------------------------------------------
  const hasTargetOrSigned = (profileId) =>
    signedUnassigned.has(profileId) ||
    [...target.values()].some((t) => t.profileId === profileId);
  for (const m of members) {
    if (m.status === "unassigned_signed") continue;
    if (m.status === "exception") continue; // already reported with its specific code
    if (!hasTargetOrSigned(m.profileId)) {
      m.status = "exception";
      add("unmapped_member", { profileId: m.profileId });
    }
  }

  // ---- capability preservation (N = 1 only, pinned to pgTAP 0081) -----------------------
  const rowsToInsert = [...target.values()]
    .filter((t) => !alreadyPresent.has(rowKey(t.locationId, t.profileId)))
    .sort(byKey((t) => rowKey(t.locationId, t.profileId)));
  const capability = {
    verification: N === 1 ? "measured_n1" : "not_measured_n_ge_2",
    rows: [],
    expansions: [],
    reductions: [],
    preExistingExcess: [],
    note:
      N === 1
        ? "Levels come from a model pinned to the deployed *_profile_level functions (pgTAP 0081)."
        : "Not modelled at two or more active locations; see security-s1/d2_role_ladder_equivalence_output.md. Requires owner review of the e1Flags.",
  };
  if (N === 1) {
    const loc = activeLocations[0];
    const insertedProfiles = new Set(rowsToInsert.map((t) => t.profileId));
    for (const m of members) {
      if (m.status === "unassigned_signed" || m.legacyRoles.length !== 1)
        continue;
      const role = m.legacyRoles[0];
      const existing = existingByKey.get(rowKey(loc.id, m.profileId));
      const existingActive = existing && existing.active ? existing.role : null;
      const planned = target.get(rowKey(loc.id, m.profileId));
      // BASELINE = the approved effective capability: what the legacy organization role grants in
      // the legacy fallback state. A partially migrated organization is NOT the baseline (its
      // members are already locked out); it is reported separately as a warning.
      const baseline = levelsFor(role, null, {
        activeLocationCount: 1,
        orgHasAnyLocationRow: false,
      });
      const after = levelsFor(role, planned ? planned.role : existingActive, {
        activeLocationCount: 1,
        orgHasAnyLocationRow: existingRows.length + rowsToInsert.length > 0,
      });
      if (!baseline || !after) continue;
      const changes = compareBands(baseline, after).filter(
        (c) => c.change !== "unchanged",
      );
      capability.rows.push({
        profileId: m.profileId,
        legacyRole: role,
        before: levelString(baseline),
        after: levelString(after),
        createdByMigration: insertedProfiles.has(m.profileId),
        changes,
      });
      for (const c of changes) {
        if (c.change === "reduction") {
          capability.reductions.push({ profileId: m.profileId, ...c });
        } else if (insertedProfiles.has(m.profileId)) {
          capability.expansions.push({ profileId: m.profileId, ...c });
        } else {
          // An excess that already exists in the database and that this migration does not create.
          capability.preExistingExcess.push({ profileId: m.profileId, ...c });
        }
      }
    }
    for (const r of capability.reductions) {
      if (acknowledgedReductions.has(r.profileId)) {
        warnings.push({
          code: "acknowledged_capability_reduction",
          profileId: r.profileId,
          module: r.module,
          before: r.before,
          after: r.after,
        });
        continue;
      }
      add("capability_reduction", {
        profileId: r.profileId,
        module: r.module,
        before: r.before,
        after: r.after,
      });
    }
    for (const x of capability.expansions) {
      if (!acknowledgedExpansions.has(x.profileId)) {
        add("privilege_expansion", {
          profileId: x.profileId,
          module: x.module,
          before: x.before,
          after: x.after,
        });
      }
    }
  } else if (
    N >= 2 &&
    rowsToInsert.length > 0 &&
    usableManifest &&
    usableManifest.acknowledgeUnmeasuredCapability !== true
  ) {
    // Unmeasured domain: the owner must say they reviewed the E-1 flags below.
    add("capability_not_measured_requires_acknowledgement", {
      activeLocations: N,
    });
  }
  capability.rows.sort(byKey((r) => r.profileId));

  // ---- E-1 flags: every manager / assistant row is a privilege grant to list -----------
  const e1Flags = rowsToInsert
    .filter((t) => t.role === "manager" || t.role === "assistant_manager")
    .map((t) => ({
      profileId: t.profileId,
      locationId: t.locationId,
      role: t.role,
      sharedCatalogAuthority:
        N <= 1
          ? "retained_by_single_location_exception"
          : "none_organization_level_only",
    }));

  // ---- verdict ---------------------------------------------------------------------
  exceptions.sort(
    byKey((e) => `${e.code}|${e.profileId ?? ""}|${e.locationId ?? ""}`),
  );
  const reasons = uniqueSorted(exceptions.map((e) => e.code));
  const unassignedSigned = members
    .filter((m) => m.status === "unassigned_signed")
    .map((m) => m.profileId);

  let verdict;
  if (exceptions.length > 0) verdict = "SKIP";
  else if (rowsToInsert.length === 0) verdict = "NOOP";
  else verdict = "APPLY";

  const changeset =
    verdict === "APPLY"
      ? {
          organizationId: orgId,
          stateHash,
          atomicPerOrganization: true,
          insertRows: rowsToInsert.map((t) => ({
            locationId: t.locationId,
            profileId: t.profileId,
            role: t.role,
            active: true,
            origin: t.origin,
          })),
          touches: {
            memberships: false,
            overallRoles: false,
            locations: false,
            moduleConfigs: false,
            existingLocationMemberships: false,
          },
        }
      : null;

  // Expected after-state (only meaningful when nothing blocks the plan).
  const afterRows = [
    ...existingRows
      .filter(
        (r) =>
          r.active && alreadyPresent.has(rowKey(r.locationId, r.profileId)),
      )
      .map((r) => ({
        locationId: r.locationId,
        profileId: r.profileId,
        role: r.role,
      })),
    ...rowsToInsert.map((t) => ({
      locationId: t.locationId,
      profileId: t.profileId,
      role: t.role,
    })),
  ];
  const perLocation = {};
  for (const r of afterRows) {
    const bucket = (perLocation[r.locationId] ??= {
      manager: 0,
      assistant_manager: 0,
      staff: 0,
    });
    bucket[r.role] += 1;
  }

  return {
    schema: "v2-008.role-plan/1",
    organizationId: orgId,
    stateHash,
    verdict,
    reasons,
    counts: {
      activeLocations: N,
      activeMembers: activeMembers.length,
      inactiveMembers: snapshot.memberships.length - activeMembers.length,
      existingLocationRows: existingRows.length,
      alreadyPresent: alreadyPresent.size,
      rowsToInsert: rowsToInsert.length,
      exceptions: exceptions.length,
      intentionallyUnassigned: unassignedSigned.length,
    },
    fallbackCliff: cliff,
    members: members.sort(byKey((m) => m.profileId)),
    exceptions,
    warnings,
    changeset,
    capability,
    e1Flags,
    accessLossIfApplied: unassignedSigned,
    expectedAfter:
      verdict === "SKIP"
        ? null
        : {
            activeLocationRows: afterRows.length,
            perLocation,
            activeMembersWithoutActiveRow: members.filter(
              (m) =>
                m.status !== "unassigned_signed" &&
                !afterRows.some((r) => r.profileId === m.profileId),
            ).length,
            membershipsChanged: 0,
            overallRolesChanged: 0,
          },
    reconciliation: [
      "Recompute the state hash inside the executing transaction; refuse on any difference.",
      "Insert every changeset row or none (one transaction per organization); never ON CONFLICT DO UPDATE.",
      "After the inserts, run the completeness query: active members with no active location row, excluding the signed-unassigned list, must be 0.",
      "memberships.roles and memberships.active must be byte-identical to the snapshot (state hash over memberships unchanged).",
      "overall_roles row count must be unchanged (this migration never creates an Overall role).",
      "For every capability.rows entry, the six *_profile_level results must equal the 'after' string (att:inv:pay:sch:tas:tip).",
      "No existing location_memberships row was updated, reactivated or deleted.",
    ],
    authorization,
  };
}

/**
 * Pure helper for tests and reviewers: what the snapshot would look like if the changeset were
 * applied. Used to prove idempotency (plan(apply(plan)) is NOOP). Never touches a database.
 * @param {any} snapshot
 * @param {any} changeset
 * @returns {any}
 */
export function applyChangesetToSnapshot(snapshot, changeset) {
  if (!changeset) return snapshot;
  return {
    ...snapshot,
    locationMemberships: [
      ...snapshot.locationMemberships,
      ...changeset.insertRows.map((r) => ({
        locationId: r.locationId,
        profileId: r.profileId,
        role: r.role,
        active: true,
      })),
    ],
  };
}
