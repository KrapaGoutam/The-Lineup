"use client";
import { useEffect, useRef, useState } from "react";
import {
  getRecipeImageUrlsAction,
  getRecipeThumbUrlsAction,
} from "../actions/recipe-image-actions";
import { IMAGE_REFRESH_WINDOW, type ImageUrls } from "../domain/image-rules";
type ThumbWaiter = (urls: ImageUrls | null) => void;
type ThumbBatch = { waiters: Map<string, ThumbWaiter[]> };
const COALESCE_MS = 25;
const MAX_BATCH = 250;
const thumbBatches = new Map<string, ThumbBatch>();

async function flushThumbBatch(slug: string) {
  const batch = thumbBatches.get(slug);
  thumbBatches.delete(slug);
  if (!batch) return;
  const ids = [...batch.waiters.keys()];
  const settle = (id: string, urls: ImageUrls | null) =>
    batch.waiters.get(id)?.forEach((resolve) => resolve(urls));
  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    const chunk = ids.slice(i, i + MAX_BATCH);
    try {
      const result = await getRecipeThumbUrlsAction({
        restaurantSlug: slug,
        recipeIds: chunk,
      });
      for (const id of chunk) {
        const thumb = result.ok ? result.data.urls[id] : undefined;
        settle(
          id,
          thumb && result.ok
            ? { hero: null, thumb, expiresAt: result.data.expiresAt }
            : null,
        );
      }
    } catch {
      chunk.forEach((id) => settle(id, null));
    }
  }
}

/** Cards that ask within one tick share a single batched signing request. */
function requestThumbnail(slug: string, id: string) {
  return new Promise<ImageUrls | null>((resolve) => {
    let batch = thumbBatches.get(slug);
    if (!batch) {
      batch = { waiters: new Map() };
      thumbBatches.set(slug, batch);
      setTimeout(() => void flushThumbBatch(slug), COALESCE_MS);
    }
    batch.waiters.set(id, [...(batch.waiters.get(id) ?? []), resolve]);
  });
}

export function useRecipeImages({
  restaurantSlug,
  recipeId,
  initial,
  enabled = true,
  thumbnail = false,
}: {
  restaurantSlug: string;
  recipeId: string;
  initial?: ImageUrls;
  enabled?: boolean;
  thumbnail?: boolean;
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
        if (thumbnail) {
          const next = await requestThumbnail(restaurantSlug, recipeId);
          if (!active) return;
          if (next) {
            setUrls(next);
            setRevision((n) => n + 1);
            setFailed(false);
          } else setFailed(true);
          return;
        }
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
  }, [restaurantSlug, recipeId, enabled, initial, thumbnail]);
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
