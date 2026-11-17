"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Below this the Combined View flows naturally and the page may scroll. */
export const FILL_MIN_WIDTH = 1024;
/** A floor shorter than this is not worth squeezing into -- let the page scroll. */
const FILL_MIN_HEIGHT = 440;
/** Breathing room kept under the workspace. The page's own (larger) bottom padding is reclaimed. */
const BOTTOM_GAP = 12;

/**
 * V2.0.4: the Combined View's one-screen fit. On lg+ viewports the element is
 * given exactly the height left between its own top edge and the bottom of the
 * window (less the page's own bottom padding), measured from the real DOM, so
 * the app header / navigation / banners above it can change without a magic
 * number going stale. Returns `null` (no fixed height) on narrow viewports or
 * when there is too little room, where the layout falls back to natural flow.
 *
 * Re-measures after every render (cheap; state only changes when the number
 * does) and on resize / orientation change.
 */
export function useViewportFill<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [fit, setFit] = useState<{ height: number; reclaim: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    function measure() {
      const element = ref.current;
      if (
        !enabled ||
        !element ||
        typeof window === "undefined" ||
        window.innerWidth < FILL_MIN_WIDTH
      ) {
        setFit(null);
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;
      // The page's own bottom padding lives on some ancestor (the app's
      // <main>), not necessarily the direct parent: sum them all.
      let bottomPad = 0;
      for (
        let node = element.parentElement;
        node && node !== document.documentElement;
        node = node.parentElement
      ) {
        bottomPad +=
          Number.parseFloat(getComputedStyle(node).paddingBottom) || 0;
      }
      // Use the room under the workspace that the page's own bottom padding
      // would otherwise waste, keeping only a small gap, so the document is
      // exactly one viewport tall (no page scroll).
      const reclaim = Math.max(0, Math.round(bottomPad - BOTTOM_GAP));
      const available = Math.floor(window.innerHeight - top - BOTTOM_GAP);
      setFit((current) =>
        available >= FILL_MIN_HEIGHT
          ? current?.height === available && current.reclaim === reclaim
            ? current
            : { height: available, reclaim }
          : null,
      );
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  });

  return { ref, height: fit?.height ?? null, reclaim: fit?.reclaim ?? 0 };
}
