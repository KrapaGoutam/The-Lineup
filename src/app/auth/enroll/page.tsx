import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PinEnrollment } from "@/features/auth/components/pin-enrollment";

export default async function EnrollPage() {
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/");
  return <PinEnrollment />;
}
