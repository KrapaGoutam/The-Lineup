import { NextResponse } from "next/server";

import { reactivateMember } from "@/features/auth/data/member-deactivation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

type ReactivateBody = {
  restaurantSlug?: string;
  targetProfileId?: string;
  reason?: string;
};

/**
 * Organization-scoped reactivation. The database RPC preserves unrelated
 * organization access and never changes a global Auth ban.
 */
export async function POST(request: Request) {
  let body: ReactivateBody;
  try {
    body = (await request.json()) as ReactivateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = body.restaurantSlug?.trim().toLowerCase();
  const targetProfileId = body.targetProfileId?.trim();
  const reason = body.reason?.trim() ?? "";

  if (!slug || !targetProfileId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json(
      { error: "Enter a short reason (at least 3 characters)." },
      { status: 400 },
    );
  }

  const actor = await getCurrentUser(slug);
  if (!actor) {
    return NextResponse.json(
      { error: "Not signed in.", sessionInvalid: true },
      { status: 401 },
    );
  }

  if (actor.profileId === targetProfileId) {
    return NextResponse.json(
      { error: "You can't reactivate your own account." },
      { status: 403 },
    );
  }

  const result = await reactivateMember(await createClient(), {
    organizationId: actor.organizationId,
    profileId: targetProfileId,
    reason,
  });
  if (!result.ok) {
    const status =
      result.code === "28000"
        ? 401
        : result.code === "42501"
          ? 403
          : result.code === "P0002"
            ? 404
            : result.code === "22023"
              ? 400
              : 500;
    return NextResponse.json(
      {
        error:
          status === 500
            ? "Unable to reactivate this person."
            : status === 401
              ? "Not signed in."
              : status === 404
                ? "That person is not a member of this organization."
                : status === 400
                  ? "Invalid request."
                  : "You are not able to reactivate this person.",
        ...(status === 401 ? { sessionInvalid: true } : {}),
      },
      { status },
    );
  }
  if (result.outcome === "already_in_state") {
    return NextResponse.json(
      { error: "That person is already active." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
