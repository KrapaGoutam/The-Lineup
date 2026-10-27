import { Card, CardContent } from "@/components/ui/card";

/** Illustration-free empty state with an optional action row. */
export function EmptyState({
  message,
  children,
}: {
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <p className="text-muted-foreground text-sm">{message}</p>
        {children}
      </CardContent>
    </Card>
  );
}

/** Skeleton rows: reserves the layout while the first read is in flight. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="border-border divide-border flex flex-col divide-y rounded-xl border"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 p-3">
          <div className="bg-muted h-4 w-1/4 animate-pulse rounded motion-reduce:animate-none" />
          <div className="bg-muted h-4 w-1/3 animate-pulse rounded motion-reduce:animate-none" />
          <div className="bg-muted h-4 w-1/6 animate-pulse rounded motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
