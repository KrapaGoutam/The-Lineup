import type { ReactNode } from "react";

import {
  describeRemainder,
  splitTenders,
} from "@/features/tips/domain/tender-split";
import {
  dailyRows,
  employeeTotals,
  liveIntervals,
  monthlyRows,
  reconcileDay,
  sumShares,
  weeklyRows,
  type TipsDay,
  type TipsInterval,
  type TipsRange,
} from "@/features/tips/domain/tips-range-model";
import { money } from "@/features/tips/domain/tips-format";
import { formatReportDate } from "@/lib/report-period";

function Table({
  caption,
  head,
  children,
  foot,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <table className="report-table w-full border-collapse text-sm">
      <caption className="mb-2 text-left text-sm font-semibold">
        {caption}
      </caption>
      <thead>
        <tr className="border-border border-b text-left">
          {head.map((label, index) => (
            <th
              key={label}
              scope="col"
              className={`py-1.5 pr-3 font-medium ${index === 0 ? "" : "text-right"}`}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
      {foot ? <tfoot>{foot}</tfoot> : null}
    </table>
  );
}

const num = "py-1.5 pr-3 text-right font-mono";

function MoneyCells({
  cash,
  card,
  unsplit,
  total,
  bold,
}: {
  cash: number;
  card: number;
  unsplit: number;
  total: number;
  bold?: boolean;
}) {
  return (
    <>
      <td className={num}>{money(cash)}</td>
      <td className={num}>{money(card)}</td>
      <td className={num}>{unsplit ? money(unsplit) : "—"}</td>
      <td className={`${num} ${bold ? "font-bold" : "font-semibold"}`}>
        {money(total)}
      </td>
    </>
  );
}

function intervalLabel(interval: TipsInterval) {
  return `${interval.start}–${interval.end}${interval.endsNextDay ? " (+1 day)" : ""}`;
}

/**
 * The Tips report: one document that is both the readable on-screen preview and what
 * prints to Letter / Save as PDF. Managers get every employee and day detail; staff get
 * only their own figures (the data they receive is already limited by the database).
 */
export function TipsReportDocument({
  branchName,
  periodLabel,
  range,
  isManager,
  nameOf,
  generatedAtLabel,
}: {
  branchName: string;
  periodLabel: string;
  range: TipsRange;
  isManager: boolean;
  nameOf: (profileId: string) => string;
  generatedAtLabel: string;
}) {
  const days = range.days;
  const totals = sumShares(days.flatMap((day) => day.allocations));
  const people = employeeTotals(days);
  const daily = dailyRows(days);
  const weekly = weeklyRows(days);
  const monthly = monthlyRows(days);
  const showWeekly = daily.length > 7 || weekly.length > 1;
  const showMonthly = monthly.length > 1;

  return (
    <article
      className="report-document border-border bg-card text-card-foreground space-y-8 rounded-2xl border p-6 print:rounded-none print:border-0"
      aria-label={`Tips report, ${periodLabel}`}
      data-testid="tips-report"
    >
      <section className="report-section space-y-6">
        {/* A <div>, not <header>: the shared print stylesheet hides every <header> (app chrome). */}
        <div className="space-y-1" data-testid="tips-report-title">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            {isManager ? "Tips Distribution Report" : "My Tips Report"}
          </h2>
          <p className="text-sm">{branchName}</p>
          <p className="text-muted-foreground text-sm">
            {periodLabel} · generated {generatedAtLabel}
          </p>
        </div>

        {days.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            No tips were saved for this period.
          </p>
        ) : (
          <>
            <Table
              caption={isManager ? "Period summary" : "My period total"}
              head={["", "Cash", "Card", "Not split", "Combined"]}
            >
              <tr className="report-total-row border-border border-t font-semibold">
                <td className="py-1.5 pr-3">
                  {days.length} day{days.length === 1 ? "" : "s"}
                </td>
                <MoneyCells
                  cash={totals.cashCents}
                  card={totals.cardCents}
                  unsplit={totals.unclassifiedCents}
                  total={totals.totalCents}
                  bold
                />
              </tr>
            </Table>

            {isManager ? (
              <Table
                caption="Totals by employee"
                head={[
                  "Employee",
                  "Days",
                  "Cash",
                  "Card",
                  "Not split",
                  "Total",
                ]}
              >
                {people.map((p) => (
                  <tr key={p.profileId} className="border-border border-b">
                    <td className="py-1.5 pr-3">{nameOf(p.profileId)}</td>
                    <td className={num}>{p.days}</td>
                    <MoneyCells
                      cash={p.cashCents}
                      card={p.cardCents}
                      unsplit={p.unclassifiedCents}
                      total={p.totalCents}
                    />
                  </tr>
                ))}
              </Table>
            ) : null}

            <div className="report-keep">
              <Table
                caption="Daily summary"
                head={
                  isManager
                    ? ["Day", "People", "Cash", "Card", "Not split", "Total"]
                    : ["Day", "Cash", "Card", "Not split", "Total"]
                }
              >
                {daily.map((row) => (
                  <tr key={row.key} className="border-border border-b">
                    <td className="py-1.5 pr-3">{formatReportDate(row.key)}</td>
                    {isManager ? <td className={num}>{row.people}</td> : null}
                    <MoneyCells
                      cash={row.cashCents}
                      card={row.cardCents}
                      unsplit={row.unclassifiedCents}
                      total={row.totalCents}
                    />
                  </tr>
                ))}
              </Table>
            </div>

            {showWeekly ? (
              <Table
                caption="Weekly summary (weeks start Monday)"
                head={["Week", "Days", "Cash", "Card", "Not split", "Total"]}
              >
                {weekly.map((row) => (
                  <tr key={row.key} className="border-border border-b">
                    <td className="py-1.5 pr-3">
                      Week of {formatReportDate(row.key)}
                    </td>
                    <td className={num}>{row.days}</td>
                    <MoneyCells
                      cash={row.cashCents}
                      card={row.cardCents}
                      unsplit={row.unclassifiedCents}
                      total={row.totalCents}
                    />
                  </tr>
                ))}
              </Table>
            ) : null}

            {showMonthly ? (
              <Table
                caption="Monthly summary"
                head={["Month", "Days", "Cash", "Card", "Not split", "Total"]}
              >
                {monthly.map((row) => (
                  <tr key={row.key} className="border-border border-b">
                    <td className="py-1.5 pr-3">{row.key}</td>
                    <td className={num}>{row.days}</td>
                    <MoneyCells
                      cash={row.cashCents}
                      card={row.cardCents}
                      unsplit={row.unclassifiedCents}
                      total={row.totalCents}
                    />
                  </tr>
                ))}
              </Table>
            ) : null}
          </>
        )}
      </section>

      {days.map((day) => (
        <DaySection
          key={day.poolId}
          day={day}
          isManager={isManager}
          nameOf={nameOf}
        />
      ))}
    </article>
  );
}

function DaySection({
  day,
  isManager,
  nameOf,
}: {
  day: TipsDay;
  isManager: boolean;
  nameOf: (profileId: string) => string;
}) {
  const live = liveIntervals(day);
  const voided = day.intervals.filter((interval) => interval.voided);
  const reconciliation = isManager ? reconcileDay(day) : null;
  return (
    <section
      className="report-keep space-y-3"
      aria-label={formatReportDate(day.serviceDate)}
    >
      <h3 className="text-lg font-semibold">
        {formatReportDate(day.serviceDate)}
        {day.status === "finalized" ? (
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            (finalized by the earlier workflow)
          </span>
        ) : null}
      </h3>
      <Table
        caption={isManager ? "Intervals" : "My intervals"}
        head={
          isManager
            ? ["Time", "People", "Cash", "Card", "Not split", "Total"]
            : [
                "Time",
                "Shared by",
                "My cash",
                "My card",
                "Not split",
                "My total",
              ]
        }
      >
        {live.map((interval) => {
          const mine = interval.shares.reduce(
            (acc, s) => ({
              cash: acc.cash + s.cashCents,
              card: acc.card + s.cardCents,
              unsplit: acc.unsplit + s.unclassifiedCents,
              total: acc.total + s.amountCents,
            }),
            { cash: 0, card: 0, unsplit: 0, total: 0 },
          );
          return (
            <tr key={interval.id} className="border-border border-b">
              <td className="py-1.5 pr-3 font-mono">
                {intervalLabel(interval)}
              </td>
              <td className={num}>{interval.participantCount}</td>
              {isManager ? (
                <MoneyCells
                  cash={interval.cashCents}
                  card={interval.cardCents}
                  unsplit={
                    interval.tenderRecorded ? 0 : (interval.amountCents ?? 0)
                  }
                  total={interval.amountCents ?? 0}
                />
              ) : (
                <MoneyCells
                  cash={mine.cash}
                  card={mine.card}
                  unsplit={mine.unsplit}
                  total={mine.total}
                />
              )}
            </tr>
          );
        })}
      </Table>

      {isManager ? (
        <div className="report-keep">
          <Table
            caption="Distribution"
            head={["Employee", "Cash", "Card", "Not split", "Total"]}
            foot={
              <tr className="report-total-row border-border border-t font-semibold">
                <td className="py-1.5 pr-3">Reconciled total</td>
                <MoneyCells
                  cash={sumShares(day.allocations).cashCents}
                  card={sumShares(day.allocations).cardCents}
                  unsplit={sumShares(day.allocations).unclassifiedCents}
                  total={sumShares(day.allocations).totalCents}
                  bold
                />
              </tr>
            }
          >
            {day.allocations.map((a) => (
              <tr key={a.profileId} className="border-border border-b">
                <td className="py-1.5 pr-3">{nameOf(a.profileId)}</td>
                <MoneyCells
                  cash={a.cashCents}
                  card={a.cardCents}
                  unsplit={a.unclassifiedCents}
                  total={a.amountCents}
                />
              </tr>
            ))}
          </Table>
        </div>
      ) : null}

      {isManager ? <Remainders live={live} nameOf={nameOf} /> : null}

      {reconciliation && !reconciliation.ok ? (
        <p className="text-destructive text-xs">
          Warning: the allocations for this day do not match the entered tips.
        </p>
      ) : null}

      {isManager && voided.length > 0 ? (
        <div className="report-keep text-xs">
          <p className="font-semibold">Voided entries (not counted)</p>
          <ul className="mt-1 space-y-0.5">
            {voided.map((interval) => (
              <li key={interval.id}>
                {intervalLabel(interval)} · {money(interval.amountCents ?? 0)} —{" "}
                {interval.voidReason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Remainders({
  live,
  nameOf,
}: {
  live: TipsInterval[];
  nameOf: (profileId: string) => string;
}) {
  const notes = live
    .filter(
      (interval) =>
        interval.tenderRecorded && interval.participantIds.length > 0,
    )
    .map((interval) => {
      try {
        const note = describeRemainder(
          splitTenders({
            cashCents: interval.cashCents,
            cardCents: interval.cardCents,
            participantIds: interval.participantIds,
          }),
          nameOf,
        );
        return note ? `${intervalLabel(interval)}: ${note}` : null;
      } catch {
        return null;
      }
    })
    .filter((note): note is string => note !== null);
  if (notes.length === 0) return null;
  return (
    <div className="report-keep text-muted-foreground text-xs">
      <p className="font-semibold">Rounding</p>
      <ul className="mt-1 space-y-0.5">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
