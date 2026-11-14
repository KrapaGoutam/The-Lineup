import { test, expect } from "@playwright/test";
import { randomUUID, randomInt, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

test("Ravi-style PIN-only login reaches picker, then a verified workspace", async ({
  page,
  context,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Local fixtures only");
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = randomUUID();
  const pin = String(randomInt(10000)).padStart(4, "0");
  const hmac = (s: string) =>
    createHmac("sha256", process.env.APP_PIN_PEPPER!).update(s).digest("hex");
  let profileId: string | undefined;
  let orgId: string | undefined;
  function check(error: { message: string } | null) {
    if (error) throw new Error(error.message);
  }
  try {
    const created = await admin.auth.admin.createUser({
      email: `${run}@b5-browser.invalid`,
      password: randomUUID(),
      email_confirm: true,
    });
    check(created.error);
    profileId = created.data.user!.id;
    check(
      (
        await admin
          .from("profiles")
          .insert({ id: profileId, display_name: "Ravi B5 Local" })
      ).error,
    );
    check(
      (
        await admin.auth.admin.updateUserById(profileId, {
          password: hmac(`authpw:person:${profileId}:${pin}`),
        })
      ).error,
    );
    const org = await admin
      .from("organizations")
      .insert({
        name: `B5 Browser ${run}`,
        slug: `b5-browser-${run}`,
        created_by: profileId,
      })
      .select("id")
      .single();
    check(org.error);
    orgId = org.data!.id;
    check(
      (
        await admin.from("memberships").insert({
          organization_id: orgId,
          profile_id: profileId,
          roles: ["general_manager"],
        })
      ).error,
    );
    check(
      (
        await admin.from("passcode_credentials").insert({
          organization_id: orgId,
          profile_id: profileId,
          locator: hmac(`${orgId}:${pin}`),
          synthetic_email: created.data.user!.email,
        })
      ).error,
    );
    const locations = await admin
      .from("locations")
      .insert(
        ["Downtown", "Riverside"].map((name) => ({
          organization_id: orgId,
          name,
          time_zone: "America/Chicago",
        })),
      )
      .select("id, name");
    check(locations.error);
    check(
      (
        await admin.from("location_memberships").insert(
          locations.data!.map((l) => ({
            location_id: l.id,
            profile_id: profileId,
            role: "manager",
          })),
        )
      ).error,
    );
    const op = await admin.rpc("begin_personal_pin_change", {
      p_profile_id: profileId,
      p_locator: hmac(`global-pin:v1:${pin}`),
      p_actor_profile_id: profileId,
      p_synthetic_email: created.data.user!.email,
    });
    check(op.error);
    check(
      (
        await admin.rpc("finish_personal_pin_change", {
          p_profile_id: profileId,
          p_operation_id: op.data,
          p_apply: true,
        })
      ).error,
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Enter your 4-digit PIN" }),
    ).toBeVisible();
    await expect(page.getByText("Ravi B5 Local")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Not registered? Create an account" }),
    ).toHaveCount(0);
    const input = page.getByLabel("Personal PIN");
    await expect(input).toHaveAttribute("type", "password");
    await input.fill(pin); // fourth digit submits automatically
    await expect(
      page.getByRole("heading", { name: "Choose a location" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Signing in as/)).toHaveCount(0);
    expect(
      (await context.cookies()).some((c) => c.name.includes("auth-token")),
    ).toBe(true);
    const target = locations.data!.find((l) => l.name === "Riverside")!;
    await page.getByRole("button", { name: "Riverside", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`location=${target.id}`), {
      timeout: 30_000,
    });
    await expect(page.getByTestId("context-unavailable")).toHaveCount(0);
    await expect(page.getByText(/Signing in as/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Riverside/ }).first(),
    ).toBeVisible();
  } finally {
    // Scope cleanup strictly to this test's synthetic identities and tenant.
    if (orgId)
      check((await admin.from("organizations").delete().eq("id", orgId)).error);
    if (profileId) check((await admin.auth.admin.deleteUser(profileId)).error);
  }
});
