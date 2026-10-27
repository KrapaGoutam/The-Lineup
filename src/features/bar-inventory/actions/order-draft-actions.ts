"use server";

import { z } from "zod";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

import {
  getActiveOrderDrafts,
  getOrderDraftById,
  getSentOrderDraftsPage,
} from "../data/order-draft-data";
import { conflictFrom, type RpcError } from "../domain/db-conflict";
import { friendlyDbMessage } from "../domain/db-error";
import {
  isInventoryManager,
  type CatalogConflict,
} from "../domain/inventory-types";
import { ORDER_DRAFT_FILL_MODES } from "../domain/order-draft";
import type { SentDraftPage } from "../domain/order-draft-sent";
import type { OrderDraftView } from "../domain/order-draft-view";

/**
 * Vendor Order Drafts, server side. Every write is one `inventory_order_draft_*`
 * RPC (the only way to change a draft; authenticated clients have SELECT only)
 * followed by an authoritative re-read, so the screen never treats its own
 * optimistic state as truth. Authorization is the database's; the checks here
 * only give staff and signed-out callers a plain refusal.
 */

/** What Mark Sent reports: who sent the order, and when. */
export type MarkSentFacts = {
  sentByName: string | null;
  sentAt: string | null;
};

export type OrderDraftActionResult =
  | {
      ok: true;
      /** The location's active drafts as the database holds them now. */
      drafts: OrderDraftView[];
      /** The draft the call acted on (open: the draft to show). */
      draftId: string | null;
      /** False when the database found nothing to change (a true no-op). */
      changed: boolean;
      /** Mark Sent only: the sent facts (for a retry, those of the first send). */
      sent?: MarkSentFacts;
    }
  | {
      ok: false;
      error: string;
      conflict?: CatalogConflict;
      sessionInvalid?: true;
    };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const idSchema = z.string().uuid();
const versionSchema = z.number().int().min(1).max(2_000_000_000);
const draftRef = z.object({
  restaurantSlug: slugSchema,
  draftId: idSchema,
  expectedVersion: versionSchema,
});

const saveSchema = draftRef.extend({
  // Length limits are enforced by the database with plain-language messages;
  // these bounds only keep absurd payloads out.
  vendorNote: z.string().max(5000).nullable(),
  lines: z
    .array(
      z.object({
        productId: idSchema,
        orderQty: z.number().finite().nullable(),
        itemNote: z.string().max(5000).nullable(),
        included: z.boolean(),
      }),
    )
    .max(500),
});

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Caller = {
  supabase: Supabase;
  organizationId: string;
  locationId: string;
};

const BAD_REQUEST = { ok: false as const, error: "That request is invalid." };

async function resolveCaller(
  restaurantSlug: string,
): Promise<Caller | Extract<OrderDraftActionResult, { ok: false }>> {
  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const user = await getCurrentUser(restaurantSlug);
  if (!user) {
    return { ok: false, error: "You need to sign in to use Bar Inventory." };
  }
  if (!isInventoryManager(user.designation)) {
    return {
      ok: false,
      error: "Bar Inventory is not available for your role.",
    };
  }
  const location = await getPrimaryLocation(user.organizationId);
  if (!location) return { ok: false, error: "No location is set up yet." };
  return {
    supabase,
    organizationId: user.organizationId,
    locationId: location.id,
  };
}

const isFailure = (
  caller: Caller | Extract<OrderDraftActionResult, { ok: false }>,
): caller is Extract<OrderDraftActionResult, { ok: false }> => "ok" in caller;

async function finish(
  caller: Caller,
  failure: RpcError | null,
  outcome: { draftId: string | null; changed: boolean; sent?: MarkSentFacts },
): Promise<OrderDraftActionResult> {
  if (failure) {
    return {
      ok: false,
      error: friendlyDbMessage(failure),
      conflict: conflictFrom(failure),
    };
  }
  const drafts = await getActiveOrderDrafts(
    caller.organizationId,
    caller.locationId,
  );
  if (!drafts) {
    return { ok: false, error: "Order drafts could not be loaded." };
  }
  return { ok: true, drafts, ...outcome };
}

const changedFlag = (data: unknown): boolean =>
  typeof data === "object" &&
  data !== null &&
  (data as { changed?: unknown }).changed === true;

/** Authoritative read: on open, on focus, and after a refused (stale) write. */
export async function listOrderDraftsAction(input: {
  restaurantSlug: string;
}): Promise<OrderDraftActionResult> {
  const parsed = z.object({ restaurantSlug: slugSchema }).safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;
  return finish(caller, null, { draftId: null, changed: false });
}

/** Open the vendor's active draft, creating and seeding it if there is none. */
export async function openOrderDraftAction(input: {
  restaurantSlug: string;
  vendorId: string;
}): Promise<OrderDraftActionResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, vendorId: idSchema })
    .safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { data, error } = await caller.supabase.rpc(
    "inventory_order_draft_open",
    {
      p_organization_id: caller.organizationId,
      p_location_id: caller.locationId,
      p_vendor_id: parsed.data.vendorId,
    },
  );
  return finish(caller, error, {
    draftId: typeof data === "string" ? data : null,
    changed: true,
  });
}

/** One sparse save: the vendor note plus only the lines that changed. */
export async function saveOrderDraftAction(input: {
  restaurantSlug: string;
  draftId: string;
  expectedVersion: number;
  vendorNote: string | null;
  lines: {
    productId: string;
    orderQty: number | null;
    itemNote: string | null;
    included: boolean;
  }[];
}): Promise<OrderDraftActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { data, error } = await caller.supabase.rpc(
    "inventory_order_draft_save",
    {
      p_organization_id: caller.organizationId,
      p_location_id: caller.locationId,
      p_draft_id: parsed.data.draftId,
      p_expected_version: parsed.data.expectedVersion,
      // PostgREST needs every named argument; an empty note is stored as null.
      p_vendor_note: parsed.data.vendorNote ?? "",
      p_lines: parsed.data.lines.map((line) => ({
        product_id: line.productId,
        order_qty: line.orderQty,
        item_note: line.itemNote,
        included: line.included,
      })),
    },
  );
  return finish(caller, error, {
    draftId: parsed.data.draftId,
    changed: changedFlag(data),
  });
}

/** Fill from Suggestions: `empty_only`, or a confirmed `replace_all`. */
export async function fillOrderDraftAction(input: {
  restaurantSlug: string;
  draftId: string;
  expectedVersion: number;
  mode: (typeof ORDER_DRAFT_FILL_MODES)[number];
}): Promise<OrderDraftActionResult> {
  const parsed = draftRef
    .extend({ mode: z.enum(ORDER_DRAFT_FILL_MODES) })
    .safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { data, error } = await caller.supabase.rpc(
    "inventory_order_draft_fill",
    {
      p_organization_id: caller.organizationId,
      p_location_id: caller.locationId,
      p_draft_id: parsed.data.draftId,
      p_expected_version: parsed.data.expectedVersion,
      p_mode: parsed.data.mode,
    },
  );
  return finish(caller, error, {
    draftId: parsed.data.draftId,
    changed: changedFlag(data),
  });
}

/** Clear Draft: quantities, notes, Included and the vendor note only. */
export async function clearOrderDraftAction(input: {
  restaurantSlug: string;
  draftId: string;
  expectedVersion: number;
}): Promise<OrderDraftActionResult> {
  const parsed = draftRef.safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { data, error } = await caller.supabase.rpc(
    "inventory_order_draft_clear",
    {
      p_organization_id: caller.organizationId,
      p_location_id: caller.locationId,
      p_draft_id: parsed.data.draftId,
      p_expected_version: parsed.data.expectedVersion,
    },
  );
  return finish(caller, error, {
    draftId: parsed.data.draftId,
    changed: changedFlag(data),
  });
}

/** Update suggestions: re-stamp snapshots, append newly needed items. */
export async function syncOrderDraftAction(input: {
  restaurantSlug: string;
  draftId: string;
  expectedVersion: number;
}): Promise<OrderDraftActionResult> {
  const parsed = draftRef.safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { data, error } = await caller.supabase.rpc(
    "inventory_order_draft_sync",
    {
      p_organization_id: caller.organizationId,
      p_location_id: caller.locationId,
      p_draft_id: parsed.data.draftId,
      p_expected_version: parsed.data.expectedVersion,
    },
  );
  return finish(caller, error, {
    draftId: parsed.data.draftId,
    changed: changedFlag(data),
  });
}

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/**
 * Mark Sent: record that the manager sent or shared this order OUTSIDE the
 * app. One RPC against the version the manager reviewed; a stale version is
 * refused (`PT409`) so nobody sends an order they have not seen. It never
 * touches inventory. Repeating it on an already-Sent draft changes nothing and
 * returns the first send's facts.
 */
export async function markOrderDraftSentAction(input: {
  restaurantSlug: string;
  draftId: string;
  expectedVersion: number;
}): Promise<OrderDraftActionResult> {
  const parsed = draftRef.safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { data, error } = await caller.supabase.rpc(
    "inventory_order_draft_mark_sent",
    {
      p_organization_id: caller.organizationId,
      p_location_id: caller.locationId,
      p_draft_id: parsed.data.draftId,
      p_expected_version: parsed.data.expectedVersion,
    },
  );
  const facts =
    typeof data === "object" && data !== null
      ? (data as { sent_by?: unknown; sent_at?: unknown })
      : {};
  return finish(caller, error, {
    draftId: parsed.data.draftId,
    changed: changedFlag(data),
    sent: {
      sentByName: textOrNull(facts.sent_by),
      sentAt: textOrNull(facts.sent_at),
    },
  });
}

export type SentOrdersResult =
  | { ok: true; page: SentDraftPage }
  | { ok: false; error: string; sessionInvalid?: true };

/** One page of the Sent history, newest first. */
export async function listSentOrderDraftsAction(input: {
  restaurantSlug: string;
  page: number;
}): Promise<SentOrdersResult> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      page: z.number().int().min(0).max(100_000),
    })
    .safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const page = await getSentOrderDraftsPage(
    caller.organizationId,
    caller.locationId,
    parsed.data.page,
  );
  if (!page) return { ok: false, error: "Sent orders could not be loaded." };
  return { ok: true, page };
}

export type SentOrderResult =
  | { ok: true; draft: OrderDraftView }
  | { ok: false; error: string; sessionInvalid?: true };

/** One Sent order with its frozen lines, for the read-only view. */
export async function getSentOrderDraftAction(input: {
  restaurantSlug: string;
  draftId: string;
}): Promise<SentOrderResult> {
  const parsed = z
    .object({ restaurantSlug: slugSchema, draftId: idSchema })
    .safeParse(input);
  if (!parsed.success) return BAD_REQUEST;
  const caller = await resolveCaller(parsed.data.restaurantSlug);
  if (isFailure(caller)) return caller;

  const { draft, failed } = await getOrderDraftById(
    caller.organizationId,
    caller.locationId,
    parsed.data.draftId,
  );
  if (failed) return { ok: false, error: "That order could not be loaded." };
  if (!draft || draft.status !== "sent") {
    return { ok: false, error: "That sent order is not available." };
  }
  return { ok: true, draft };
}
