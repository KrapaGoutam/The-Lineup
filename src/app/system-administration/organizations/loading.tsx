import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8" role="status">
      <h1 className="text-2xl font-semibold">System Administration</h1>
      <Card className="text-muted-foreground p-6 text-sm">
        Loading organizations…
      </Card>
    </main>
  );
}
