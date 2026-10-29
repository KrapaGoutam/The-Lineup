import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECIPES_VIEW_STORAGE_KEY,
  readStoredViewPreference,
  useViewPreference,
} from "./use-view-preference";

describe("useViewPreference", () => {
  beforeEach(() => {
    // A successful write clears the session fallback left by storage-failure tests.
    const { result, unmount } = renderHook(() => useViewPreference());
    act(() => {
      result.current.setViewMode("list");
    });
    unmount();
    window.localStorage.clear();
  });

  it("defaults to list view when no preference is stored", () => {
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.viewMode).toBe("list");
    expect(result.current[0]).toBe("list");
  });

  it("persists picture mode to localStorage and updates state", () => {
    const { result } = renderHook(() => useViewPreference());
    act(() => {
      result.current.setViewMode("picture");
    });
    expect(result.current.viewMode).toBe("picture");
    expect(result.current[0]).toBe("picture");
    expect(window.localStorage.getItem(RECIPES_VIEW_STORAGE_KEY)).toBe(
      "picture",
    );
  });

  it("restores picture mode from localStorage on initial load", () => {
    window.localStorage.setItem(RECIPES_VIEW_STORAGE_KEY, "picture");
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.viewMode).toBe("picture");
  });

  it("persists list mode when switched back from picture", () => {
    window.localStorage.setItem(RECIPES_VIEW_STORAGE_KEY, "picture");
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.viewMode).toBe("picture");

    act(() => {
      result.current.setViewMode("list");
    });
    expect(result.current.viewMode).toBe("list");
    expect(window.localStorage.getItem(RECIPES_VIEW_STORAGE_KEY)).toBe("list");
  });

  it("falls back to list when stored value is invalid or corrupt", () => {
    window.localStorage.setItem(RECIPES_VIEW_STORAGE_KEY, "invalid-view-mode");
    expect(readStoredViewPreference()).toBe("list");
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.viewMode).toBe("list");
  });

  it("handles storage exceptions gracefully when reading or writing", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: Storage disabled");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: Storage disabled");
      });

    expect(readStoredViewPreference()).toBe("list");
    const { result } = renderHook(() => useViewPreference());
    expect(result.current.viewMode).toBe("list");

    expect(() => {
      act(() => {
        result.current.setViewMode("picture");
      });
    }).not.toThrow();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("still switches views for the session when storage is unavailable", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: Storage disabled");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: Storage disabled");
      });

    const { result } = renderHook(() => useViewPreference());
    expect(result.current.viewMode).toBe("list");

    act(() => {
      result.current.setViewMode("picture");
    });
    expect(result.current.viewMode).toBe("picture");

    act(() => {
      result.current.setViewMode("list");
    });
    expect(result.current.viewMode).toBe("list");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();

    // A later successful write clears the session fallback.
    act(() => {
      result.current.setViewMode("list");
    });
  });
});
