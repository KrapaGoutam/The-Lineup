import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getKioskSessionSecret } from "./kiosk-crypto";

/**
 * Only Vercel's edge-supplied source is trusted. Self-hosting needs an explicit
 * trusted-proxy adapter; arbitrary forwarding headers and shared fallbacks are
 * not identities. Never persist a raw IP in the pairing attempt ledger.
 */
export function getTrustedClientIdentifier(
  headerList: Pick<Headers, "get">,
): string | null {
  if (process.env.VERCEL !== "1") return null;

  const ip = headerList.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) return null;

  const normalized = isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname : ip;
  return `kiosk-source:${createHmac("sha256", getKioskSessionSecret())
    .update(`kiosk-pairing-source:${normalized}`)
    .digest("hex")}`;
}
