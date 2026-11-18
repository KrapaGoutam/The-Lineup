import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getReportingOptionsAction } from "@/features/reporting/actions/reporting-actions";
import { ReportingCenter } from "@/features/reporting/components/reporting-center";
import { parseReportingSearchParams } from "@/features/reporting/domain/report-links";

export const metadata = { title: "Reporting Center" };

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const result = await getReportingOptionsAction();
  // A dead or missing session goes back to the sign-in entry; nothing is rendered for it.
  if (!result.ok && result.sessionInvalid) redirect("/");

  if (!result.ok) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl space-y-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">Reporting Center</h1>
        <Card>
          <CardContent className="space-y-3">
            <p role="alert" className="text-sm">
              {result.error}
            </p>
            <div className="flex gap-2">
              <Link
                href="/reporting"
                className={buttonVariants({ variant: "outline" })}
              >
                Retry
              </Link>
              <Link
                href="/"
                className={buttonVariants({ variant: "secondary" })}
              >
                Back to workspace
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (result.data.organizations.length === 0) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl space-y-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">Reporting Center</h1>
        <Card>
          <CardContent className="space-y-3">
            <p role="status" className="text-sm">
              There is nothing you can report on yet. Ask a manager to check
              your branch assignment and that Attendance or Payroll is turned on
              for it.
            </p>
            <Link href="/" className={buttonVariants({ variant: "secondary" })}>
              Back to workspace
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const initial = parseReportingSearchParams(await searchParams);
  return <ReportingCenter options={result.data} initial={initial} />;
}
