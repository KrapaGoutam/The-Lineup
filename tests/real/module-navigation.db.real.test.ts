import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNavigationFixture } from "./support/module-navigation-fixture";
import { readLocationModuleConfigs } from "@/features/modules/data/module-config-reader";
import {
  moduleNavigationPolicy,
  serializeModuleNavigation,
} from "@/features/modules/domain/module-navigation";
import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import type { Database } from "@/types/database.generated";
import type { SupabaseClient } from "@supabase/supabase-js";

let fixture: Awaited<ReturnType<typeof createNavigationFixture>>;
beforeAll(async () => {
  fixture = await createNavigationFixture();
});
afterAll(async () => {
  await fixture?.teardown();
});
describe("navigation against actual DEV configuration and JWTs", () => {
  it.each([
    ["A", ["tasks", "allocation", "barInventory", "settings"]],
    ["B", ["tasks", "recipes", "settings"]],
    ["C", ["settings"]],
    ["Missing", ["settings"]],
    ["Disabled", ["settings"]],
  ])(
    "reads persisted %s configuration only after verified active context",
    async (name, expected) => {
      const client = fixture.users.owner.client as SupabaseClient<Database>;
      const resolution = await resolveCurrentActiveContext({
        routeSlug: name === "C" ? `${fixture.slug}-b` : fixture.slug,
        explicitSelection: {
          status: "present",
          locationId: fixture.locations[name as string],
        },
        cookieValue: null,
        client,
      });
      expect(resolution.status).toBe("resolved");
      if (resolution.status !== "resolved")
        throw new Error("Fixture context unavailable");
      const context = resolution.context;
      const result = await readLocationModuleConfigs(
        context.locationId,
        client,
      );
      expect(result.status).toBe("ok");
      const identity = {
        profileId: context.profileId,
        organizationId: context.organizationId,
        locationId: context.locationId,
      };
      expect(
        moduleNavigationPolicy(
          serializeModuleNavigation(identity, result),
          identity,
          { isManager: true, demoMode: false },
        ).tabs,
      ).toEqual(expected);
    },
  );
  it("staff JWT cannot use another organization's location", async () => {
    const resolution = await resolveCurrentActiveContext({
      routeSlug: `${fixture.slug}-b`,
      explicitSelection: { status: "present", locationId: fixture.locations.C },
      cookieValue: null,
      client: fixture.users.staff.client as SupabaseClient<Database>,
    });
    expect(resolution.status).not.toBe("resolved");
  });
  it.each(["Inactive", "Archived"])(
    "%s cannot resolve as an operational workspace",
    async (name) => {
      const resolution = await resolveCurrentActiveContext({
        routeSlug: fixture.slug,
        explicitSelection: {
          status: "present",
          locationId: fixture.locations[name],
        },
        cookieValue: null,
        client: fixture.users.owner.client as SupabaseClient<Database>,
      });
      expect(resolution.status).toBe("invalid_context");
      const result = await readLocationModuleConfigs(
        fixture.locations[name],
        fixture.users.owner.client as SupabaseClient<Database>,
      );
      const identity = {
        profileId: fixture.users.owner.id,
        organizationId: fixture.orgIds[0],
        locationId: fixture.locations[name],
      };
      expect(
        moduleNavigationPolicy(
          serializeModuleNavigation(identity, result),
          identity,
          { isManager: true, demoMode: false },
        ).tabs,
      ).toEqual(["settings"]);
    },
  );
  it("enabled Inventory never grants staff management", async () => {
    const result = await readLocationModuleConfigs(
      fixture.locations.A,
      fixture.users.staff.client as SupabaseClient<Database>,
    );
    const identity = {
      profileId: fixture.users.staff.id,
      organizationId: fixture.orgIds[0],
      locationId: fixture.locations.A,
    };
    const policy = moduleNavigationPolicy(
      serializeModuleNavigation(identity, result),
      identity,
      { isManager: false, demoMode: false },
    );
    expect(policy.tabs).toEqual(["tasks", "allocation", "settings"]);
  });
});
