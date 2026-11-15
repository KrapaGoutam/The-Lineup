import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVE_CONTEXT_COOKIE_NAME } from "@/features/context/domain/context-cookie";
import type { FakeDb } from "@/features/context/testing/fake-supabase";
import {
  IDS,
  addAssignment,
  addMembership,
  addOverall,
  baseDb,
  createFakeSupabase,
} from "@/features/context/testing/fake-supabase";

/**
 * V2-003.004 — persistence exercised end to end at the server boundary: the
 * REAL Server Actions, cookie writer, loader, canonical resolver and
 * `getPrimaryLocation`, on the RLS-emulating in-memory Supabase double and a
 * fake cookie jar. This is NOT hosted DEV verification (see EVIDENCE.md).
 */

type SetCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

const env = vi.hoisted(() => ({
  userId: null as string | null,
  authError: null as { name?: string; status?: number } | null,
  db: null as unknown,
  tableErrors: undefined as unknown,
  jar: new Map<string, string>(),
  sets: [] as SetCall[],
  referer: null as string | null,
  host: "app.test",
  proto: null as string | null,
  forwardedHost: null as string | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      env.jar.has(name) ? { name, value: env.jar.get(name) } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      env.sets.push({ name, value, options });
      if (options?.maxAge === 0 || value === "") env.jar.delete(name);
      else env.jar.set(name, value);
    },
  }),
  headers: async () => {
    const h = new Headers({ host: env.host });
    if (env.referer) h.set("referer", env.referer);
    if (env.proto) h.set("x-forwarded-proto", env.proto);
    if (env.forwardedHost) h.set("x-forwarded-host", env.forwardedHost);
    return h;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    createFakeSupabase({
      userId: env.userId,
      db: env.db as FakeDb,
      authError: env.authError,
      tableErrors: env.tableErrors as never,
    }).client,
}));

import {
  clearActiveContextAction,
  setActiveContextAction,
} from "@/features/context/actions/context-actions";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { POST as signOutRoute } from "@/app/api/auth/signout/route";

const NEW_ORG_B = IDS.orgLiquorTap;
const WEBSTER = IDS.locWebster;
const MONKS_SECOND = IDS.locMonksSecond;
const NASA = IDS.locNasa;
const LEAGUE = IDS.locLeagueCity;

const pair = (organizationId: string, locationId: string) => ({
  organizationId,
  locationId,
});
const cookieValue = () => env.jar.get(ACTIVE_CONTEXT_COOKIE_NAME) ?? null;
const cookieFor = (o: string, l: string) => JSON.stringify({ v: 1, o, l });

let db: FakeDb;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = baseDb();
  // Second Monks branch so a Monks user can have several locations.
  db.locations.push({
    id: MONKS_SECOND,
    organization_id: IDS.orgMonks,
    name: "Katy",
    time_zone: "America/Chicago",
    active: true,
    archived_at: null,
    created_at: "2026-02-01T00:00:00Z",
  });
  env.db = db;
  env.userId = IDS.jack;
  env.authError = null;
  env.tableErrors = undefined;
  env.jar = new Map();
  env.sets = [];
  env.referer = null;
  env.host = "app.test";
  env.proto = null;
  env.forwardedHost = null;

  // Jack: Monks (Webster + Katy) and Liquor Tap (NASA only).
  addMembership(db, IDS.jack, IDS.orgMonks, ["server"]);
  addMembership(db, IDS.jack, IDS.orgLiquorTap, ["server"]);
  addAssignment(db, IDS.jack, WEBSTER, "staff");
  addAssignment(db, IDS.jack, MONKS_SECOND, "manager");
  addAssignment(db, IDS.jack, NASA, "manager");
});
afterEach(() => vi.restoreAllMocks());

describe("setActiveContextAction — authorization before persistence", () => {
  it("PERSIST-01/12/13: a valid selection writes the v1 cookie with the central attributes and returns a server-built destination", async () => {
    const result = await setActiveContextAction(
      pair(IDS.orgMonks, MONKS_SECOND),
    );
    expect(result).toMatchObject({
      ok: true,
      destination: `/r/the-monks?location=${MONKS_SECOND}`,
    });
    expect(env.sets).toHaveLength(1);
    expect(env.sets[0].name).toBe("lineup_active_context");
    expect(JSON.parse(env.sets[0].value)).toEqual({
      v: 1,
      o: IDS.orgMonks,
      l: MONKS_SECOND,
    });
    expect(env.sets[0].options).toEqual({
      httpOnly: true,
      secure: false, // vitest runs with NODE_ENV=test; production is covered below
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    });
    expect(env.sets[0].options).not.toHaveProperty("domain");
  });

  it("PERSIST-12: production traffic is Secure; only a non-HTTPS loopback host is exempt", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
      expect(env.sets[0].options.secure).toBe(true);
      env.sets = [];
      env.host = "localhost:3000";
      env.proto = "http";
      await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
      expect(env.sets[0].options.secure).toBe(false);
      env.sets = [];
      env.host = "the-lineup.example.com";
      env.proto = "http";
      await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
      expect(env.sets[0].options.secure).toBe(true);
      // A client-supplied X-Forwarded-Host: localhost must not switch Secure
      // off for a real Host (no forwarded proto, as a spoofing client sends).
      env.sets = [];
      env.host = "the-lineup.example.com";
      env.forwardedHost = "localhost";
      env.proto = null;
      await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
      expect(env.sets[0].options.secure).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("PERSIST-02: an unauthenticated selection never writes", async () => {
    env.userId = null;
    expect(await setActiveContextAction(pair(IDS.orgMonks, WEBSTER))).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(env.sets).toHaveLength(0);
  });

  it("PERSIST-03: an expired/revoked session never writes; an auth outage is `unavailable`, not success", async () => {
    env.userId = IDS.jack;
    env.authError = { name: "AuthApiError", status: 401 };
    expect(await setActiveContextAction(pair(IDS.orgMonks, WEBSTER))).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    env.authError = { name: "AuthRetryableFetchError", status: 503 };
    expect(await setActiveContextAction(pair(IDS.orgMonks, WEBSTER))).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(env.sets).toHaveLength(0);
  });

  it("PERSIST-04: a location that does not belong to the stated organization is denied", async () => {
    expect(await setActiveContextAction(pair(IDS.orgMonks, NASA))).toEqual({
      ok: false,
      code: "not_available",
    });
    expect(env.sets).toHaveLength(0);
  });

  it("PERSIST-05: no location assignment → denied", async () => {
    addMembership(db, IDS.sam, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.sam, NASA, "staff");
    env.userId = IDS.sam;
    expect(await setActiveContextAction(pair(NEW_ORG_B, LEAGUE))).toMatchObject(
      { ok: false, code: "not_available" },
    );
    expect(env.sets).toHaveLength(0);
  });

  it("PERSIST-06: inactive organization membership or inactive assignment → denied", async () => {
    addMembership(db, IDS.tom, IDS.orgMonks, ["server"], false);
    addAssignment(db, IDS.tom, WEBSTER, "staff");
    env.userId = IDS.tom;
    expect(
      await setActiveContextAction(pair(IDS.orgMonks, WEBSTER)),
    ).toMatchObject({ ok: false });
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, WEBSTER, "staff", false);
    env.userId = IDS.jerry;
    expect(
      await setActiveContextAction(pair(IDS.orgMonks, WEBSTER)),
    ).toMatchObject({ ok: false });
    expect(env.sets).toHaveLength(0);
  });

  it("PERSIST-07/08: inactive and archived locations are denied", async () => {
    addAssignment(db, IDS.jack, IDS.locOldKemah, "staff");
    addAssignment(db, IDS.jack, IDS.locArchived, "staff");
    for (const location of [IDS.locOldKemah, IDS.locArchived]) {
      expect(
        await setActiveContextAction(pair(IDS.orgLiquorTap, location)),
      ).toMatchObject({ ok: false, code: "not_available" });
    }
    expect(env.sets).toHaveLength(0);
  });

  it("PERSIST-09: an Overall owner without any membership can select an eligible location", async () => {
    addOverall(db, IDS.overallOwner, "owner");
    env.userId = IDS.overallOwner;
    const result = await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
    expect(result).toMatchObject({ ok: true });
    expect(JSON.parse(cookieValue()!)).toMatchObject({ l: WEBSTER });
    // ...but still only an ELIGIBLE one (inactive stays denied)
    expect(
      await setActiveContextAction(pair(IDS.orgLiquorTap, IDS.locOldKemah)),
    ).toMatchObject({ ok: false });
  });

  it("PERSIST-10/36: the persisted preference never changes the capability tier; location roles do not merge", async () => {
    // Jack is manager at Katy but staff at Webster: persisting one never leaks
    // the other's authority into the operation resolved from the cookie.
    const { resolveCurrentActiveContext } = await import(
      "@/features/context/data/active-context"
    );
    await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
    const web = await resolveCurrentActiveContext({ routeSlug: "the-monks" });
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    const katy = await resolveCurrentActiveContext({ routeSlug: "the-monks" });
    if (web.status !== "resolved" || katy.status !== "resolved") {
      throw new Error("expected resolved");
    }
    expect(web.context.locationId).toBe(WEBSTER);
    expect(katy.context.locationId).toBe(MONKS_SECOND);
    expect(web.context.access.capabilities).not.toContain("location:manage");
    expect(katy.context.access.capabilities.length).toBeGreaterThan(
      web.context.access.capabilities.length,
    );
    // forging the cookie cannot add authority: Webster stays staff-tier
    env.jar.set(ACTIVE_CONTEXT_COOKIE_NAME, cookieFor(IDS.orgMonks, WEBSTER));
    const forged = await resolveCurrentActiveContext({
      routeSlug: "the-monks",
    });
    if (forged.status !== "resolved") throw new Error("expected resolved");
    expect(forged.context.access.capabilities).toEqual(
      web.context.access.capabilities,
    );
  });

  it("strict input schema: malformed, extra or non-UUID input never reaches the database or the cookie", async () => {
    for (const input of [
      null,
      undefined,
      "x",
      [],
      {},
      { organizationId: IDS.orgMonks },
      { organizationId: "nope", locationId: WEBSTER },
      {
        organizationId: IDS.orgMonks,
        locationId: WEBSTER,
        domain: "evil.test",
      },
      { organizationId: IDS.orgMonks, locationId: WEBSTER, tab: "../x" },
      { organizationId: [IDS.orgMonks], locationId: WEBSTER },
    ]) {
      expect(await setActiveContextAction(input)).toEqual({
        ok: false,
        code: "invalid_request",
      });
    }
    expect(env.sets).toHaveLength(0);
  });

  it("a failed selection never overwrites (or clears) a previously valid cookie", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
    const before = cookieValue();
    env.sets = [];
    // unauthorized target, query failure and auth failure
    expect(
      await setActiveContextAction(pair(IDS.orgMonks, NASA)),
    ).toMatchObject({ ok: false });
    env.tableErrors = { locations: { message: "boom" } };
    expect(
      await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND)),
    ).toEqual({ ok: false, code: "unavailable" });
    expect(env.sets).toHaveLength(0);
    expect(cookieValue()).toBe(before);
  });

  it("denial reasons do not distinguish an unknown tenant from an unauthorized one", async () => {
    const unknown = await setActiveContextAction(
      pair("99999999-9999-4999-8999-999999999999", WEBSTER),
    );
    const foreign = await setActiveContextAction(pair(IDS.orgMonks, LEAGUE));
    expect(unknown).toEqual(foreign);
  });

  it("the destination carries only a validated `tab` and is never derived from input paths", async () => {
    const result = await setActiveContextAction({
      ...pair(IDS.orgMonks, WEBSTER),
      tab: "schedule",
    });
    expect(result).toMatchObject({
      destination: `/r/the-monks?tab=schedule&location=${WEBSTER}`,
    });
  });
});

describe("persisted context drives operational actions (no Referer)", () => {
  it("PERSIST-14/15/16/27: the selected Location B is used with no Referer, across repeated requests", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    for (let i = 0; i < 3; i += 1) {
      expect(await getPrimaryLocation(IDS.orgMonks)).toEqual({
        id: MONKS_SECOND,
        time_zone: "America/Chicago",
      });
    }
  });

  it("PERSIST-21: cross-organization switching updates the persisted context and actions follow it", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    expect(await getPrimaryLocation(IDS.orgLiquorTap)).toBeNull(); // Monks cookie ≠ Liquor Tap
    await setActiveContextAction(pair(IDS.orgLiquorTap, NASA));
    expect(await getPrimaryLocation(IDS.orgLiquorTap)).toEqual({
      id: NASA,
      time_zone: "America/Chicago",
    });
    // back in Monks requires a new verified selection — never inferred
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("PERSIST-22/28: a malformed or unsupported-version cookie refuses the operation", async () => {
    for (const bad of [
      "garbage",
      JSON.stringify({ v: 2, o: IDS.orgMonks, l: WEBSTER }),
      JSON.stringify({ v: 1, o: "x", l: WEBSTER }),
    ]) {
      env.jar.set(ACTIVE_CONTEXT_COOKIE_NAME, bad);
      expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
    }
  });

  it("PERSIST-23: a stale cookie (unknown / foreign location) fails closed — no oldest-location fallback", async () => {
    env.jar.set(
      ACTIVE_CONTEXT_COOKIE_NAME,
      cookieFor(IDS.orgMonks, "99999999-9999-4999-8999-999999999999"),
    );
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
    env.jar.set(ACTIVE_CONTEXT_COOKIE_NAME, cookieFor(IDS.orgMonks, NASA));
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("PERSIST-24: revoking the assignment invalidates the preference on the very next request", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    expect(await getPrimaryLocation(IDS.orgMonks)).toMatchObject({
      id: MONKS_SECOND,
    });
    for (const row of db.location_memberships) {
      if (row.location_id === MONKS_SECOND) row.active = false;
    }
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
    // location deactivated / archived / membership revoked behave the same
    for (const row of db.location_memberships) row.active = true;
    expect(await getPrimaryLocation(IDS.orgMonks)).toMatchObject({
      id: MONKS_SECOND,
    });
    db.locations.find((l) => l.id === MONKS_SECOND)!.archived_at = "2026-11-01";
    db.locations.find((l) => l.id === MONKS_SECOND)!.active = false;
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
    db.locations.find((l) => l.id === MONKS_SECOND)!.archived_at = null;
    db.locations.find((l) => l.id === MONKS_SECOND)!.active = true;
    for (const row of db.memberships) {
      if (row.organization_id === IDS.orgMonks) row.active = false;
    }
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("PERSIST-30: a database query failure is a denial, never a successful fallback", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    for (const table of ["locations", "memberships", "location_memberships"]) {
      env.tableErrors = { [table]: { message: "down" } };
      expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
    }
    env.tableErrors = undefined;
    env.authError = { name: "AuthRetryableFetchError", status: 503 };
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("PERSIST-25/26: no cookie → selection is required for several locations; a sole location needs no cookie", async () => {
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull(); // Webster + Katy
    expect(await getPrimaryLocation(IDS.orgLiquorTap)).toMatchObject({
      id: NASA,
    }); // sole in Liquor Tap even though Jack has other orgs
    expect(env.sets).toHaveLength(0); // reads never write cookies
  });

  it("PERSIST-20/32: a workspace URL naming a different location than the persisted one is refused (back/forward, stale tab, un-reconciled deep link)", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    env.referer = `https://app.test/r/the-monks?location=${WEBSTER}`;
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
    env.referer = `https://app.test/r/the-monks?location=${MONKS_SECOND}`;
    expect(await getPrimaryLocation(IDS.orgMonks)).toMatchObject({
      id: MONKS_SECOND,
    });
    // the explicit-but-unauthorized URL can never be used to operate
    env.referer = `https://app.test/r/the-monks?location=${LEAGUE}`;
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("PERSIST-19: reconciling an explicit selection replaces the cookie only after validation", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
    expect(
      await setActiveContextAction(pair(IDS.orgMonks, LEAGUE)),
    ).toMatchObject({ ok: false });
    expect(JSON.parse(cookieValue()!).l).toBe(WEBSTER);
    expect(
      await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND)),
    ).toMatchObject({ ok: true });
    expect(JSON.parse(cookieValue()!).l).toBe(MONKS_SECOND);
  });
});

describe("clearActiveContextAction and sign-out", () => {
  it("clears with the same scope/attributes and grants nothing (no implicit selection)", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, WEBSTER));
    env.sets = [];
    expect(await clearActiveContextAction()).toEqual({ ok: true });
    expect(cookieValue()).toBeNull();
    expect(env.sets[0].options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    // several Monks locations → still ambiguous, not "the first one"
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("an unauthenticated caller cannot clear (or otherwise touch) the cookie", async () => {
    env.jar.set(ACTIVE_CONTEXT_COOKIE_NAME, cookieFor(IDS.orgMonks, WEBSTER));
    env.userId = null;
    expect(await clearActiveContextAction()).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(env.sets).toHaveLength(0);
    expect(cookieValue()).not.toBeNull();
  });

  it("PERSIST-17/18/35: sign-out expires the context cookie, so the next user on a shared device inherits nothing", async () => {
    // Employee A (Jack) works at Katy, then signs out.
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    const response = await signOutRoute();
    expect(response.status).toBe(200);
    expect(cookieValue()).toBeNull();
    // Employee B (Jerry, who is also authorized for Webster) has a fresh slate.
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, WEBSTER, "staff");
    addAssignment(db, IDS.jerry, MONKS_SECOND, "staff");
    env.userId = IDS.jerry;
    expect(await getPrimaryLocation(IDS.orgMonks)).toBeNull();
  });

  it("sign-out clears the cookie even when ending the session fails, and reports it without leaking details", async () => {
    await setActiveContextAction(pair(IDS.orgMonks, MONKS_SECOND));
    env.authError = null;
    const supabaseServer = await import("@/lib/supabase/server");
    const spy = vi
      .spyOn(supabaseServer, "createClient")
      .mockRejectedValueOnce(new Error("secret-token-abc"));
    const response = await signOutRoute();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(cookieValue()).toBeNull();
    spy.mockRestore();
  });
});
