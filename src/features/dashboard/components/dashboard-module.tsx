"use client";

import {
  ArrowRight,
  CalendarSearch,
  FileBarChart,
  ListChecks,
  RefreshCw,
  Table2,
  WalletCards,
  Wine,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AppTab } from "@/lib/app-tab";
import { cn } from "@/lib/utils";

import type { DashboardActionResult } from "../actions/dashboard-actions";
import {
  attendanceFigures,
  formatClock,
  formatServiceDate,
  lowStockFigures,
  payrollFigures,
  tipsFigures,
  type CardFigures,
} from "../domain/dashboard-format";
import type {
  CardResult,
  DashboardData,
  QuickAction,
} from "../domain/dashboard-model";

type CardKey = "attendance" | "payroll" | "tips" | "lowStock";

const CARD_META: Record<
  CardKey,
  { title: string; name: string; tab: AppTab; open: string; icon: LucideIcon }
> = {
  attendance: {
    title: "Today's Attendance",
    name: "Attendance",
    tab: "attendance",
    open: "Open Attendance",
    icon: CalendarSearch,
  },
  payroll: {
    title: "Pending Payroll",
    name: "Payroll",
    tab: "payroll",
    open: "Open Payroll",
    icon: Banknote,
  },
  tips: {
    title: "Today's Tips",
    name: "Tip Split",
    tab: "tips",
    open: "Open Tip Split",
    icon: WalletCards,
  },
  lowStock: {
    title: "Low Stock",
    name: "Bar Inventory",
    tab: "barInventory",
    open: "Open Bar Inventory",
    icon: Wine,
  },
};

const CARD_ORDER: readonly CardKey[] = [
  "attendance",
  "payroll",
  "tips",
  "lowStock",
];

const ACTION_ICONS: Record<string, LucideIcon> = {
  attendance: CalendarSearch,
  payroll: Banknote,
  tips: WalletCards,
  inventory: Wine,
  tasks: ListChecks,
  allocation: Table2,
  reporting: FileBarChart,
};

export type DashboardLoader = () => Promise<DashboardActionResult>;

type Props = {
  loader: DashboardLoader;
  /** The real URL for a module (keeps the branch and every other parameter). */
  hrefFor: (tab: AppTab) => string;
  onOpenTab: (tab: AppTab) => void;
  /** Modules this viewer can actually open here (the shell's navigation policy). */
  availableTabs: readonly AppTab[];
  onSessionInvalid: () => void;
  /** The workspace changed under this tab: reload it. */
  onContextStale: () => void;
};

type LoadState =
  | { status: "loading"; data: DashboardData | null }
  | { status: "ready"; data: DashboardData }
  | {
      status: "error";
      message: string;
      stale: boolean;
      data: DashboardData | null;
    };

/** A plain click navigates in-app; a modified click keeps the browser's own behavior. */
function isPlainClick(event: React.MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function DashboardModule({
  loader,
  hrefFor,
  onOpenTab,
  availableTabs,
  onSessionInvalid,
  onContextStale,
}: Props) {
  const [state, setState] = useState<LoadState>({
    status: "loading",
    data: null,
  });
  // A slow earlier request must never overwrite a newer one.
  const seq = useRef(0);
  // The shell passes plain functions whose identity changes on every render. Keep the
  // latest in refs so a re-render never restarts the read (one read per open, no polling).
  const sessionInvalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    sessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  /** Applies one finished request, unless a newer one has started since. */
  const settle = useCallback((mine: number, result: DashboardActionResult) => {
    if (mine !== seq.current) return;
    if (result.ok) {
      setState({ status: "ready", data: result.data });
      return;
    }
    if (result.sessionInvalid) {
      sessionInvalidRef.current();
      return;
    }
    setState((current) => ({
      status: "error",
      message: result.error,
      stale: result.contextStale === true,
      data: current.data,
    }));
  }, []);

  const request = useCallback(
    (): Promise<DashboardActionResult> =>
      loader().catch(
        (): DashboardActionResult => ({
          ok: false,
          error: "The dashboard couldn't be loaded.",
        }),
      ),
    [loader],
  );

  // Refresh button / Try again.
  const reload = useCallback(() => {
    const mine = ++seq.current;
    setState((current) => ({ status: "loading", data: current.data }));
    void request().then((result) => settle(mine, result));
  }, [request, settle]);

  // One read when the Dashboard opens; after that only the Refresh button. No polling.
  useEffect(() => {
    let cancelled = false;
    const mine = ++seq.current;
    void request().then((result) => {
      // Not after this view is gone or the loader changed.
      if (!cancelled) settle(mine, result);
    });
    return () => {
      cancelled = true;
    };
  }, [request, settle]);

  const data = state.data;
  const busy = state.status === "loading";

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-module">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">
            {data
              ? `${data.organizationName} · ${data.locationName}`
              : "Daily Operations"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {data ? (
              <>
                {formatServiceDate(data.serviceDate)}
                {data.demo ? " · Sample data" : ""}
              </>
            ) : (
              "Loading today's operations…"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data ? (
            <span
              className="text-muted-foreground text-xs"
              data-testid="dashboard-updated"
            >
              Updated {formatClock(data.generatedAt, data.timeZone)}
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!busy) reload();
            }}
            aria-disabled={busy}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(busy && "motion-safe:animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </header>

      {state.status === "error" ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <span>{state.message}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (state.stale ? onContextStale() : reload())}
          >
            {state.stale ? "Reload workspace" : "Try again"}
          </Button>
        </div>
      ) : null}

      <section
        aria-label="Today at a glance"
        aria-busy={busy}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {data === null
          ? state.status === "error"
            ? null
            : CARD_ORDER.map((key) => <SkeletonCard key={key} />)
          : CARD_ORDER.filter((key) => data.cards[key] !== undefined).map(
              (key) => (
                <KpiCard
                  key={key}
                  cardKey={key}
                  // A module the shell will not open for this viewer is never linked (and its
                  // numbers are not shown), even if the server read succeeded.
                  result={
                    availableTabs.includes(CARD_META[key].tab)
                      ? (data.cards[key] as CardResult<never>)
                      : { status: "module_off" }
                  }
                  data={data}
                  href={hrefFor(CARD_META[key].tab)}
                  onOpenTab={onOpenTab}
                  refreshing={busy}
                />
              ),
            )}
      </section>

      {data && Object.keys(data.cards).length === 0 ? (
        <p
          className="text-muted-foreground border-border rounded-xl border border-dashed px-4 py-6 text-sm"
          data-testid="dashboard-no-cards"
        >
          There are no daily figures for your role at this branch. Use the
          shortcuts below to open your work.
        </p>
      ) : null}

      {data ? (
        <QuickActions
          actions={data.quickActions.filter(
            (action) =>
              action.target.kind !== "tab" ||
              availableTabs.includes(action.target.tab),
          )}
          hrefFor={hrefFor}
          onOpenTab={onOpenTab}
        />
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card className="min-w-0" aria-hidden="true">
      <CardContent className="space-y-3">
        <div className="bg-muted h-3 w-28 rounded motion-safe:animate-pulse" />
        <div className="bg-muted h-9 w-20 rounded motion-safe:animate-pulse" />
        <div className="bg-muted h-3 w-36 rounded motion-safe:animate-pulse" />
      </CardContent>
    </Card>
  );
}

function figuresFor(
  key: CardKey,
  result: CardResult<unknown>,
  data: DashboardData,
): CardFigures | null {
  if (result.status !== "ok") return null;
  switch (key) {
    case "attendance":
      return attendanceFigures(result.data as never);
    case "payroll":
      return payrollFigures(result.data as never);
    case "tips":
      return tipsFigures(result.data as never, data.timeZone);
    case "lowStock":
      return lowStockFigures(result.data as never);
  }
}

function KpiCard({
  cardKey,
  result,
  data,
  href,
  onOpenTab,
  refreshing,
}: {
  cardKey: CardKey;
  result: CardResult<unknown>;
  data: DashboardData;
  href: string;
  onOpenTab: (tab: AppTab) => void;
  refreshing: boolean;
}) {
  const meta = CARD_META[cardKey];
  const Icon = meta.icon;
  const figures = figuresFor(cardKey, result, data);
  const testId = `dashboard-card-${cardKey}`;

  const header = (
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
        {meta.title}
      </h2>
      <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl">
        <Icon aria-hidden="true" className="size-[18px]" />
      </span>
    </div>
  );

  // A module that is turned off for this branch: shown so it is not a mystery, never linked.
  if (result.status === "module_off") {
    return (
      <Card className="min-w-0 opacity-80" data-testid={testId}>
        <CardContent className="flex h-full flex-col gap-2">
          {header}
          <p className="mt-2 text-lg font-semibold">Turned off</p>
          <p className="text-muted-foreground text-sm">
            {meta.name} isn&apos;t turned on for this branch.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="focus-within:ring-ring hover:border-primary/40 min-w-0 transition-colors focus-within:ring-2"
      data-testid={testId}
    >
      <a
        href={href}
        onClick={(event) => {
          if (!isPlainClick(event)) return;
          event.preventDefault();
          onOpenTab(meta.tab);
        }}
        className="block h-full rounded-2xl focus-visible:outline-none"
      >
        <CardContent className="flex h-full flex-col gap-1">
          {header}
          {figures ? (
            <>
              <p
                className={cn(
                  "mt-2 text-3xl font-semibold tracking-tight tabular-nums",
                  refreshing && "opacity-60",
                )}
                data-testid={`${testId}-value`}
              >
                {figures.value}
              </p>
              <p className="text-sm font-medium">{figures.label}</p>
              {figures.lines.map((line) => (
                <p key={line} className="text-muted-foreground text-xs">
                  {line}
                </p>
              ))}
            </>
          ) : (
            <>
              <p
                className="text-muted-foreground mt-2 text-2xl font-semibold"
                data-testid={`${testId}-value`}
              >
                Unavailable
              </p>
              <p className="text-muted-foreground text-xs">
                {result.status === "unavailable" ? result.reason : ""}
              </p>
            </>
          )}
          <span className="text-primary mt-auto flex items-center gap-1 pt-3 text-xs font-semibold">
            {meta.open}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </span>
        </CardContent>
      </a>
    </Card>
  );
}

function QuickActions({
  actions,
  hrefFor,
  onOpenTab,
}: {
  actions: readonly QuickAction[];
  hrefFor: (tab: AppTab) => string;
  onOpenTab: (tab: AppTab) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby="dashboard-quick-actions" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="dashboard-quick-actions" className="text-lg font-semibold">
          Quick actions
        </h2>
        <Badge tone="neutral">{actions.length}</Badge>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.id] ?? ArrowRight;
          const href =
            action.target.kind === "tab"
              ? hrefFor(action.target.tab)
              : action.target.href;
          return (
            <li key={action.id}>
              <a
                href={href}
                data-testid={`dashboard-action-${action.id}`}
                onClick={(event) => {
                  if (action.target.kind !== "tab" || !isPlainClick(event)) {
                    return;
                  }
                  event.preventDefault();
                  onOpenTab(action.target.tab);
                }}
                className="border-border bg-card hover:border-primary/40 focus-visible:ring-ring flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {action.label}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {action.description}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
