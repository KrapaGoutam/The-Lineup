import { describe, expect, it } from "vitest";

import { friendlyDbMessage, GENERIC_FAILURE } from "./db-error";

describe("friendlyDbMessage", () => {
  it.each([
    ["22023", 'A vendor named "Faust" already exists.'],
    ["22023", "Reload the item and try again."],
    ["PT409", "Mona changed this at 4:12 PM."],
    ["42501", "You don't have access to Bar Inventory."],
    ["23505", 'A product named "Tito\'s" already exists for this vendor.'],
  ])("shows an authored %s sentence as written", (code, message) => {
    expect(friendlyDbMessage({ code, message })).toBe(message);
  });

  it.each([
    [
      "23503",
      'insert or update on table "inventory_stock" violates foreign key constraint "inventory_stock_updater_fk"',
    ],
    [
      "23505",
      'duplicate key value violates unique constraint "inventory_products_pkey"',
    ],
    [
      "23514",
      'new row for relation "inventory_stock" violates check constraint "inventory_stock_nonneg"',
    ],
    ["22P02", 'invalid input syntax for type uuid: "abc"'],
    ["40P01", "deadlock detected"],
    ["57014", "canceling statement due to statement timeout"],
    ["42501", 'permission denied for table "inventory_stock"'],
    ["22023", 'column "x" does not exist'],
  ])("never shows native database text (%s)", (code, message) => {
    expect(friendlyDbMessage({ code, message })).toBe(GENERIC_FAILURE);
  });

  it("an unknown or missing code, a missing or long message, is generic", () => {
    expect(friendlyDbMessage({ message: "Looks friendly" })).toBe(
      GENERIC_FAILURE,
    );
    expect(
      friendlyDbMessage({ code: "XX000", message: "Looks friendly" }),
    ).toBe(GENERIC_FAILURE);
    expect(friendlyDbMessage({ code: "22023" })).toBe(GENERIC_FAILURE);
    expect(friendlyDbMessage({ code: "22023", message: "x".repeat(200) })).toBe(
      GENERIC_FAILURE,
    );
    expect(friendlyDbMessage({})).toBe(GENERIC_FAILURE);
  });
});
