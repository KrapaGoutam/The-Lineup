import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getSystemAdministrationAccessAction } from "@/features/organizations/actions/organization-admin-actions";
import { getOrganizationById } from "@/features/organizations/data/organization-reader";
import { OrganizationBranchAdministration } from "@/features/organizations/components/organization-branch-administration";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const access = await getSystemAdministrationAccessAction();
  if (!access.ok && access.code === "UNAUTHENTICATED") redirect("/");
  if (!access.ok) {
    return (
      <main className="mx-auto max-w-3xl p-6" role="alert">
        Unable to verify administration access. Please retry.
      </main>
    );
  }
  if (!access.data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p>Overall Owner authority is required.</p>
      </main>
    );
  }

  const { organizationId } = await params;
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        organizationId,
      )
    )
      notFound();
    const client = await createClient();
    const { error } = await client
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) throw new Error("Unable to load organization.");
    notFound();
  }
  const { created } = await searchParams;

  return (
    <main className="mx-auto min-h-dvh max-w-5xl space-y-6 p-4 pb-12 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-semibold">
            System Administration · Organizations
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            {organization.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {organization.slug} · Branch management
          </p>
        </div>
        <Link
          href="/system-administration/organizations"
          className={buttonVariants({ variant: "secondary" })}
        >
          All organizations
        </Link>
      </div>
      {created === "1" ? (
        <p
          role="status"
          className="border-primary/30 bg-primary/10 rounded-xl border p-4 text-sm"
        >
          Organization created. Add its first branch below. You can return later
          if branch creation needs another attempt.
        </p>
      ) : null}
      <OrganizationBranchAdministration organizationId={organization.id} />
    </main>
  );
}
