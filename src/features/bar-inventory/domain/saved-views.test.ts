import { describe, expect, it } from "vitest";
import {
  applyView,
  captureView,
  hasExplicitInventoryState,
  normalizeLayout,
  readViewPayload,
  viewPayloadSchema,
} from "./saved-views";
import { EMPTY_TABLE_STATE, type TableState } from "./table-filters";
const columns = [
  { id: "name", type: "text" },
  { id: "vendor", type: "select" },
  { id: "onHand", type: "number" },
] as const;
describe("column layout", () => {
  it("deduplicates order, drops old columns, appends new columns, locks identity", () =>
    expect(
      normalizeLayout(
        ["name", "vendor", "onHand"],
        {
          order: ["onHand", "gone", "onHand"],
          hidden: ["name", "gone", "vendor"],
        },
        ["name"],
      ),
    ).toEqual({ order: ["onHand", "name", "vendor"], hidden: ["vendor"] }));
  it("ignores malformed lists", () =>
    expect(
      normalizeLayout(["name"], { order: null as never, hidden: {} as never }),
    ).toEqual({ order: ["name"], hidden: [] }));
});
describe("personal saved views", () => {
  it("round-trips search/filters/multisort/columns/archived", () => {
    const state: TableState = {
      search: "Beer",
      filters: {
        vendor: { type: "select", values: ["Del Papa"] },
        onHand: { type: "number", op: "lte", value: 5 },
      },
      sort: [
        { id: "vendor", dir: "asc" },
        { id: "onHand", dir: "desc" },
      ],
    };
    const payload = captureView(
      ["search", "filters", "sort", "hidden", "order", "showArchived"],
      state,
      { order: ["vendor", "name", "onHand"], hidden: ["onHand"] },
      true,
    );
    expect(viewPayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      readViewPayload(JSON.parse(JSON.stringify(payload)), columns),
    ).toEqual(payload);
  });
  it("partial views preserve state they do not own", () => {
    const current = {
      ...EMPTY_TABLE_STATE,
      search: "existing",
      hidden: ["vendor"],
      order: ["name", "vendor", "onHand"],
      showArchived: true,
    };
    const payload = captureView(
      ["filters"],
      {
        ...EMPTY_TABLE_STATE,
        filters: { name: { type: "text", op: "contains", value: "IPA" } },
      },
      { hidden: [], order: [] },
      false,
    );
    expect(applyView(current, payload)).toEqual({
      ...current,
      filters: payload.state.filters,
    });
  });
  it.each([null, [], {}, "corrupt", { version: 2, owns: [], state: {} }])(
    "fails safely on %j",
    (raw) => expect(readViewPayload(raw, columns)).toBeNull(),
  );
  it("drops removed filters/sorts and malformed filter values", () => {
    const raw = {
      version: 1,
      owns: ["filters", "sort", "order", "unknown"],
      state: {
        filters: {
          gone: { type: "text", op: "contains", value: "x" },
          name: { type: "number", value: "NaN" },
        },
        sort: [
          { id: "gone", dir: "asc" },
          { id: "name", dir: "asc" },
        ],
        order: ["gone", "onHand"],
      },
    };
    expect(readViewPayload(raw, columns)).toMatchObject({
      owns: ["filters", "sort", "order"],
      state: {
        filters: {},
        sort: [{ id: "name", dir: "asc" }],
        order: ["onHand", "name", "vendor"],
      },
    });
  });
  it("explicit dashboard filters take precedence over defaults", () => {
    expect(
      hasExplicitInventoryState("?tab=bar-inventory&inv.f.expiration=s:urgent"),
    ).toBe(true);
    expect(hasExplicitInventoryState("?tab=bar-inventory")).toBe(false);
  });
});
