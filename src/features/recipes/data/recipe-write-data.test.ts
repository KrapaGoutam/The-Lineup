import { describe, expect, it, vi } from "vitest";
import { recipeWriteError, saveRecipeData } from "./recipe-write-data";
import {
  newEditorState,
  serializeEditorState,
} from "../domain/recipe-editor-state";
describe("recipe write data", () => {
  it.each([
    ["22023", "validation"],
    ["23505", "duplicate"],
    ["PT409", "stale"],
    ["42501", "permission"],
    ["XX000", "unknown"],
  ])("maps %s without SQL internals", (code, kind) => {
    const result = recipeWriteError({
      code,
      message: "private.secret SQL details",
    });
    expect(result).toMatchObject({ ok: false, kind });
    expect(JSON.stringify(result)).not.toContain("private.secret");
  });
  it("retains the structured duplicate label and number field", () => {
    expect(
      recipeWriteError({
        code: "23505",
        details: JSON.stringify({
          field: "recipe_number",
          existing_label: "38 Cadillac Margarita",
        }),
      }),
    ).toMatchObject({
      field: "recipe_number",
      error: expect.stringContaining("38 Cadillac Margarita"),
    });
    expect(
      recipeWriteError({ code: "23505", details: "not JSON" }),
    ).toMatchObject({ kind: "duplicate" });
  });
  it("maps a known validation field", () => {
    expect(
      recipeWriteError({ code: "22023", message: "Invalid recipe_number" }),
    ).toMatchObject({ field: "recipe_number" });
  });
  it.each([null, "22222222-2222-4222-8222-222222222222"])(
    "normalizes a create/update response for %s",
    async (id) => {
      const data = {
        id: "22222222-2222-4222-8222-222222222222",
        slug: "sample",
        version: id ? 2 : 1,
        recipe_number: 38,
      };
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const client = { rpc } as unknown as Parameters<typeof saveRecipeData>[0];
      const payload = serializeEditorState(newEditorState("category", 38));
      expect(
        await saveRecipeData(client, "server-org", id, id ? 1 : null, payload),
      ).toEqual({ ok: true, data });
      expect(rpc).toHaveBeenCalledWith("bar_recipe_save", {
        p_organization_id: "server-org",
        p_recipe_id: id,
        p_expected_version: id ? 1 : null,
        p_payload: payload,
      });
    },
  );
  it("handles network failures and malformed success safely", async () => {
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret"))
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    const client = { rpc } as unknown as Parameters<typeof saveRecipeData>[0];
    const payload = serializeEditorState(newEditorState("category", 38));
    expect(
      await saveRecipeData(client, "org", null, null, payload),
    ).toMatchObject({ kind: "unknown" });
    expect(
      await saveRecipeData(client, "org", null, null, payload),
    ).toMatchObject({ kind: "unknown" });
    expect(
      await saveRecipeData(client, "org", null, null, payload),
    ).toMatchObject({ kind: "stale" });
  });
});
