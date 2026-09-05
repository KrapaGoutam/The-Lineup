import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  isValidPasscode,
  normalizeDatabaseRole,
} from "@/features/auth/domain/passcode";
import {
  isValidContact,
  isValidDisplayName,
} from "@/features/auth/domain/registration";
import { createPasscodeLocator } from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const registerSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(120),
  displayName: z
    .string()
    .refine(
      isValidDisplayName,
      "Enter the name your manager will know you by.",
    ),
  contact: z
    .string()
    .refine(
      isValidContact,
      "Enter a phone number or email so you can be reached.",
    ),
  passcode: z.string(),
});

const GENERIC_ERROR = "Unable to create your account. Please try again.";

/**
 * Self-serve registration (Feature 005). A new person is provisioned and
 * signed in immediately — no manager approval step. New accounts always
 * get roles: ['server'], enforced here, not by a DB constraint (same
 * service-role trust boundary already used by /api/auth/passcode).
 *
 * A losing passcode-collision race is caught by the `passcode_credentials`
 * unique (organization_id, locator) constraint, not a separate pre-check —
 * on that failure the Auth user just created is deleted so no orphaned
 * account is left active.
 */
export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Complete all fields." },
      { status: 400 },
    );
  }

  const { displayName, contact, passcode } = parsed.data;
  const slug = parsed.data.restaurantSlug.trim().toLowerCase();
  if (!isValidPasscode(passcode)) {
    return NextResponse.json(
      { error: "Choose a 4-digit passcode." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!organization) {
    return NextResponse.json(
      { error: "Restaurant not found." },
      { status: 404 },
    );
  }

  const locator = createPasscodeLocator(organization.id, passcode);
  const syntheticEmail = `${randomUUID()}@passcode.internal`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: passcode,
      email_confirm: true,
    });
  if (createError || !created.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
  const userId = created.user.id;
  const rollback = () => admin.auth.admin.deleteUser(userId);

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: userId, display_name: displayName });
  if (profileError) {
    await rollback();
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  const { error: membershipError } = await admin.from("memberships").insert({
    organization_id: organization.id,
    profile_id: userId,
    roles: ["server"],
    active: true,
  });
  if (membershipError) {
    await rollback();
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  const { error: credentialError } = await admin
    .from("passcode_credentials")
    .insert({
      organization_id: organization.id,
      profile_id: userId,
      locator,
      synthetic_email: syntheticEmail,
      active: true,
    });
  if (credentialError) {
    await rollback();
    if (credentialError.code === "23505") {
      return NextResponse.json(
        { error: "That passcode is already in use — choose a different one." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  await admin.from("registrations").insert({
    organization_id: organization.id,
    display_name: displayName,
    contact,
    status: "approved",
    profile_id: userId,
    self_served: true,
  });

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: passcode,
  });
  if (signInError) {
    return NextResponse.json(
      {
        error:
          "Your account was created, but sign-in failed. Try signing in with your new passcode.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user: {
      profileId: userId,
      name: displayName,
      role: normalizeDatabaseRole(["server"]),
    },
  });
}
