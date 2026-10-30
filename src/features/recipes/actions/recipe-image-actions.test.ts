// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  session: vi.fn(),
  user: vi.fn(),
  mutate: vi.fn(),
  sign: vi.fn(),
  signThumbs: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.session,
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("../data/recipe-image-data", () => ({
  mutateRecipeImageData: mocks.mutate,
  signRecipeImages: mocks.sign,
  signRecipeThumbnails: mocks.signThumbs,
}));
import {
  uploadRecipeImageAction,
  removeRecipeImageAction,
  getRecipeImageUrlsAction,
  getRecipeThumbUrlsAction,
} from "./recipe-image-actions";
const recipeId = "22222222-2222-4222-8222-222222222222";
const scope = { restaurantSlug: "the-monks", recipeId, expectedVersion: 5 };
function form(
  type = "image/jpeg",
  bytes: BlobPart = new Uint8Array([255, 216, 255]),
) {
  const f = new FormData();
  Object.entries(scope).forEach(([k, v]) => f.set(k, String(v)));
  f.set("hero", new Blob([bytes], { type }));
  f.set("thumb", new Blob([bytes], { type }));
  return f;
}
const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const client = { from: vi.fn(() => query) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue(client);
  mocks.session.mockResolvedValue(null);
  mocks.user.mockResolvedValue({
    organizationId: "server-org",
    designation: "manager",
  });
  mocks.mutate.mockResolvedValue({ ok: true, data: { version: 6 } });
  mocks.sign.mockResolvedValue({ hero: "signed", thumb: null, expiresAt: 123 });
  query.maybeSingle.mockResolvedValue({
    data: { image_path: "path", image_thumb_path: null },
  });
});
describe("image server actions", () => {
  it("uses resolved org and caller client", async () => {
    expect((await uploadRecipeImageAction(form())).ok).toBe(true);
    expect(mocks.mutate.mock.calls[0].slice(0, 4)).toEqual([
      client,
      "server-org",
      recipeId,
      5,
    ]);
  });
  it.each(["upload", "remove"])(
    "denies Staff %s before Storage",
    async (operation) => {
      mocks.user.mockResolvedValue({
        organizationId: "org",
        designation: "staff",
      });
      expect(
        await (operation === "upload"
          ? uploadRecipeImageAction(form())
          : removeRecipeImageAction(scope)),
      ).toMatchObject({ ok: false, kind: "permission" });
      expect(mocks.mutate).not.toHaveBeenCalled();
    },
  );
  it("requires live session", async () => {
    mocks.session.mockResolvedValue({
      ok: false,
      sessionInvalid: true,
      error: "Sign in",
    });
    expect(await uploadRecipeImageAction(form())).toMatchObject({
      sessionInvalid: true,
    });
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each([
    ["image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    ["image/jpeg", "fake jpeg"],
    ["image/webp", new Uint8Array(2 * 1024 * 1024 + 1)],
  ])("checks server MIME/bytes/size %s", async (type, bytes) => {
    expect(await uploadRecipeImageAction(form(type, bytes))).toMatchObject({
      ok: false,
      kind: "validation",
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("validates scope", async () => {
    expect(
      (await removeRecipeImageAction({ ...scope, recipeId: "../foreign" })).ok,
    ).toBe(false);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("removes with expected version", async () => {
    await removeRecipeImageAction(scope);
    expect(mocks.mutate).toHaveBeenCalledWith(
      client,
      "server-org",
      recipeId,
      5,
    );
  });
  it("permits Staff signed reads via own org query", async () => {
    mocks.user.mockResolvedValue({
      organizationId: "server-org",
      designation: "staff",
    });
    expect((await getRecipeImageUrlsAction(scope)).ok).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "server-org");
    expect(mocks.sign).toHaveBeenCalledWith(client, "server-org", recipeId, {
      image_path: "path",
      image_thumb_path: null,
    });
  });
  it.each(["staff", "manager"])(
    "does not sign inaccessible recipe for %s",
    async (designation) => {
      mocks.user.mockResolvedValue({ organizationId: "foreign", designation });
      query.maybeSingle.mockResolvedValue({ data: null });
      expect((await getRecipeImageUrlsAction(scope)).ok).toBe(false);
      expect(mocks.sign).not.toHaveBeenCalled();
    },
  );
  describe("batched thumbnail signing", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const batchQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(),
    };
    beforeEach(() => {
      client.from.mockReturnValue(batchQuery as unknown as typeof query);
      batchQuery.in.mockResolvedValue({
        data: [
          { id: recipeId, image_thumb_path: "p-thumb" },
          { id: other, image_thumb_path: null },
        ],
        error: null,
      });
      mocks.signThumbs.mockResolvedValue({
        urls: { [recipeId]: "signed-thumb" },
        expiresAt: 123,
      });
    });
    it("signs all requested thumbnails with one org-scoped read for Staff", async () => {
      mocks.user.mockResolvedValue({
        organizationId: "server-org",
        designation: "staff",
      });
      const result = await getRecipeThumbUrlsAction({
        restaurantSlug: "the-monks",
        recipeIds: [recipeId, other],
      });
      expect(result).toEqual({
        ok: true,
        data: { urls: { [recipeId]: "signed-thumb" }, expiresAt: 123 },
      });
      expect(batchQuery.eq).toHaveBeenCalledWith(
        "organization_id",
        "server-org",
      );
      expect(batchQuery.in).toHaveBeenCalledWith("id", [recipeId, other]);
      expect(mocks.signThumbs).toHaveBeenCalledTimes(1);
      expect(mocks.signThumbs.mock.calls[0][1]).toBe("server-org");
    });
    it("rejects forged ids, oversized batches and invalid slugs before any query", async () => {
      for (const input of [
        { restaurantSlug: "the-monks", recipeIds: ["../foreign"] },
        { restaurantSlug: "the-monks", recipeIds: [] },
        {
          restaurantSlug: "the-monks",
          recipeIds: Array.from({ length: 251 }, () => recipeId),
        },
        { restaurantSlug: "Bad Slug", recipeIds: [recipeId] },
      ])
        expect((await getRecipeThumbUrlsAction(input)).ok).toBe(false);
      expect(mocks.client).not.toHaveBeenCalled();
    });
    it("requires a live session and never signs on a read error", async () => {
      mocks.session.mockResolvedValue({
        ok: false,
        sessionInvalid: true,
        error: "Sign in",
      });
      expect(
        await getRecipeThumbUrlsAction({
          restaurantSlug: "the-monks",
          recipeIds: [recipeId],
        }),
      ).toMatchObject({ sessionInvalid: true });
      mocks.session.mockResolvedValue(null);
      batchQuery.in.mockResolvedValue({ data: null, error: { code: "x" } });
      expect(
        (
          await getRecipeThumbUrlsAction({
            restaurantSlug: "the-monks",
            recipeIds: [recipeId],
          })
        ).ok,
      ).toBe(false);
      expect(mocks.signThumbs).not.toHaveBeenCalled();
    });
  });
});
