import { isIP } from "node:net";

/** Vercel supplies this header at its ingress. Production outside Vercel has no
 * trusted IP attribution and shares the conservative unknown-client quota. */
export function trustedClientAddress(request: Request): string {
  const raw =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")
      : process.env.NODE_ENV === "production"
        ? null
        : request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip");
  const address = raw?.trim();
  const family = address ? isIP(address) : 0;
  if (!address || address.includes(",") || family === 0) return "unknown";
  return family === 6
    ? new URL(`http://[${address}]`).hostname.slice(1, -1)
    : address;
}
