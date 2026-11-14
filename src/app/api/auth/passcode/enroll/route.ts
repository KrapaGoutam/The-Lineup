import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPasscode } from "@/features/auth/data/passcode-verify";
import {
  reservePinAttempt,
  rotateGlobalPersonalPin,
  PIN_IN_USE,
} from "@/features/auth/data/global-pin";

const schema = z.object({
  currentPasscode: z.string().regex(/^\d{4}$/),
  newPasscode: z.string().regex(/^\d{4}$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter your current and new four-digit PINs." },
      { status: 400 },
    );
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    return NextResponse.json(
      { error: "Please sign in using your existing restaurant link first." },
      { status: 401 },
    );
  const admin = createAdminClient();
  const reservation = await reservePinAttempt(admin, request, "enroll");
  if (reservation.response) return reservation.response;
  const { data: credentials, error: credentialError } = await admin
    .from("passcode_credentials")
    .select("organization_id, synthetic_email")
    .eq("profile_id", user.id)
    .eq("active", true);
  if (credentialError || !credentials?.length)
    return NextResponse.json(
      { error: "PIN service unavailable. Please contact your manager." },
      { status: 503 },
    );
  // Same canonical person in every credential; no user-selected account/tenant.
  // A pre-B3 Auth password may still be derived from ANY membership's org.
  // Verify the exact signed-in person, never select a workspace from this list.
  let verified = false;
  for (const credential of credentials) {
    const result = await verifyPasscode(supabase, {
      profileId: user.id,
      syntheticEmail: credential.synthetic_email,
      organizationId: credential.organization_id,
      passcode: parsed.data.currentPasscode,
    });
    if (result.ok) {
      verified = true;
      break;
    }
  }
  if (!verified)
    return NextResponse.json(
      { error: "Current PIN not recognized." },
      { status: 401 },
    );
  const result = await rotateGlobalPersonalPin(admin, {
    profileId: user.id,
    newPasscode: parsed.data.newPasscode,
    currentPasscode: parsed.data.currentPasscode,
  });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.error === PIN_IN_USE ? 409 : 503 },
    );
  return NextResponse.json({ next: "/" });
}
