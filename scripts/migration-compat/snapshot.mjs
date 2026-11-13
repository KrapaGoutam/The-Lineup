// V2-008 Batch B2-B4: READ-ONLY snapshot reader.
//
// Safety by construction:
//   * LOOPBACK ONLY. Any other host is refused before a single request is made. Reading Hosted DEV
//     or Production needs its own authorization (D-1 / D-7) and a deliberate change to this guard.
//   * GET and HEAD only. Every request goes through guardedFetch, which throws on any other method,
//     so a future edit cannot quietly introduce a write.
//   * Output is ids-only unless includeNames is set (names are used solely for the advisory
//     harness hint of the module planner).
//   * A failed or partial read throws; it is never returned as a (smaller) snapshot.
import { ATTENDANCE_SNAPSHOT_SCHEMA } from "./attendance.mjs";
import { MODULE_SNAPSHOT_SCHEMA } from "./module-config.mjs";
import { SNAPSHOT_SCHEMA } from "./role-backfill.mjs";
import { isUuid } from "./common.mjs";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const PAGE = 1000;
const MAX_PAGES = 200;

export function assertLoopback(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Refusing to run: the Supabase URL is not a valid URL.");
  }
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(
      "Refusing to run: only a loopback (local disposable) Supabase stack may be read by this tool.",
    );
  }
  return url;
}

/**
 * Wraps fetch so that anything other than GET/HEAD is impossible.
 * @param {any} [fetchImpl]
 * @returns {any}
 */
export function guardedFetch(fetchImpl = globalThis.fetch) {
  return async (input, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      throw new Error(`Refusing ${method}: this tool is read-only.`);
    }
    // redirect: "error" is spread LAST so a caller can never re-enable following: the service key
    // travels in a custom header that undici does NOT strip on a cross-origin redirect.
    return fetchImpl(input, { ...init, method, redirect: "error" });
  };
}

/** Defence in depth behind redirect: "error": a response that did not come from the loopback origin is refused. */
function assertSameOrigin(response, base) {
  if (response.url && new URL(response.url).origin !== base) {
    throw new Error(
      "Refusing a response from a different origin than the loopback stack.",
    );
  }
}

function client({ url, key, fetchImpl }) {
  const base = assertLoopback(url).origin;
  if (typeof key !== "string" || key.length < 10) {
    throw new Error(
      "A service key is required to read the snapshot (never printed).",
    );
  }
  const doFetch = guardedFetch(fetchImpl);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  async function select(table, query) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await doFetch(
        `${base}/rest/v1/${table}?${query}&limit=${PAGE}&offset=${page * PAGE}`,
        { headers },
      );
      assertSameOrigin(response, base);
      if (!response.ok) {
        throw new Error(
          `Read of ${table} failed (${response.status}); no partial snapshot is produced.`,
        );
      }
      const batch = await response.json();
      if (!Array.isArray(batch))
        throw new Error(`Read of ${table} returned an unexpected shape.`);
      rows.push(...batch);
      if (batch.length < PAGE) return rows;
    }
    throw new Error(
      `Read of ${table} exceeded ${MAX_PAGES * PAGE} rows; refusing a partial snapshot.`,
    );
  }

  async function count(table, query) {
    const response = await doFetch(
      `${base}/rest/v1/${table}?${query}&select=id`,
      {
        method: "HEAD",
        headers: { ...headers, Prefer: "count=exact" },
      },
    );
    assertSameOrigin(response, base);
    if (!response.ok)
      throw new Error(`Count of ${table} failed (${response.status}).`);
    const range = response.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1]);
    if (!Number.isInteger(total))
      throw new Error(`Count of ${table} returned no total.`);
    return total;
  }

  return { select, count };
}

const inList = (ids) => `in.(${ids.join(",")})`;

/**
 * One organization, for the B2 validator.
 * @param {any} options
 * @returns {Promise<any>}
 */
export async function readOrganizationSnapshot({
  url,
  key,
  organizationId,
  fetchImpl,
  now = () => new Date(),
}) {
  if (!isUuid(organizationId))
    throw new Error("organizationId must be a uuid.");
  const db = client({ url, key, fetchImpl });
  const locations = await db.select(
    "locations",
    `select=id,organization_id,active,archived_at&organization_id=eq.${organizationId}&order=id`,
  );
  const memberships = await db.select(
    "memberships",
    `select=profile_id,roles,active&organization_id=eq.${organizationId}&order=profile_id`,
  );
  const locationIds = locations.map((l) => l.id);
  const rows = locationIds.length
    ? await db.select(
        "location_memberships",
        `select=location_id,profile_id,role,active&location_id=${inList(locationIds)}&order=location_id,profile_id`,
      )
    : [];
  const overall = await db.select(
    "overall_roles",
    "select=profile_id&order=profile_id",
  );
  return {
    schema: SNAPSHOT_SCHEMA,
    capturedAt: now().toISOString(),
    organizationId,
    locations: locations.map((l) => ({
      id: l.id,
      organizationId: l.organization_id,
      active: l.active,
      archivedAt: l.archived_at,
    })),
    memberships: memberships.map((m) => ({
      profileId: m.profile_id,
      roles: m.roles,
      active: m.active,
    })),
    locationMemberships: rows.map((r) => ({
      locationId: r.location_id,
      profileId: r.profile_id,
      role: r.role,
      active: r.active,
    })),
    overallProfileIds: [...new Set(overall.map((o) => o.profile_id))].sort(),
  };
}

/** Selected locations (or one organization's locations) for the B3 planner. */
/**
 * @param {any} options
 * @returns {Promise<any>}
 */
export async function readModuleSnapshot({
  url,
  key,
  organizationId,
  locationIds,
  scope,
  includeNames = false,
  fetchImpl,
  now = () => new Date(),
}) {
  const db = client({ url, key, fetchImpl });
  let filter;
  if (locationIds?.length) {
    for (const id of locationIds)
      if (!isUuid(id)) throw new Error("locationIds must be uuids.");
    filter = `id=${inList(locationIds)}`;
  } else if (organizationId) {
    if (!isUuid(organizationId))
      throw new Error("organizationId must be a uuid.");
    filter = `organization_id=eq.${organizationId}`;
  } else if (scope === "environment") {
    filter = "id=not.is.null";
  } else {
    throw new Error(
      "Select locations with locationIds, organizationId or scope=environment.",
    );
  }
  const select = includeNames
    ? "id,organization_id,active,archived_at,name,organizations(slug)"
    : "id,organization_id,active,archived_at";
  const locations = await db.select(
    "locations",
    `select=${select}&${filter}&order=id`,
  );
  const ids = locations.map((l) => l.id);
  const configs = ids.length
    ? await db.select(
        "location_module_configs",
        `select=location_id,module_key,is_enabled&location_id=${inList(ids)}&order=location_id,module_key`,
      )
    : [];
  return {
    schema: MODULE_SNAPSHOT_SCHEMA,
    capturedAt: now().toISOString(),
    scope: scope === "environment" ? "environment" : "selected",
    locations: locations.map((l) => ({
      id: l.id,
      organizationId: l.organization_id,
      active: l.active,
      archivedAt: l.archived_at,
      ...(includeNames
        ? { name: l.name, organizationSlug: l.organizations?.slug }
        : {}),
    })),
    moduleConfigs: configs.map((c) => ({
      locationId: c.location_id,
      moduleKey: c.module_key,
      isEnabled: c.is_enabled,
    })),
  };
}

/** One organization, for the B4 planner. `neonUserIds` is an optional operator-supplied export. */
/**
 * @param {any} options
 * @returns {Promise<any>}
 */
export async function readAttendanceSnapshot({
  url,
  key,
  organizationId,
  neonUserIds = null,
  fetchImpl,
  now = () => new Date(),
}) {
  if (!isUuid(organizationId))
    throw new Error("organizationId must be a uuid.");
  const db = client({ url, key, fetchImpl });
  const locations = await db.select(
    "locations",
    `select=id,organization_id,active,archived_at,attendance_mode&organization_id=eq.${organizationId}&order=id`,
  );
  const memberships = await db.select(
    "memberships",
    `select=organization_id,profile_id,active&organization_id=eq.${organizationId}&order=profile_id`,
  );
  const links = await db.select(
    "attendance_identity_links",
    `select=organization_id,profile_id,neon_user_id&organization_id=eq.${organizationId}&order=profile_id`,
  );
  const finance = await db.select(
    "attendance_financial_activation",
    "select=enabled",
  );
  if (finance.length !== 1 || typeof finance[0].enabled !== "boolean") {
    throw new Error(
      "The financial activation singleton could not be read; refusing to continue.",
    );
  }
  const enriched = [];
  for (const l of locations) {
    const native = await db.count(
      "attendance_sessions",
      `location_id=eq.${l.id}`,
    );
    const open = await db.count(
      "attendance_sessions",
      `location_id=eq.${l.id}&clock_out_at=is.null`,
    );
    enriched.push({
      id: l.id,
      organizationId: l.organization_id,
      active: l.active,
      archivedAt: l.archived_at,
      attendanceMode: l.attendance_mode,
      nativeSessionCount: native,
      openNativeSessionCount: open,
    });
  }
  return {
    schema: ATTENDANCE_SNAPSHOT_SCHEMA,
    capturedAt: now().toISOString(),
    locations: enriched,
    memberships: memberships.map((m) => ({
      organizationId: m.organization_id,
      profileId: m.profile_id,
      active: m.active,
    })),
    identityLinks: links.map((k) => ({
      organizationId: k.organization_id,
      profileId: k.profile_id,
      neonUserId: k.neon_user_id,
    })),
    neonUserIds,
    financialActivationEnabled: finance[0].enabled,
  };
}
