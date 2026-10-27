"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBusinessDateTime } from "@/lib/date-time";

import { orderDraftTotals } from "../domain/order-draft";
import { purchaseLines } from "../domain/order-draft-share";
import {
  sentPageCount,
  type SentDraftPage,
  type SentDraftSummary,
} from "../domain/order-draft-sent";
import {
  lineLabel,
  sortDraftLines,
  type OrderDraftLine,
  type OrderDraftView,
} from "../domain/order-draft-view";
import type { OrderDraftApi } from "../hooks/use-order-drafts";
import { formatQuantity } from "./editable-cell";
import type { RunExport } from "./export-control";
import { ShareActions } from "./order-draft-share";
import { EmptyState, TableSkeleton } from "./table-kit/empty-state";

const when = (iso: string | null, timeZone: string) =>
  iso ? formatBusinessDateTime(iso, timeZone) : "an unknown time";

type ListState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; page: SentDraftPage };

function SentRow({
  order,
  timeZone,
  onOpen,
}: {
  order: SentDraftSummary;
  timeZone: string;
  onOpen: () => void;
}) {
  const sent = when(order.sentAt, timeZone);
  return (
    <li
      data-testid="sent-row"
      data-vendor={order.vendorName}
      className="flex flex-col gap-2 px-3 py-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_6rem_8rem] md:items-center md:gap-3"
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`View ${order.vendorName} order sent ${sent}`}
          className="focus-visible:ring-ring min-h-11 text-left font-medium break-words underline-offset-2 outline-none hover:underline focus-visible:ring-2"
        >
          {order.vendorName}
        </button>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground text-xs md:sr-only">Sent </span>
        <time dateTime={order.sentAt}>{sent}</time>
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground text-xs md:sr-only">
          Sent by{" "}
        </span>
        {order.sentByName ?? "Unknown"}
      </p>
      <p className="text-sm tabular-nums">
        <span className="text-muted-foreground text-xs md:sr-only">Lines </span>
        {order.lineCount}
      </p>
      <p className="text-sm font-semibold tabular-nums">
        <span className="text-muted-foreground text-xs font-normal md:sr-only">
          Planned total{" "}
        </span>
        {formatQuantity(order.plannedTotal)}
      </p>
    </li>
  );
}

function SentLineRow({ line }: { line: OrderDraftLine }) {
  const ordered = line.included && line.orderQty !== null && line.orderQty > 0;
  return (
    <li
      data-testid="sent-line"
      data-name={line.name}
      className="flex flex-col gap-2 px-3 py-3 md:grid md:grid-cols-[minmax(0,2fr)_8rem_8rem_minmax(0,2fr)] md:items-start md:gap-3"
    >
      <div className="min-w-0">
        <p className="font-medium break-words">{lineLabel(line)}</p>
        <p className="text-muted-foreground text-xs">
          {line.unit}
          {line.sku ? ` · ${line.sku}` : ""}
        </p>
      </div>
      <p className="text-sm tabular-nums">
        <span className="text-muted-foreground block text-xs md:sr-only">
          Suggested (at draft)
        </span>
        {line.suggestedQty === null
          ? "Order needed"
          : formatQuantity(line.suggestedQty)}
      </p>
      <p
        className={
          ordered
            ? "text-sm font-semibold tabular-nums"
            : "text-muted-foreground text-sm"
        }
      >
        <span className="text-muted-foreground block text-xs font-normal md:sr-only">
          Ordered
        </span>
        {ordered ? formatQuantity(line.orderQty) : "Not ordered"}
      </p>
      <p className="text-sm break-words whitespace-pre-wrap">
        <span className="text-muted-foreground block text-xs md:sr-only">
          Item note
        </span>
        {line.itemNote ?? "—"}
      </p>
    </li>
  );
}

type DetailState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; draft: OrderDraftView };

/**
 * One Sent order, read-only: no input is rendered, only the labels and values
 * frozen when it was sent. Copy and Export stay available.
 */
function SentOrderDetail({
  id,
  api,
  timeZone,
  runExport,
  notice,
  onBack,
}: {
  id: string;
  api: OrderDraftApi;
  timeZone: string;
  runExport: RunExport;
  notice: string | null;
  onBack: () => void;
}) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getSent(id).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", draft: result.draft }
          : { status: "error", error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api, id, attempt]);

  // Arriving from Mark Sent, the button that was pressed is gone: put focus on
  // the order's heading so keyboard and screen-reader users land on the result.
  const ready = state.status === "ready";
  useEffect(() => {
    if (ready) heading.current?.focus({ preventScroll: true });
  }, [ready]);

  if (state.status === "loading") {
    return (
      <div>
        <p className="sr-only" role="status">
          Loading sent order…
        </p>
        <TableSkeleton rows={4} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Back to sent orders
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { draft } = state;
  const totals = orderDraftTotals(draft.lines);
  const ordered = purchaseLines(draft.lines).length;
  const lines = sortDraftLines(draft.lines);

  return (
    <section
      aria-label={`${draft.vendorName} sent order`}
      data-testid="sent-order"
      className="flex flex-col gap-4"
    >
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to sent orders
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {draft.vendorName}
        </h2>
        <Badge tone="success">Sent</Badge>
      </div>
      <p className="text-muted-foreground text-sm" data-testid="sent-meta">
        Sent by {draft.sentByName ?? "an unknown person"} on{" "}
        {when(draft.sentAt, timeZone)}
      </p>

      <p role="status" className="text-sm" data-testid="sent-notice">
        {notice ?? ""}
      </p>
      <p className="text-muted-foreground text-xs">
        This order is read-only. It was recorded as sent outside The Lineup, and
        your inventory was not changed.
      </p>

      <ShareActions draft={draft} runExport={runExport} />

      <div className="border-border bg-muted/30 grid gap-x-6 gap-y-2 rounded-xl border p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">Planned order total</p>
          <p className="font-semibold tabular-nums">
            {formatQuantity(totals.plannedTotal)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Lines ordered</p>
          <p className="font-semibold tabular-nums">{ordered}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Suggested total (at draft)
          </p>
          <p className="font-semibold tabular-nums">
            {formatQuantity(totals.suggestedTotal)}
            {totals.orderNeededCount > 0 ? (
              <span className="text-muted-foreground text-xs font-normal">
                {" "}
                + {totals.orderNeededCount} order needed
              </span>
            ) : null}
          </p>
        </div>
        <p className="text-muted-foreground text-xs sm:col-span-3">
          Totals are ordering units, not dollars. Suggested is what the system
          recommended when the draft was prepared; it is not recalculated.
        </p>
      </div>

      {draft.vendorNote ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Vendor note</h3>
          <p
            className="border-border bg-card rounded-xl border px-3 py-2 text-sm break-words whitespace-pre-wrap"
            data-testid="sent-vendor-note"
          >
            {draft.vendorNote}
          </p>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <EmptyState message="This order has no lines." />
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div
            aria-hidden="true"
            className="text-muted-foreground bg-muted/40 hidden px-3 py-2 text-xs font-semibold md:grid md:grid-cols-[minmax(0,2fr)_8rem_8rem_minmax(0,2fr)] md:gap-3"
          >
            <span>Item</span>
            <span>Suggested (at draft)</span>
            <span>Ordered</span>
            <span>Item note</span>
          </div>
          <ul
            aria-label={`${draft.vendorName} sent order lines`}
            className="divide-border divide-y"
          >
            {lines.map((line) => (
              <SentLineRow key={line.productId} line={line} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The Sent half of Order Drafts: a newest-first, explicitly paged list of
 * orders the manager marked sent, and the read-only order behind each row.
 */
export function SentOrders({
  api,
  timeZone,
  runExport,
  openId,
  onOpen,
  notice,
}: {
  api: OrderDraftApi;
  timeZone: string;
  runExport: RunExport;
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** Said once after Mark Sent ("Order marked sent…" / "Already marked sent…"). */
  notice: string | null;
}) {
  const [page, setPage] = useState(0);
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (openId) return;
    let cancelled = false;
    void api.listSent(page).then((result) => {
      if (cancelled) return;
      setBusy(false);
      setList(
        result.ok
          ? { status: "ready", page: result.page }
          : { status: "error", error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api, page, attempt, openId]);

  if (openId) {
    return (
      <SentOrderDetail
        id={openId}
        api={api}
        timeZone={timeZone}
        runExport={runExport}
        notice={notice}
        onBack={() => onOpen(null)}
      />
    );
  }

  if (list.status === "loading") {
    return (
      <div>
        <p className="sr-only" role="status">
          Loading sent orders…
        </p>
        <TableSkeleton />
      </div>
    );
  }
  if (list.status === "error") {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <p role="alert" className="text-destructive text-sm">
            {list.error}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setList({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { page: current } = list;
  if (current.total === 0) {
    return (
      <EmptyState message="No orders have been marked sent yet. Mark Sent on a draft records that you sent it to the vendor." />
    );
  }
  const pages = sentPageCount(current.total, current.pageSize);
  const first = current.page * current.pageSize + 1;
  const last = first + current.drafts.length - 1;
  const go = (next: number) => {
    if (busy || next < 0 || next >= pages) return;
    setBusy(true);
    setPage(next);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="sent-orders">
      <p className="text-muted-foreground text-sm">
        Orders you marked sent, newest first. Opening one shows it exactly as it
        was sent.
      </p>
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <div
          aria-hidden="true"
          className="text-muted-foreground bg-muted/40 hidden px-3 py-2 text-xs font-semibold md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_6rem_8rem] md:gap-3"
        >
          <span>Vendor</span>
          <span>Sent</span>
          <span>Sent by</span>
          <span>Lines</span>
          <span>Planned total</span>
        </div>
        <ul aria-label="Sent orders" className="divide-border divide-y">
          {current.drafts.map((order) => (
            <SentRow
              key={order.id}
              order={order}
              timeZone={timeZone}
              onOpen={() => onOpen(order.id)}
            />
          ))}
        </ul>
      </div>
      <nav
        aria-label="Sent orders pages"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <p
          role="status"
          className="text-muted-foreground text-sm"
          data-testid="sent-page-status"
        >
          Page {current.page + 1} of {pages} · {first}–{last} of {current.total}{" "}
          sent {current.total === 1 ? "order" : "orders"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => go(current.page - 1)}
            aria-disabled={busy || current.page === 0}
            className={busy || current.page === 0 ? "opacity-60" : undefined}
          >
            Previous page
          </Button>
          <Button
            variant="secondary"
            onClick={() => go(current.page + 1)}
            aria-disabled={busy || current.page >= pages - 1}
            className={
              busy || current.page >= pages - 1 ? "opacity-60" : undefined
            }
          >
            Next page
          </Button>
        </div>
      </nav>
    </div>
  );
}
