"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  Minus,
  MoreHorizontal,
  Plus,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  generateSectionAssignments,
  type DiningTable,
} from "@/features/floor/domain/generate-section-assignments";
import { cn } from "@/lib/utils";

const servers = [
  { id: "mia", name: "Mia Chen", color: "var(--server-one)" },
  { id: "leo", name: "Leo Park", color: "var(--server-two)" },
  { id: "ava", name: "Ava Brooks", color: "var(--server-three)" },
  { id: "noah", name: "Noah Diaz", color: "var(--server-four)" },
  { id: "zara", name: "Zara Reed", color: "var(--server-five)" },
  { id: "sam", name: "Sam Ellis", color: "var(--server-six)" },
  { id: "ivy", name: "Ivy Tran", color: "var(--server-seven)" },
];

const occupiedIndexes = new Set([1, 4, 8, 11, 15, 17]);

const tables: DiningTable[] = Array.from({ length: 18 }, (_, index) => ({
  id: `table-${index + 1}`,
  label: String(index + 1).padStart(2, "0"),
  seatCount: index % 5 === 0 ? 6 : index % 3 === 0 ? 2 : 4,
  areaOrder: index < 8 ? 0 : index < 14 ? 1 : 2,
  sequence: index,
  occupied: occupiedIndexes.has(index),
  currentServerId: occupiedIndexes.has(index) ? servers[index % 6].id : null,
}));

const queue = [
  { name: "Mia Chen", detail: "3 parties · 11 covers", state: "Next" },
  { name: "Leo Park", detail: "3 parties · 13 covers", state: "Ready" },
  { name: "Ava Brooks", detail: "4 parties · 12 covers", state: "Ready" },
  { name: "Noah Diaz", detail: "4 parties · 16 covers", state: "Closing" },
];

const roster = [
  { day: "Mon", date: "7", people: 14, hours: 92, status: "Published" },
  { day: "Tue", date: "8", people: 16, hours: 104, status: "Published" },
  { day: "Wed", date: "9", people: 17, hours: 112, status: "Published" },
  { day: "Thu", date: "10", people: 18, hours: 121, status: "Draft" },
  { day: "Fri", date: "11", people: 24, hours: 158, status: "Draft" },
  { day: "Sat", date: "12", people: 26, hours: 174, status: "Draft" },
  { day: "Sun", date: "13", people: 20, hours: 132, status: "Draft" },
];

function Initials({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-zinc-950"
      style={{ backgroundColor: color }}
    >
      {name
        .split(" ")
        .map((part) => part[0])
        .join("")}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
        </div>
        <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const [serverCount, setServerCount] = useState(6);
  const activeServers = servers.slice(0, serverCount);
  const assignments = useMemo(
    () =>
      generateSectionAssignments(
        tables,
        activeServers.map(({ id }) => id),
      ),
    [activeServers],
  );
  const serverByTable = new Map(
    assignments.map((assignment) => [assignment.tableId, assignment.serverId]),
  );

  return (
    <div className="min-h-screen">
      <header className="bg-background/80 sticky top-0 z-30 border-b border-white/8 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#overview"
            className="flex items-center gap-3"
            aria-label="ServiceFlow home"
          >
            <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl font-black shadow-[0_12px_40px_-14px_var(--primary)]">
              S
            </span>
            <span className="hidden text-sm font-bold tracking-tight sm:block">
              ServiceFlow
            </span>
          </a>
          <span className="bg-border hidden h-5 w-px md:block" />
          <button className="hidden min-h-11 items-center gap-2 rounded-xl px-2 text-left text-sm md:flex">
            <span>
              <span className="block font-semibold">The Monk&apos;s</span>
              <span className="text-muted-foreground block text-xs">
                River Oaks · Dinner
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
          </button>
          <nav
            className="ml-auto hidden items-center gap-1 lg:flex"
            aria-label="Primary navigation"
          >
            {["Overview", "Floor", "Roster", "Team"].map((item, index) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  index === 0
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
              </a>
            ))}
          </nav>
          <Badge tone="success" className="ml-auto lg:ml-3">
            <span className="size-1.5 rounded-full bg-emerald-300" /> Live
          </Badge>
          <button
            aria-label="Open account menu"
            className="border-border bg-secondary grid size-11 place-items-center rounded-xl border text-sm font-bold"
          >
            KG
          </button>
        </div>
      </header>

      <main
        id="overview"
        className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <CalendarDays aria-hidden="true" className="size-4" /> Saturday,
              September 5<span aria-hidden="true">·</span> 7:42 PM
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Tonight at a glance
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              Dinner service is moving smoothly. Mia is next in rotation and the
              patio is nearing capacity.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary">
              <CalendarDays aria-hidden="true" /> View schedule
            </Button>
            <Button>
              Open host view <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <section
          aria-label="Service metrics"
          className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Metric
            icon={Users}
            label="Active servers"
            value={`${serverCount}`}
            detail="1 paused · 1 closing"
          />
          <Metric
            icon={Utensils}
            label="Open tables"
            value="12 / 18"
            detail="67% dining room occupancy"
          />
          <Metric
            icon={Sparkles}
            label="Covers tonight"
            value="86"
            detail="+12 against last Saturday"
          />
          <Metric
            icon={Clock3}
            label="Average turn"
            value="46 min"
            detail="4 min faster than target"
          />
        </section>

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <Card id="floor" className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Floor assignments
                  </h2>
                  <Badge tone="accent">Auto-balanced</Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  Seat-weighted sections update as the server count changes.
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Floor options">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-black/20 p-3">
                <div>
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Servers on floor
                  </p>
                  <p className="mt-1 text-sm">
                    Occupied tables stay locked during rebalance.
                  </p>
                </div>
                <div className="border-border bg-secondary flex items-center rounded-xl border p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove one server"
                    disabled={serverCount <= 3}
                    onClick={() =>
                      setServerCount((count) => Math.max(3, count - 1))
                    }
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span
                    className="w-12 text-center font-mono text-lg font-bold"
                    aria-live="polite"
                  >
                    {serverCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Add one server"
                    disabled={serverCount >= servers.length}
                    onClick={() =>
                      setServerCount((count) =>
                        Math.min(servers.length, count + 1),
                      )
                    }
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div
                className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6"
                aria-label="Dining room tables"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {tables.map((table) => {
                    const serverId = serverByTable.get(table.id);
                    const server = servers.find(({ id }) => id === serverId);
                    return (
                      <motion.div
                        layout
                        key={`${table.id}-${serverId}`}
                        initial={{ opacity: 0.35, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className={cn(
                          "bg-secondary relative flex min-h-20 flex-col justify-between overflow-hidden rounded-xl border p-3",
                          table.occupied && "border-white/25 bg-white/[0.07]",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-1"
                          style={{
                            backgroundColor: server?.color ?? "var(--border)",
                          }}
                        />
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-sm font-bold">
                            {table.label}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            {table.seatCount} seats
                          </span>
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor:
                                server?.color ?? "var(--muted-foreground)",
                            }}
                          />
                          <span className="truncate">
                            {server?.name.split(" ")[0] ?? "Unassigned"}
                          </span>
                          {table.occupied ? (
                            <span aria-label="Occupied">· ●</span>
                          ) : null}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                {activeServers.map((server) => (
                  <div
                    key={server.id}
                    className="text-muted-foreground flex items-center gap-2 text-xs"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: server.color }}
                    />
                    {server.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Table rotation
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Fairness by workload, last seat, then order.
                </p>
              </div>
              <Badge tone="success">Synced now</Badge>
            </CardHeader>
            <CardContent>
              <div className="border-primary/20 rounded-2xl border bg-[linear-gradient(135deg,rgba(242,166,90,0.14),rgba(242,166,90,0.03))] p-5">
                <div className="flex items-center gap-3">
                  <Initials name="Mia Chen" color="var(--server-one)" />
                  <div className="min-w-0">
                    <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
                      Next eligible
                    </p>
                    <p className="truncate text-xl font-semibold">Mia Chen</p>
                  </div>
                  <Button size="sm" className="ml-auto">
                    Seat party
                  </Button>
                </div>
                <p className="text-muted-foreground mt-4 text-xs leading-5">
                  Lowest eligible workload: 3 parties and 11 covers. Last seated
                  38 minutes ago.
                </p>
              </div>

              <div className="divide-border mt-4 divide-y">
                {queue.map((item, index) => {
                  const server = servers[index];
                  return (
                    <div
                      key={item.name}
                      className="flex min-h-16 items-center gap-3 py-3"
                    >
                      <span className="text-muted-foreground w-4 text-center font-mono text-xs">
                        {index + 1}
                      </span>
                      <Initials name={item.name} color={server.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {item.name}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {item.detail}
                        </p>
                      </div>
                      <Badge
                        tone={item.state === "Closing" ? "warning" : "neutral"}
                      >
                        {item.state}
                      </Badge>
                    </div>
                  );
                })}
              </div>
              <Button variant="outline" className="mt-3 w-full">
                Manage rotation
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card id="roster" className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Weekly roster
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  September 7–13 · FOH and BOH coverage
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Edit week
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="grid min-w-[680px] grid-cols-7 gap-2 pb-1">
                {roster.map((day) => (
                  <button
                    key={day.day}
                    className="border-border bg-secondary hover:border-primary/30 hover:bg-muted focus-visible:ring-ring min-h-32 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs font-bold uppercase">
                        {day.day}
                      </span>
                      <span className="font-mono text-sm font-bold">
                        {day.date}
                      </span>
                    </div>
                    <p className="mt-5 text-xl font-semibold">{day.people}</p>
                    <p className="text-muted-foreground text-xs">
                      people · {day.hours}h
                    </p>
                    <Badge
                      tone={day.status === "Published" ? "success" : "warning"}
                      className="mt-3"
                    >
                      {day.status}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-amber-400/10 text-amber-200">
                  <CircleAlert aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h2 className="font-semibold">Needs attention</h2>
                  <p className="text-muted-foreground text-xs">
                    2 roster checks
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <button className="border-border bg-secondary hover:bg-muted w-full rounded-xl border p-4 text-left">
                <p className="text-sm font-semibold">Friday dinner coverage</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  One bartender shift remains open after 8:00 PM.
                </p>
              </button>
              <button className="border-border bg-secondary hover:bg-muted w-full rounded-xl border p-4 text-left">
                <p className="text-sm font-semibold">Availability conflict</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Ava is assigned 30 minutes before availability.
                </p>
              </button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
