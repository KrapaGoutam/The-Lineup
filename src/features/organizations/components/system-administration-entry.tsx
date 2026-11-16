"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getSystemAdministrationAccessAction } from "@/features/organizations/actions/organization-admin-actions";

/** Server-verified owner navigation, including when no location is selected. */
export function SystemAdministrationEntry({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    getSystemAdministrationAccessAction()
      .then((result) => {
        if (active) setAllowed(result.ok && result.data);
      })
      .catch(() => {
        if (active) setAllowed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!allowed) return null;

  if (compact) {
    return (
      <Link
        href="/system-administration/organizations"
        className={buttonVariants({ variant: "secondary" })}
      >
        System Administration · Organizations
      </Link>
    );
  }

  return (
    <Link
      href="/system-administration/organizations"
      className="hover:bg-muted border-border bg-card flex min-h-24 w-full items-center gap-4 rounded-2xl border p-5 text-left"
    >
      <span className="bg-primary/10 text-primary grid size-12 flex-none place-items-center rounded-2xl">
        <Building2 className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">
          System Administration
        </span>
        <span className="text-muted-foreground mt-0.5 block text-sm">
          Organizations and their branches
        </span>
      </span>
    </Link>
  );
}
