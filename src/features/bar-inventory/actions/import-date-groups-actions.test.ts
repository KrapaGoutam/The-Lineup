import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getInventoryActor: vi.fn(),
  requireLiveSession: vi.fn(),
  getCatalogSnapshot: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../data/inventory-actor", () => ({
  getInventoryActor: mocks.getInventoryActor,
}));
vi.mock("@/features/context/data/workspace-expectation", () => ({
  assertWorkspaceExpectation: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("../data/catalog-data", () => ({
  getCatalogSnapshot: mocks.getCatalogSnapshot,
}));
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: vi.fn(async () => []),
}));
vi.mock("@/lib/xlsx/read-node", () => ({ readWorkbookNode: vi.fn() }));

import type { Database } from "@/types/database.generated";

import { buildDemoCatalog } from "../domain/demo-catalog";
import type { DateLot } from "../domain/freshness";
import {
  buildDateGroupImportPlan,
  fingerprintDateGroupPlan,
  mapDateGroupHeaders,
} from "../domain/import-date-groups";
import type { CatalogSnapshot } from "../domain/inventory-types";
import { parseCsv } from "@/lib/csv/read";
import {
  commitDateGroupImportAction,
  previewDateGroupImportAction,
} from "./import-actions";

const ORG = "00000000-0000-4000-8000-0000000e6001";
const LOC = "00000000-0000-4000-8000-0000000e6002";
const REQUEST = "00000000-0000-4000-8000-0000000e6003";
const LOT = "00000000-0000-4000-8000-0000000e6004";

function snapshot(): CatalogSnapshot {
  const demo = buildDemoCatalog();
  const product = demo.products.find((p) => p.active)!;
  const lot: DateLot = {
    id: LOT,
    productId: product.id,
    quantity: 2,
    manufacture: { date: "2026-01-15", precision: "day" },
    expiration: { date: "2026-09-30", precision: "day" },
    notes: null,
    active: true,
    version: 3,
    updatedAt: "2026-10-01T00:00:00Z",
    updatedByName: null,
  };
  return { ...demo, dateLots: [lot], loadedAt: "2026-11-09T00:00:00Z" };
}

function csvFor(snap: CatalogSnapshot) {
  const product = snap.products.find((p) => p.active)!;
  const vendor = snap.vendors.find((v) => v.id === product.vendorId)!;
  const other = snap.products.filter((p) => p.active)[1];
  const otherVendor = snap.vendors.find((v) => v.id === other.vendorId)!;
  return [
    "Vendor,Name,Size,Unit,Date group ID,Dated quantity,Manufactured,Expires,Notes",
    // update the existing lot (quantity 2 -> 1 1/2)
    `${vendor.name},${product.name},,,${LOT},1 1/2,01/15/26,09/30/26,`,
    // create a brand-new group for a different product
    `${otherVendor.name},${other.name},,,,0.5,04/2026,,new group`,
    // a row error (unknown vendor): rejected, never imported
    "Nope Vendor,Nope,,,,1,01/01/26,,",
  ].join("\n");
}

function planOf(snap: CatalogSnapshot, csv: string) {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error);
  const header = mapDateGroupHeaders(parsed.header.cells);
  const plan = buildDateGroupImportPlan(parsed.rows, header, snap);
  return { plan, fingerprint: fingerprintDateGroupPlan(plan) };
}

const input = (csv: string, fingerprint: string, excluded: number[] = []) => ({
  restaurantSlug: "webster",
  csv,
  filename: "date-groups.csv",
  mapping: {},
  requestId: REQUEST,
  fingerprint,
  excluded,
  expectedContext: undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLiveSession.mockResolvedValue(null);
  mocks.getInventoryActor.mockResolvedValue({
    organizationId: ORG,
    scope: {
      organizationId: ORG,
      locationId: LOC,
      timeZone: "America/Chicago",
    },
    viewer: { profileId: "p1", name: "Manager", designation: "manager" },
  });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
});

describe("commitDateGroupImportAction is ONE atomic database call", () => {
  it("sends every approved row in a single RPC and never loops inventory_date_lot_save", async () => {
    const snap = snapshot();
    mocks.getCatalogSnapshot.mockResolvedValue(snap);
    const csv = csvFor(snap);
    const { fingerprint } = planOf(snap, csv);
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        created: 1,
        updated: 1,
        skipped: 0,
        rejected: 1,
        replayed: false,
      },
      error: null,
    });

    const result = await commitDateGroupImportAction(input(csv, fingerprint));

    expect(result).toEqual({
      ok: true,
      result: {
        created: 1,
        updated: 1,
        skipped: 0,
        errors: 1,
        replayed: false,
      },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("inventory_date_group_import_commit");
    expect(
      mocks.rpc.mock.calls.some(([n]) => n === "inventory_date_lot_save"),
    ).toBe(false);

    // Argument NAMES are exactly the generated schema's (PostgREST resolves by name).
    type Args =
      Database["public"]["Functions"]["inventory_date_group_import_commit"]["Args"];
    const expected: (keyof Args)[] = [
      "p_fingerprint",
      "p_filename",
      "p_location_id",
      "p_organization_id",
      "p_rejected",
      "p_request_id",
      "p_rows",
      "p_skipped",
    ];
    expect(Object.keys(args).sort()).toEqual([...expected].sort());
    // Authority comes from the SERVER-verified actor, never the request body.
    expect(args.p_organization_id).toBe(ORG);
    expect(args.p_location_id).toBe(LOC);
    expect(args.p_request_id).toBe(REQUEST);

    const [update, create] = args.p_rows;
    expect(update).toMatchObject({
      action: "update",
      date_group_id: LOT,
      expected_version: 3, // the version the reviewer previewed, not "whatever is current"
      quantity: 1.5,
      manufacture_date: "2026-01-15",
      manufacture_precision: "day",
      expiration_date: "2026-09-30",
      expiration_precision: "day",
    });
    expect(create).toMatchObject({
      action: "create",
      date_group_id: null,
      expected_version: null,
      quantity: 0.5,
      manufacture_date: "2026-04-01",
      manufacture_precision: "month",
      notes: "new group",
    });
    // The rejected (error) row never reaches the database.
    expect(args.p_rows).toHaveLength(2);
  });

  it("a database failure is reported as ONE failure with no per-row partial success", async () => {
    const snap = snapshot();
    mocks.getCatalogSnapshot.mockResolvedValue(snap);
    const csv = csvFor(snap);
    const { fingerprint } = planOf(snap, csv);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PT409",
        message: "Row 3: Someone else changed this date group.",
        details: null,
      },
    });
    const result = await commitDateGroupImportAction(input(csv, fingerprint));
    expect(result.ok).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    if (!result.ok) expect(result.error).toMatch(/Row 3/);
  });

  it("a retry that hits the receipt is reported as a replay, not a second import", async () => {
    const snap = snapshot();
    mocks.getCatalogSnapshot.mockResolvedValue(snap);
    const csv = csvFor(snap);
    const { fingerprint } = planOf(snap, csv);
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        created: 1,
        updated: 1,
        skipped: 0,
        rejected: 1,
        replayed: true,
      },
      error: null,
    });
    const result = await commitDateGroupImportAction(input(csv, fingerprint));
    expect(result).toMatchObject({ ok: true, result: { replayed: true } });
  });

  it("refuses a stale preview (the catalog changed after review) without calling the database", async () => {
    const snap = snapshot();
    const csv = csvFor(snap);
    const { fingerprint } = planOf(snap, csv);
    // Someone else edits the lot after the reviewer's preview: its version moves.
    const changed: CatalogSnapshot = {
      ...snap,
      dateLots: snap.dateLots!.map((l) => ({ ...l, version: l.version + 1 })),
    };
    mocks.getCatalogSnapshot.mockResolvedValue(changed);
    const result = await commitDateGroupImportAction(input(csv, fingerprint));
    expect(result).toMatchObject({ ok: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("honours excluded rows and reports accurate skipped/rejected counts", async () => {
    const snap = snapshot();
    mocks.getCatalogSnapshot.mockResolvedValue(snap);
    const csv = csvFor(snap);
    const { plan, fingerprint } = planOf(snap, csv);
    const updateRow = plan.rows.find((r) => r.action === "update")!;
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        created: 1,
        updated: 0,
        skipped: 1,
        rejected: 1,
        replayed: false,
      },
      error: null,
    });
    await commitDateGroupImportAction(
      input(csv, fingerprint, [updateRow.rowNumber]),
    );
    const [, args] = mocks.rpc.mock.calls[0];
    expect(args.p_rows).toHaveLength(1);
    expect(args.p_rows[0].action).toBe("create");
    expect(args.p_skipped).toBe(1);
    expect(args.p_rejected).toBe(1);
  });

  it("calls nothing when every row is excluded", async () => {
    const snap = snapshot();
    mocks.getCatalogSnapshot.mockResolvedValue(snap);
    const csv = csvFor(snap);
    const { plan, fingerprint } = planOf(snap, csv);
    const all = plan.rows.map((r) => r.rowNumber);
    const result = await commitDateGroupImportAction(
      input(csv, fingerprint, all),
    );
    expect(result).toMatchObject({ ok: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("is refused before any read for a caller who is not a manager of the verified branch", async () => {
    mocks.getInventoryActor.mockResolvedValue(null);
    const result = await commitDateGroupImportAction(input("a,b\n1,2", "dg_1"));
    expect(result).toMatchObject({ ok: false });
    expect(mocks.getCatalogSnapshot).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preview is read-only: it never calls an RPC", async () => {
    const snap = snapshot();
    mocks.getCatalogSnapshot.mockResolvedValue(snap);
    const result = await previewDateGroupImportAction({
      restaurantSlug: "webster",
      csv: csvFor(snap),
      mapping: {},
      expectedContext: undefined,
    });
    expect(result.ok).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
