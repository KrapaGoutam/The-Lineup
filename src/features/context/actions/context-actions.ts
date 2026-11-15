"use server";

import {
  clearActiveContext,
  selectActiveContext,
} from "@/features/context/data/context-persistence";
import type {
  ClearContextResult,
  SelectContextResult,
} from "@/features/context/data/context-persistence";
import { verifyWorkspaceContext } from "@/features/context/data/workspace-expectation";
import type { WorkspaceVerdict } from "@/features/context/domain/workspace-expectation";

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

/**
 * V2-003.005 — READ-ONLY stale-tab check. `input` is the workspace the tab is
 * showing (an untrusted assertion); the server resolves its own verified
 * context and reports whether they agree. It never writes the cookie and
 * returns no identifier, so it can neither switch nor reveal a context.
 */
export async function verifyWorkspaceContextAction(
  input: unknown,
): Promise<WorkspaceVerdict> {
  return verifyWorkspaceContext(input);
}
