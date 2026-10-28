import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { useRecipeImages } from "./use-recipe-images";
const sign = vi.hoisted(() => vi.fn());
vi.mock("../actions/recipe-image-actions", () => ({
  getRecipeImageUrlsAction: sign,
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
});
