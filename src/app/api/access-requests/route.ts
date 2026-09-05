import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(100),
  contact: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Complete all registration fields." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", parsed.data.restaurantSlug.toLowerCase())
    .maybeSingle();
  if (!organization) {
    return NextResponse.json(
      { error: "Restaurant not found." },
      { status: 404 },
    );
  }

  const { error } = await admin.from("access_requests").insert({
    organization_id: organization.id,
    display_name: parsed.data.displayName,
    contact: parsed.data.contact,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not submit the request." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
