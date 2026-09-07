import { describe, expect, it, vi } from "vitest";

import { requireLiveSession } from "./require-live-session";

describe("requireLiveSession", () => {
  it("returns null (proceed) when the session is live", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "profile-1" } } })),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, not the real client type
    } as any;

    const result = await requireLiveSession(supabase);
    expect(result).toBeNull();
  });

  it("returns a distinguishable sessionInvalid result when getUser() reports no user", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake
    } as any;

    const result = await requireLiveSession(supabase);
    // This is exactly what a deactivation's Auth ban produces on an
    // already-issued token, per Feature 017 -- the whole point of this
    // function existing is that every real-mode Server Action reacts to
    // this specific shape, not to error text alone.
    expect(result).toMatchObject({ ok: false, sessionInvalid: true });
  });
});
