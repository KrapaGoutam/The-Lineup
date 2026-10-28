"use client";

import { Copy } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  copyOrderText,
  NOTHING_TO_SEND_MESSAGE,
  purchaseLines,
} from "../domain/order-draft-share";
import type { OrderDraftView } from "../domain/order-draft-view";
import { ExportControl, type RunExport } from "./export-control";

type CopyState = { text: string; phase: "copied" | "fallback" } | null;

/**
 * Copy Order. Uses the Clipboard API when the browser offers it and allows it;
 * otherwise (no API, no permission, an insecure page) the same text appears in
 * a read-only box that is already selected, so the manager can still copy it.
 * Success is announced ("Order copied"); a failure is not hidden.
 */
export function CopyOrderButton({
  text,
  disabled,
  describedBy,
}: {
  /** The vendor-facing text to put on the clipboard. */
  text: string;
  disabled: boolean;
  describedBy?: string;
}) {
  const uid = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<CopyState>(null);
  // A result belongs to the text it was made for; an edit makes it stale.
  const phase = state && state.text === text ? state.phase : null;

  async function copy() {
    if (disabled) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setState({ text, phase: "copied" });
    } catch {
      setState({ text, phase: "fallback" });
      // Let the box mount, then select its text so Ctrl/Cmd+C just works.
      requestAnimationFrame(() => {
        box.current?.focus();
        box.current?.select();
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        onClick={() => void copy()}
        aria-disabled={disabled}
        aria-describedby={describedBy}
        className={disabled ? "opacity-60" : undefined}
      >
        <Copy aria-hidden="true" /> Copy Order
      </Button>
      <p role="status" className="text-sm" data-testid="copy-status">
        {phase === "copied" ? "Order copied" : ""}
      </p>
      {phase === "fallback" ? (
        <div
          className="border-border bg-muted/30 flex flex-col gap-2 rounded-xl border p-3"
          data-testid="copy-fallback"
        >
          <p role="alert" className="text-sm">
            We couldn&apos;t copy this automatically. Select the text below and
            copy it.
          </p>
          <label htmlFor={`${uid}-text`} className="sr-only">
            Order text to copy
          </label>
          <textarea
            id={`${uid}-text`}
            ref={box}
            readOnly
            rows={Math.min(12, text.split("\n").length + 1)}
            value={text}
            onFocus={(event) => event.currentTarget.select()}
            className="border-input bg-background text-foreground w-full rounded-xl border px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2"
          />
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                box.current?.focus();
                box.current?.select();
              }}
            >
              Select all
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Copy Order and Export for one order, Draft or Sent. Both act on the SAVED
 * order (the server builds the file from what is stored), so while there are
 * unsaved edits they ask for a Save first rather than share something else.
 * `draft` carries the labels to share: live for a Draft, frozen for a Sent order.
 */
export function ShareActions({
  draft,
  runExport,
  unsavedReason,
}: {
  draft: OrderDraftView;
  runExport: RunExport;
  /** Set while the screen has edits that are not saved yet. */
  unsavedReason?: string;
}) {
  const reasonId = useId();
  const lineCount = purchaseLines(draft.lines).length;
  const reason =
    lineCount === 0 ? NOTHING_TO_SEND_MESSAGE : (unsavedReason ?? null);
  const blocked = reason !== null;

  return (
    <div className="flex flex-col gap-2" data-testid="share-actions">
      <div className="flex flex-wrap items-start gap-2">
        <CopyOrderButton
          text={copyOrderText(draft)}
          disabled={blocked}
          describedBy={blocked ? reasonId : undefined}
        />
        <ExportControl
          label="Export order"
          info={{ filters: "", count: lineCount, active: false }}
          build={() => ({ kind: "order_draft", draftId: draft.id })}
          run={runExport}
          disabled={blocked}
        />
      </div>
      {blocked ? (
        <p id={reasonId} className="text-muted-foreground text-xs">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
