import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { listOrganizationsForAdministrationAction } from "@/features/organizations/actions/organization-admin-actions";
import { OrganizationCreateForm } from "@/features/organizations/components/organization-create-form";

export default async function OrganizationsPage() {
  await connection();
  const result = await listOrganizationsForAdministrationAction();
  if (!result.ok && result.code === "UNAUTHENTICATED") redirect("/");

  return (
    <main className="mx-auto min-h-dvh max-w-5xl space-y-6 p-4 pb-12 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-semibold">
            System Administration
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            Organizations
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage organizations and their restaurant branches.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          Back to workspace
        </Link>
      </div>

      {!result.ok ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="font-semibold">
              {result.code === "FORBIDDEN"
                ? "Access denied"
                : "Unable to load organizations"}
            </h2>
            <p
              role={result.code === "FORBIDDEN" ? "status" : "alert"}
              className="text-muted-foreground text-sm"
            >
              {result.error}
            </p>
            {result.code !== "FORBIDDEN" ? (
              <Link
                href="/system-administration/organizations"
                className={buttonVariants({ variant: "outline" })}
              >
                Retry
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Create Organization</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                You become the initial organization owner. Add branches after
                saving.
              </p>
            </CardHeader>
            <CardContent>
              <OrganizationCreateForm />
            </CardContent>
          </Card>

          <section aria-label="Authorized organizations" className="space-y-3">
            <h2 className="text-lg font-semibold">Your organizations</h2>
            {result.data.length === 0 ? (
              <Card className="p-6 text-sm">
                <p className="font-medium">No organizations yet</p>
                <p className="text-muted-foreground mt-1">
                  Create your first organization above.
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {result.data.map((organization) => (
                  <Card
                    key={organization.id}
                    className="flex flex-col justify-between gap-4 p-5"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold">
                        {organization.name}
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm break-all">
                        {organization.slug}
                      </p>
                      <p className="text-muted-foreground mt-2 text-sm">
                        {organization.branchCount}{" "}
                        {organization.branchCount === 1 ? "branch" : "branches"}
                      </p>
                    </div>
                    <Link
                      href={`/system-administration/organizations/${organization.id}`}
                      className={buttonVariants({ variant: "secondary" })}
                      aria-label={`Manage ${organization.name}`}
                    >
                      Open / manage
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
