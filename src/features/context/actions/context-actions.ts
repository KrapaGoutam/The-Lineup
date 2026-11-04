"use server";

import {
  clearActiveContext,
  selectActiveContext,
} from "@/features/context/data/context-persistence";
import type {
  ClearContextResult,
  SelectContextResult,
} from "@/features/context/data/context-persistence";

/**
 * V2-003.004 Server Actions (POST, framework origin protection applies).
 *
 * `setActiveContextAction` — the arguments are an UNTRUSTED selection request;
 * the server authenticates, verifies the pair with the canonical resolver and
 * only then writes the HttpOnly cookie. It returns the canonical destination
 * built from verified values.
 */
export async function setActiveContextAction(
  input: unknown,
): Promise<SelectContextResult> {
  return selectActiveContext(input);
}

/** Explicit recovery / workspace reset. Requires a verified session. */
export async function clearActiveContextAction(): Promise<ClearContextResult> {
  return clearActiveContext();
}
