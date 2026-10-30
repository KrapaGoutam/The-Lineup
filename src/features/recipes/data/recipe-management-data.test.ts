import { describe, expect, it, vi } from "vitest";
import {
  archiveRecipeData,
  categoryData,
  managementError,
} from "./recipe-management-data";
import type { CategoryCommand } from "../domain/recipe-management";
const id = "22222222-2222-4222-8222-222222222222";
function fixture(
  response: unknown = { data: { id, version: 2 }, error: null },
) {
  const rpc = vi.fn().mockResolvedValue(response);
  return {
    rpc,
    client: { rpc } as unknown as Parameters<typeof archiveRecipeData>[0],
  };
}
describe("management RPC data", () => {
  it.each([
    ["22023", "validation"],
    ["23505", "duplicate"],
    ["PT409", "stale"],
    ["42501", "permission"],
    ["XX000", "unknown"],
  ])("maps %s safely", (code, kind) =>
    expect(managementError({ code })).toMatchObject({ ok: false, kind }),
  );
  it.each([true, false])(
    "archives/restores with caller expected version: %s",
    async (archived) => {
      const { client, rpc } = fixture();
      expect(
        await archiveRecipeData(client, "org", id, 1, archived, id),
      ).toEqual({ ok: true, data: { id, version: 2 } });
      expect(rpc).toHaveBeenCalledExactlyOnceWith("bar_recipe_set_archived", {
        p_organization_id: "org",
        p_recipe_id: id,
        p_expected_version: 1,
        p_archived: archived,
        p_category_id: id,
      });
    },
  );
  it.each(["22023", "PT409", "42501", "XX000"])(
    "propagates archive %s without retry",
    async (code) => {
      const { client, rpc } = fixture({ error: { code } });
      expect(await archiveRecipeData(client, "org", id, 1, false)).toEqual(
        managementError({ code }),
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each<CategoryCommand>([
    { operation: "save", id: null, version: null, name: "Added" },
    { operation: "save", id, version: 1, name: "Renamed" },
    { operation: "active", id, version: 1, active: true },
    { operation: "active", id, version: 1, active: false },
    { operation: "reorder", ids: [id] },
  ])("calls category RPC for $operation", async (command) => {
    const { client, rpc } = fixture(
      command.operation === "reorder"
        ? { data: { count: 1 }, error: null }
        : undefined,
    );
    expect((await categoryData(client, "org", command)).ok).toBe(true);
    expect(rpc.mock.calls[0][0]).toBe(
      `bar_recipe_category_${command.operation === "active" ? "set_active" : command.operation}`,
    );
    expect(rpc.mock.calls[0][1].p_organization_id).toBe("org");
    if (command.operation !== "reorder")
      expect(rpc.mock.calls[0][1].p_expected_version).toBe(command.version);
  });
  it.each(["22023", "23505", "PT409", "42501"])(
    "maps category rejection %s",
    async (code) => {
      const { client } = fixture({ error: { code } });
      expect(
        await categoryData(client, "org", {
          operation: "active",
          id,
          version: 1,
          active: false,
        }),
      ).toEqual(managementError({ code }));
    },
  );
  it("handles network failures and malformed successes", async () => {
    const { client, rpc } = fixture({ data: {} });
    expect(await archiveRecipeData(client, "org", id, 1, true)).toMatchObject({
      kind: "unknown",
    });
    rpc.mockRejectedValue(new Error("secret"));
    expect(
      await categoryData(client, "org", {
        operation: "save",
        id: null,
        version: null,
        name: "Test",
      }),
    ).toMatchObject({ kind: "unknown" });
  });
});
