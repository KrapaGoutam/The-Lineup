import "server-only";

import { createHmac } from "node:crypto";

function getPepper() {
  const pepper = process.env.APP_PIN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("APP_PIN_PEPPER must contain at least 32 characters.");
  }
  return pepper;
}

export function createPasscodeLocator(
  organizationId: string,
  passcode: string,
) {
  return createHmac("sha256", getPepper())
    .update(`${organizationId}:${passcode}`)
    .digest("hex");
}

export function createRequestFingerprint(value: string) {
  return createHmac("sha256", getPepper())
    .update(`request:${value}`)
    .digest("hex");
}
