"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8" role="alert">
      <h1 className="text-2xl font-semibold">
        System Administration unavailable
      </h1>
      <p>We couldn&apos;t load organizations right now.</p>
      <Button onClick={retry}>Retry</Button>
    </main>
  );
}
