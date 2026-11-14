import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import {
  createClient,
  AuthApiError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.generated";
import {
  createAuthPassword,
  createGlobalPasscodeLocator,
  createPasscodeLocator,
  createPersonAuthPassword,
  createRequestFingerprint,
} from "@/lib/passcode-security";
import {
  beginPersonalPinChange,
  finishPersonalPinChange,
  readPersonalPinAccount,
  rotateGlobalPersonalPin,
  PIN_IN_USE,
} from "@/features/auth/data/global-pin";
import { POST as login } from "@/app/api/auth/passcode/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as enroll } from "@/app/api/auth/passcode/enroll/route";
import { loadPageData } from "@/lib/page-data";

// Request-local cookie adapter exercises the real SSR cookie writer and GoTrue.
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const status = execFileSync("npx.cmd", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
  shell: true,
  stdio: ["ignore", "pipe", "ignore"],
});
const pick = (key: string) =>
  status.match(new RegExp(`^${key}="?([^"\\r\\n]+)`, "m"))?.[1] ?? "";
const url = pick("API_URL");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("B5 tests refuse non-local Supabase.");
const pub = pick("PUBLISHABLE_KEY") || pick("ANON_KEY");
const secret = pick("SECRET_KEY") || pick("SERVICE_ROLE_KEY");
function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
): NonNullable<R["data"]> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Missing fixture data");
  return result.data as NonNullable<R["data"]>;
}

describe("B5 universal identity boundary (local Auth + PostgreSQL)", () => {
  const run = randomUUID();
  const users: string[] = [];
  const orgs: string[] = [];
  const fingerprints: string[] = [];
  const pins = new Set<string>();
  let admin: SupabaseClient<Database>;
  let creator: string;
  let orgA: string;
  let orgB: string;
  let requestCounter = 0;
  const pin = () => {
    let p: string;
    do {
      p = String(randomInt(10000)).padStart(4, "0");
    } while (pins.has(p));
    pins.add(p);
    return p;
  };
  function request(path: string, body: unknown) {
    // Distinct synthetic clients belong to distinct test scenarios, not an
    // exemption from quotas. The limiter test below exercises one real quota.
    const client = `${run}-${++requestCounter}`;
    fingerprints.push(createRequestFingerprint(`personal-pin:${client}`));
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": client,
      },
      body: JSON.stringify(body),
    });
  }
  async function person(p: string, org: string, canonical = true) {
    const email = `${randomUUID()}@b5-harness.invalid`;
    const user = must(
      await admin.auth.admin.createUser({
        email,
        password: randomUUID(),
        email_confirm: true,
      }),
    ).user!;
    users.push(user.id);
    must(
      await admin
        .from("profiles")
        .insert({ id: user.id, display_name: `B5 ${run}` })
        .select()
        .single(),
    );
    must(
      await admin
        .from("memberships")
        .insert({
          organization_id: org,
          profile_id: user.id,
          roles: ["server"],
        })
        .select()
        .single(),
    );
    must(
      await admin
        .from("passcode_credentials")
        .insert({
          organization_id: org,
          profile_id: user.id,
          locator: createPasscodeLocator(org, p),
          synthetic_email: email,
        })
        .select()
        .single(),
    );
    must(
      await admin.auth.admin.updateUserById(user.id, {
        password: canonical
          ? createPersonAuthPassword(user.id, p)
          : createAuthPassword(org, p),
      }),
    );
    return user;
  }
  async function publish(profileId: string, p: string) {
    const op = await beginPersonalPinChange(admin, profileId, p);
    if (!op.ok) throw new Error(op.error);
    await finishPersonalPinChange(admin, profileId, op.operationId, true);
  }
  beforeAll(async () => {
    process.env.APP_PIN_PEPPER = "b5-test-only-pepper-at-least-32-characters";
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = pub;
    process.env.SUPABASE_SECRET_KEY = secret;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    admin = createClient<Database>(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    creator = must(
      await admin.auth.admin.createUser({
        email: `${run}@b5-harness.invalid`,
        password: randomUUID(),
        email_confirm: true,
      }),
    ).user!.id;
    users.push(creator);
    must(
      await admin
        .from("profiles")
        .insert({ id: creator, display_name: `B5 ${run}` })
        .select()
        .single(),
    );
    for (const suffix of ["a", "b"])
      orgs.push(
        must(
          await admin
            .from("organizations")
            .insert({
              name: `B5 ${suffix} ${run}`,
              slug: `b5-${suffix}-${run}`,
              created_by: creator,
            })
            .select("id")
            .single(),
        ).id,
      );
    [orgA, orgB] = orgs;
  });
  afterAll(async () => {
    cookieJar.clear();
    // Remove only this run's synthetic fixtures; never clear real limiter state.
    if (fingerprints.length) {
      const result = await admin
        .from("global_pin_attempts")
        .delete()
        .in("fingerprint", fingerprints);
      expect(result.error).toBeNull();
    }
    for (const id of orgs)
      expect(
        (await admin.from("organizations").delete().eq("id", id)).error,
      ).toBeNull();
    for (const id of users.reverse())
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    vi.unstubAllEnvs();
  });

  it("concurrent global claim has one winner; claims are inaccessible to clients", async () => {
    const p = pin();
    const a = await person(p, orgA);
    const b = await person(p, orgB);
    const results = await Promise.all([
      beginPersonalPinChange(admin, a.id, p),
      beginPersonalPinChange(admin, b.id, p),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, error: PIN_IN_USE, code: "global_collision" },
    ]);
    const client = createClient<Database>(url, pub, {
      auth: { persistSession: false },
    });
    expect(
      (await client.from("personal_pin_claims").select()).error,
    ).not.toBeNull();
    expect(
      (
        await client.rpc("begin_personal_pin_change", {
          p_profile_id: b.id,
          p_locator: createGlobalPasscodeLocator(pin()),
          p_actor_profile_id: b.id,
          p_synthetic_email: b.email!,
        })
      ).error,
    ).not.toBeNull();
  });

  it("PIN-only session binds exact profile; root routes single / many / zero eligible contexts", async () => {
    cookieJar.clear();
    const p = pin();
    const user = await person(p, orgA);
    await publish(user.id, p);
    const response = await login(
      request("/api/auth/passcode", { passcode: p }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: "/" });
    expect([...cookieJar.keys()].some((k) => k.includes("auth-token"))).toBe(
      true,
    );
    expect(
      (await loadPageData("", undefined, { globalEntry: true })).contextStatus,
    ).toBe("no_access");
    const location = must(
      await admin
        .from("locations")
        .insert({
          organization_id: orgA,
          name: `Downtown ${run}`,
          time_zone: "America/Chicago",
        })
        .select()
        .single(),
    );
    must(
      await admin
        .from("location_memberships")
        .insert({
          location_id: location.id,
          profile_id: user.id,
          role: "manager",
        })
        .select()
        .single(),
    );
    const single = await loadPageData("", undefined, { globalEntry: true });
    expect(single.redirectTo).toContain(location.id);
    expect(single.initialUser).toBeNull();
    const second = must(
      await admin
        .from("locations")
        .insert({
          organization_id: orgA,
          name: `Riverside ${run}`,
          time_zone: "America/Chicago",
        })
        .select()
        .single(),
    );
    must(
      await admin
        .from("location_memberships")
        .insert({
          location_id: second.id,
          profile_id: user.id,
          role: "manager",
        })
        .select()
        .single(),
    );
    const many = await loadPageData("", undefined, { globalEntry: true });
    expect(many.contextStatus).toBe("selection_required");
    expect(many.availableContexts).toHaveLength(2);
    expect(many.scheduleContext).toBeNull();
    expect(many.initialUser).toBeNull();
    expect(
      (await login(request("/api/auth/passcode", { passcode: pin() }))).status,
    ).toBe(401);
  });

  it("legacy proof enrolls without a duplicate identity; collision forces a controlled change", async () => {
    const p = pin();
    const a = await person(p, orgA);
    const b = await person(p, orgB, false);
    await publish(a.id, p);
    cookieJar.clear();
    const response = await login(
      request("/api/auth/passcode", {
        restaurantSlug: `b5-b-${run}`,
        passcode: p,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).next).toBe("/auth/enroll");
    expect(await readPersonalPinAccount(admin, b.id)).toBeNull();
    const newPin = pin();
    const change = await enroll(
      request("/api/auth/passcode/enroll", {
        currentPasscode: p,
        newPasscode: newPin,
      }),
    );
    expect(change.status).toBe(200);
    expect((await readPersonalPinAccount(admin, b.id))?.locator).toBe(
      createGlobalPasscodeLocator(newPin),
    );
    cookieJar.clear();
    expect(
      (await login(request("/api/auth/passcode", { passcode: newPin }))).status,
    ).toBe(200);
    const ownPin = pin();
    const legacy = await person(ownPin, orgB, false);
    cookieJar.clear();
    expect(
      (
        await login(
          request("/api/auth/passcode", {
            restaurantSlug: `b5-b-${run}`,
            passcode: ownPin,
          }),
        )
      ).status,
    ).toBe(200);
    expect((await readPersonalPinAccount(admin, legacy.id))?.locator).toBe(
      createGlobalPasscodeLocator(ownPin),
    );
  });

  it("registration rejects global collisions and provisions a usable global PIN", async () => {
    const p = pin();
    const owner = await person(p, orgA);
    await publish(owner.id, p);
    const body = {
      restaurantSlug: `b5-b-${run}`,
      displayName: `B5 ${run}`,
      contact: "",
      passcode: p,
    };
    const collision = await register(request("/api/auth/register", body));
    expect(collision.status).toBe(409);
    expect((await collision.json()).error).toBe(PIN_IN_USE);
    const fresh = pin();
    const response = await register(
      request("/api/auth/register", { ...body, passcode: fresh }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    users.push(payload.user.profileId);
    expect(
      (await readPersonalPinAccount(admin, payload.user.profileId))?.locator,
    ).toBe(createGlobalPasscodeLocator(fresh));
    cookieJar.clear();
    expect(
      (await login(request("/api/auth/passcode", { passcode: fresh }))).status,
    ).toBe(200);
  });

  it("multi-org rotation moves all locators, releases old ownership only after Auth success", async () => {
    const p = pin();
    const user = await person(p, orgA);
    await publish(user.id, p);
    must(
      await admin
        .from("memberships")
        .insert({
          organization_id: orgB,
          profile_id: user.id,
          roles: ["server"],
        })
        .select()
        .single(),
    );
    must(
      await admin
        .from("passcode_credentials")
        .insert({
          organization_id: orgB,
          profile_id: user.id,
          locator: createPasscodeLocator(orgB, p),
          synthetic_email: user.email!,
        })
        .select()
        .single(),
    );
    const next = pin();
    expect(
      await rotateGlobalPersonalPin(admin, {
        profileId: user.id,
        newPasscode: next,
      }),
    ).toEqual({ ok: true });
    const rows = must(
      await admin
        .from("passcode_credentials")
        .select("organization_id, locator")
        .eq("profile_id", user.id),
    );
    expect(
      rows.every(
        (r) => r.locator === createPasscodeLocator(r.organization_id, next),
      ),
    ).toBe(true);
    expect(
      must(
        await admin
          .from("personal_pin_claims")
          .select()
          .eq("profile_id", user.id),
      ),
    ).toHaveLength(1);
    cookieJar.clear();
    expect(
      (await login(request("/api/auth/passcode", { passcode: p }))).status,
    ).toBe(401);
    expect(
      (await login(request("/api/auth/passcode", { passcode: next }))).status,
    ).toBe(200);
  });

  it("interrupted lifecycle keeps both claims, denies parallel change and both personal login paths", async () => {
    const p = pin();
    const user = await person(p, orgA);
    await publish(user.id, p);
    const next = pin();
    const op = await beginPersonalPinChange(admin, user.id, next);
    expect(op.ok).toBe(true);
    expect((await beginPersonalPinChange(admin, user.id, pin())).ok).toBe(
      false,
    );
    expect(
      must(
        await admin
          .from("personal_pin_claims")
          .select()
          .eq("profile_id", user.id),
      ),
    ).toHaveLength(2);
    cookieJar.clear();
    expect(
      (await login(request("/api/auth/passcode", { passcode: p }))).status,
    ).toBe(401);
    expect(
      (
        await login(
          request("/api/auth/passcode", {
            restaurantSlug: `b5-a-${run}`,
            passcode: p,
          }),
        )
      ).status,
    ).toBe(401);
    if (op.ok)
      await finishPersonalPinChange(admin, user.id, op.operationId, false); // No Auth mutation was attempted.
    expect(
      (await login(request("/api/auth/passcode", { passcode: p }))).status,
    ).toBe(200);
  });

  it("durable limiter admits at most eight concurrent attempts for one client", async () => {
    const fingerprint = createRequestFingerprint(run);
    fingerprints.push(fingerprint);
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        admin.rpc("reserve_global_pin_attempt", {
          p_fingerprint: fingerprint,
          p_purpose: "login",
        }),
      ),
    );
    expect(results.every((r) => !r.error)).toBe(true);
    expect(results.filter((r) => r.data)).toHaveLength(8);
  });

  it("platform failure pressure tightens unknown clients without locking established clients", async () => {
    const source = createRequestFingerprint(`${run}:pressure`);
    const established = createRequestFingerprint(`${run}:known`);
    const fresh = createRequestFingerprint(`${run}:new`);
    fingerprints.push(source, established, fresh);
    must(
      await admin
        .from("global_pin_attempts")
        .insert([
          ...Array.from({ length: 100 }, () => ({
            fingerprint: source,
            purpose: "login",
            succeeded: false,
          })),
          { fingerprint: established, purpose: "login", succeeded: true },
        ])
        .select(),
    );
    const unknown = await Promise.all(
      Array.from({ length: 3 }, () =>
        admin.rpc("reserve_global_pin_attempt", {
          p_fingerprint: fresh,
          p_purpose: "login",
        }),
      ),
    );
    const known = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.rpc("reserve_global_pin_attempt", {
          p_fingerprint: established,
          p_purpose: "login",
        }),
      ),
    );
    expect(unknown.filter((r) => r.data)).toHaveLength(2);
    expect(known.filter((r) => r.data)).toHaveLength(8);
  });

  it("Auth failure compensation restores ownership; ambiguous outcome stays blocked", async () => {
    const p = pin();
    const user = await person(p, orgA);
    await publish(user.id, p);
    const update = vi
      .spyOn(admin.auth.admin, "updateUserById")
      .mockResolvedValue({
        data: { user: null },
        error: new AuthApiError(
          "local simulated timeout",
          503,
          "unexpected_failure",
        ),
      });
    try {
      const failed = await rotateGlobalPersonalPin(admin, {
        profileId: user.id,
        newPasscode: pin(),
      });
      expect(failed).toMatchObject({ ok: false, severity: "recoverable" });
      expect((await readPersonalPinAccount(admin, user.id))?.locator).toBe(
        createGlobalPasscodeLocator(p),
      );
      expect(
        (await readPersonalPinAccount(admin, user.id))?.operation_id,
      ).toBeNull();
      const uncertain = await rotateGlobalPersonalPin(admin, {
        profileId: user.id,
        newPasscode: pin(),
        authProber: async () => ({ ok: false }),
      });
      expect(uncertain).toMatchObject({ ok: false, severity: "locked_out" });
      expect(
        (await readPersonalPinAccount(admin, user.id))?.operation_id,
      ).not.toBeNull();
      expect(
        must(
          await admin
            .from("personal_pin_claims")
            .select()
            .eq("profile_id", user.id),
        ),
      ).toHaveLength(2);
    } finally {
      update.mockRestore();
    }
  });
  it("organization-local collision routes legacy identity to enrollment; replacement conflicts are 409", async () => {
    const p = pin();
    const target = await person(p, orgA);
    await person(p, orgB); // Unenrolled person's organization-local ownership.
    must(
      await admin
        .from("memberships")
        .insert({
          organization_id: orgB,
          profile_id: target.id,
          roles: ["server"],
        })
        .select()
        .single(),
    );
    must(
      await admin
        .from("passcode_credentials")
        .insert({
          organization_id: orgB,
          profile_id: target.id,
          locator: createPasscodeLocator(orgB, pin()),
          synthetic_email: target.email!,
        })
        .select()
        .single(),
    );
    cookieJar.clear();
    const response = await login(
      request("/api/auth/passcode", {
        restaurantSlug: `b5-a-${run}`,
        passcode: p,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).next).toBe("/auth/enroll");
    const conflict = await enroll(
      request("/api/auth/passcode/enroll", {
        currentPasscode: p,
        newPasscode: p,
      }),
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe(PIN_IN_USE);
    expect(
      (
        await enroll(
          request("/api/auth/passcode/enroll", {
            currentPasscode: p,
            newPasscode: pin(),
          }),
        )
      ).status,
    ).toBe(200);
  });
});
