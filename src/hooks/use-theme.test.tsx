import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_STORAGE_KEY, useTheme } from "./use-theme";

function mockMatchMedia(prefersLight: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("light") ? prefersLight : !prefersLight,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("resolves to the OS preference when nothing is stored (light)", async () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolved).toBe("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("resolves to the OS preference when nothing is stored (dark)", async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolved).toBe("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggle persists an explicit choice, overriding the OS preference", async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolved).toBe("dark"));

    act(() => result.current.toggle());

    await waitFor(() => expect(result.current.resolved).toBe("light"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("a stored explicit choice wins over the OS preference on next mount", async () => {
    mockMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolved).toBe("dark"));
  });

  it("setPreference('system') clears the stored override", async () => {
    mockMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolved).toBe("dark"));

    act(() => result.current.setPreference("system"));

    await waitFor(() => expect(result.current.resolved).toBe("light"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
