import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { useRecipeImages } from "./use-recipe-images";
const sign = vi.hoisted(() => vi.fn());
const signThumbs = vi.hoisted(() => vi.fn());
vi.mock("../actions/recipe-image-actions", () => ({
  getRecipeImageUrlsAction: sign,
  getRecipeThumbUrlsAction: signThumbs,
}));
const urls = () => ({
  hero: "https://private.invalid/hero?token=signed",
  thumb: "https://private.invalid/thumb?token=signed",
  expiresAt: Date.now() + 3600000,
});
beforeEach(() => {
  vi.useFakeTimers();
  sign.mockReset();
  sign.mockImplementation(async () => ({ ok: true, data: urls() }));
  signThumbs.mockReset();
  signThumbs.mockImplementation(
    async ({ recipeIds }: { recipeIds: string[] }) => ({
      ok: true,
      data: {
        urls: Object.fromEntries(
          recipeIds.map((id) => [id, `https://private.invalid/${id}?token=t`]),
        ),
        expiresAt: Date.now() + 3600000,
      },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("signed URL lifecycle", () => {
  it("refreshes five minutes before expiry", async () => {
    const initial = urls();
    renderHook(() =>
      useRecipeImages({ restaurantSlug: "org", recipeId: "id", initial }),
    );
    await act(() => vi.advanceTimersByTimeAsync(3299999));
    expect(sign).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(sign).toHaveBeenCalledTimes(1);
  });
  it("refreshes when visible near expiry", async () => {
    const initial = { ...urls(), expiresAt: Date.now() + 200000 };
    renderHook(() =>
      useRecipeImages({ restaurantSlug: "org", recipeId: "id", initial }),
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(sign).toHaveBeenCalledTimes(1);
  });
  it("does not refresh early on visibility", async () => {
    const initial = urls();
    renderHook(() =>
      useRecipeImages({ restaurantSlug: "org", recipeId: "id", initial }),
    );
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(sign).not.toHaveBeenCalled();
  });
  it("retries an img error once, then remains placeholder", async () => {
    const initial = urls();
    const { result } = renderHook(() =>
      useRecipeImages({ restaurantSlug: "org", recipeId: "id", initial }),
    );
    await act(async () => result.current.onError());
    expect(sign).toHaveBeenCalledTimes(1);
    expect(result.current.revision).toBe(1);
    await act(async () => result.current.onError());
    expect(result.current.failed).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(3600000));
    expect(sign).toHaveBeenCalledTimes(1);
  });
  it("falls back on sign rejection without leaking errors", async () => {
    sign.mockRejectedValue(new Error("secret"));
    const { result } = renderHook(() =>
      useRecipeImages({ restaurantSlug: "org", recipeId: "id" }),
    );
    await act(async () => {});
    expect(result.current.failed).toBe(true);
  });
  it("never calls live action in demo/absent image", async () => {
    const { result } = renderHook(() =>
      useRecipeImages({
        restaurantSlug: "org",
        recipeId: "id",
        enabled: false,
      }),
    );
    await act(async () => result.current.onError());
    expect(sign).not.toHaveBeenCalled();
  });
  describe("thumbnail batching (STORAGE_PLAN S-9)", () => {
    const ids = ["a", "b", "c", "d", "e"];
    function mountCards() {
      return ids.map((recipeId) =>
        renderHook(() =>
          useRecipeImages({
            restaurantSlug: "org",
            recipeId,
            thumbnail: true,
          }),
        ),
      );
    }
    it("signs every mounted card in ONE batched request, never per card", async () => {
      const cards = mountCards();
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(signThumbs).toHaveBeenCalledTimes(1);
      expect(signThumbs.mock.calls[0][0]).toEqual({
        restaurantSlug: "org",
        recipeIds: ids,
      });
      expect(sign).not.toHaveBeenCalled();
      cards.forEach((card, i) => {
        expect(card.result.current.urls?.thumb).toBe(
          `https://private.invalid/${ids[i]}?token=t`,
        );
        expect(card.result.current.failed).toBe(false);
      });
    });
    it("refreshes all cards together with one batched request before expiry", async () => {
      mountCards();
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(signThumbs).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(3300000));
      expect(signThumbs).toHaveBeenCalledTimes(2);
      expect(signThumbs.mock.calls[1][0].recipeIds).toEqual(ids);
      expect(sign).not.toHaveBeenCalled();
    });
    it("shows the placeholder only for a card the batch could not sign", async () => {
      signThumbs.mockImplementation(
        async ({ recipeIds }: { recipeIds: string[] }) => ({
          ok: true,
          data: {
            urls: Object.fromEntries(
              recipeIds
                .filter((id) => id !== "c")
                .map((id) => [id, `https://private.invalid/${id}`]),
            ),
            expiresAt: Date.now() + 3600000,
          },
        }),
      );
      const cards = mountCards();
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(cards[2].result.current.failed).toBe(true);
      expect(cards[0].result.current.failed).toBe(false);
    });
    it("falls back without leaking errors when the batch rejects", async () => {
      signThumbs.mockRejectedValue(new Error("secret"));
      const cards = mountCards();
      await act(() => vi.advanceTimersByTimeAsync(100));
      cards.forEach((card) => expect(card.result.current.failed).toBe(true));
    });
  });
});
