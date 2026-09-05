"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Clock3,
  DollarSign,
  Plus,
  Users,
  WalletCards,
} from "lucide-react";

import type { SignedInUser } from "@/components/login-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateTipSplits,
  dollarsToCents,
  type TipIntervalInput,
} from "@/features/tips/domain/calculate-tip-splits";
import { initialTipIntervals, team } from "@/lib/demo-data";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

export function TipWorkspace({ user }: { user: SignedInUser }) {
  const isManager = user.role !== "server";
  const [intervals, setIntervals] =
    useState<TipIntervalInput[]>(initialTipIntervals);
  const [status, setStatus] = useState<"estimating" | "finalized">(
    "estimating",
  );
  const [error, setError] = useState("");
  const split = useMemo(() => calculateTipSplits(intervals), [intervals]);
  const ownTotal =
    split.totals.find(({ participantId }) => participantId === user.profileId)
      ?.amountCents ?? 0;

  function addInterval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (status === "finalized") {
      setError("This tip pool is finalized. An owner correction is required.");
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      const participantIds = form.getAll("participants").map(String);
      const next: TipIntervalInput = {
        id: `tip-${Date.now()}`,
        start: String(form.get("start")),
        end: String(form.get("end")),
        amountCents: dollarsToCents(String(form.get("amount"))),
        participantIds,
      };
      calculateTipSplits([...intervals, next]);
      setIntervals((current) => [...current, next]);
      event.currentTarget.reset();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to add tip interval.",
      );
    }
  }

  if (!isManager) {
    const ownIntervals = split.intervals.filter((interval) =>
      interval.participantIds.includes(user.profileId),
    );
    return (
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Module 3</Badge>
            <Badge tone={status === "finalized" ? "success" : "warning"}>
              {status === "finalized" ? "Final" : "Estimate"}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            My tip estimate
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Only your amount is visible. Your manager controls and finalizes the
            complete split.
          </p>
        </div>
        <Card className="border-primary/20 overflow-hidden bg-[linear-gradient(135deg,rgba(242,166,90,0.16),rgba(242,166,90,0.03))]">
          <CardContent className="p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-primary text-xs font-bold tracking-[0.16em] uppercase">
                  Estimated today
                </p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.05em]">
                  {money(ownTotal)}
                </p>
                <p className="text-muted-foreground mt-3 text-sm">
                  Across {ownIntervals.length} confirmed work intervals
                </p>
              </div>
              <span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-2xl">
                <WalletCards className="size-6" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">How your estimate was calculated</h2>
          </CardHeader>
          <CardContent className="divide-border divide-y p-0 pt-4">
            {ownIntervals.map((interval) => {
              const allocation = interval.allocations.find(
                ({ participantId }) => participantId === user.profileId,
              )!;
              return (
                <div
                  key={interval.id}
                  className="flex items-center gap-3 px-5 py-4"
                >
                  <span className="bg-secondary grid size-10 place-items-center rounded-xl">
                    <Clock3
                      className="text-muted-foreground size-4"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm">
                      {interval.start}–{interval.end}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {money(interval.amountCents)} split among{" "}
                      {interval.participantIds.length} people
                    </p>
                  </div>
                  <p className="font-mono font-semibold">
                    {money(allocation.amountCents)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Module 3</Badge>
            <Badge tone={status === "finalized" ? "success" : "warning"}>
              {status === "finalized" ? "Finalized" : "Live estimate"}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            Tip split
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Split each interval among the people actually working. Participants
            begin as the active-floor suggestion and remain manager-confirmed.
          </p>
        </div>
        <Button
          onClick={() => setStatus("finalized")}
          disabled={status === "finalized"}
        >
          <CheckCircle2 aria-hidden="true" />{" "}
          {status === "finalized" ? "Finalized" : "Finalize day"}
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Tip summary">
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Tips entered
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {money(split.totalCents)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Intervals
            </p>
            <p className="mt-2 text-3xl font-semibold">{intervals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              People included
            </p>
            <p className="mt-2 text-3xl font-semibold">{split.totals.length}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="border-primary/15">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
              <Calculator className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Add tip interval</h2>
              <p className="text-muted-foreground text-xs">
                Active floor staff are preselected; correct the list before
                adding.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={addInterval} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tip-start">From</Label>
                <Input
                  id="tip-start"
                  name="start"
                  type="time"
                  defaultValue="11:00"
                  required
                  disabled={status === "finalized"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tip-end">To</Label>
                <Input
                  id="tip-end"
                  name="end"
                  type="time"
                  defaultValue="13:00"
                  required
                  disabled={status === "finalized"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tip-amount">Tips received</Label>
                <div className="relative">
                  <DollarSign
                    className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    id="tip-amount"
                    name="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="pl-9 font-mono"
                    required
                    disabled={status === "finalized"}
                  />
                </div>
              </div>
            </div>
            <fieldset disabled={status === "finalized"}>
              <legend className="text-sm font-medium">Who was working?</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {team.slice(0, 4).map((member) => (
                  <Label
                    key={member.id}
                    className="border-border bg-secondary has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 font-normal"
                  >
                    <input
                      type="checkbox"
                      name="participants"
                      value={member.id}
                      defaultChecked
                      className="accent-[var(--primary)]"
                    />
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: member.color }}
                    />
                    {member.shortName}
                  </Label>
                ))}
              </div>
            </fieldset>
            {error ? (
              <p className="text-destructive text-sm" aria-live="polite">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={status === "finalized"}>
              <Plus aria-hidden="true" /> Add and calculate
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Intervals</h2>
          </CardHeader>
          <CardContent className="divide-border divide-y p-0 pt-4">
            {split.intervals.map((interval) => (
              <div
                key={interval.id}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[130px_100px_1fr] sm:items-center"
              >
                <p className="font-mono text-sm">
                  {interval.start}–{interval.end}
                </p>
                <p className="font-mono font-semibold">
                  {money(interval.amountCents)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {interval.participantIds.map((id) => (
                    <Badge key={id} tone="neutral">
                      {team.find((member) => member.id === id)?.shortName ?? id}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="text-primary size-5" aria-hidden="true" />
              <h2 className="font-semibold">Estimated totals</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {split.totals.map((total) => {
              const member = team.find(({ id }) => id === total.participantId);
              return (
                <div
                  key={total.participantId}
                  className="border-border bg-background/60 flex min-h-14 items-center gap-3 rounded-xl border px-3"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: member?.color }}
                  />
                  <p className="flex-1 text-sm font-medium">
                    {member?.name ?? total.participantId}
                  </p>
                  <p className="font-mono font-semibold">
                    {money(total.amountCents)}
                  </p>
                </div>
              );
            })}
            <div className="border-primary/20 bg-primary/10 mt-3 flex items-center justify-between rounded-xl border px-3 py-4">
              <p className="font-semibold">Reconciled total</p>
              <p className="text-primary font-mono text-lg font-bold">
                {money(split.totalCents)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
