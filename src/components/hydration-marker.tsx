"use client";

import { useEffect } from "react";

export function ClientHydrationMarker() {
  useEffect(() => {
    document.body.setAttribute("data-hydrated", "true");
  }, []);

  return null;
}
