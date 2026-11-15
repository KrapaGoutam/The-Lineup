"use client";

import { publishContextEvent } from "@/features/context/components/context-sync-channel";

/** Cookies are committed when fetch resolves. A document request avoids retaining
 * the signed-out RSC tree or waiting for a particular profile prop to hydrate.
 * Only fixed same-origin destinations are accepted from the login response.
 */
export function completePinLogin(next: string) {
  if (next !== "/" && next !== "/auth/enroll")
    throw new Error("Invalid login destination.");
  publishContextEvent("session_changed");
  window.location.replace(next);
}
