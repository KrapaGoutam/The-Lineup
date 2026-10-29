"use client";
import { useEffect, useRef, useState } from "react";
import { getRecipeImageUrlsAction } from "../actions/recipe-image-actions";
import { IMAGE_REFRESH_WINDOW, type ImageUrls } from "../domain/image-rules";
export function useRecipeImages({
  restaurantSlug,
  recipeId,
  initial,
  enabled = true,
}: {
  restaurantSlug: string;
  recipeId: string;
  initial?: ImageUrls;
  enabled?: boolean;
}) {
  const [urls, setUrls] = useState<ImageUrls | undefined>(initial);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useRef(false);
  const terminal = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!enabled || pending || terminal.current) return;
      pending = true;
      try {
        const result = await getRecipeImageUrlsAction({
          restaurantSlug,
          recipeId,
        });
        if (!active) return;
        if (result.ok) {
          setUrls(result.data);
          setRevision((n) => n + 1);
          setFailed(false);
        } else setFailed(true);
      } catch {
        if (active) setFailed(true);
      } finally {
        pending = false;
      }
    };
    refreshRef.current = refresh;
    if (enabled && !initial) void refresh();
    return () => {
      active = false;
    };
  }, [restaurantSlug, recipeId, enabled, initial]);
  useEffect(() => {
    if (!enabled || !urls) return;
    // Retry a failed scheduled refresh after a minute, never a zero-delay loop.
    const delay = Math.max(
      1000,
      urls.expiresAt - Date.now() - IMAGE_REFRESH_WINDOW,
    );
    const timer = setTimeout(
      () => void refreshRef.current(),
      failed ? Math.max(60000, delay) : delay,
    );
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        urls.expiresAt - Date.now() <= IMAGE_REFRESH_WINDOW
      )
        void refreshRef.current();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [urls, enabled, failed]);
  function onError() {
    if (!enabled || retry.current) {
      terminal.current = true;
      setFailed(true);
      return;
    }
    retry.current = true;
    void refreshRef.current();
  }
  return { urls, failed, onError, revision };
}
