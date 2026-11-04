import { afterEach, describe, expect, it, vi } from "vitest";

import { requestSignOut, settleSignOut } from "./client-sign-out";

afterEach(() => vi.unstubAllGlobals());

describe("client sign-out ordering (V2-003.004)", () => {
  it("PERSIST-35: a sign-in that awaits settleSignOut() can never be overtaken by a delayed sign-out", async () => {
    const order: string[] = [];
    let finishSignOut: () => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/signout") {
          await new Promise<void>((resolve) => {
            finishSignOut = resolve;
          });
          order.push("signout-done");
        } else {
          order.push("signin-sent");
        }
        return new Response("{}");
      }),
    );

    void requestSignOut(); // forced sign-out: fire and forget
    const signIn = (async () => {
      await settleSignOut();
      await fetch("/api/auth/passcode", { method: "POST" });
    })();

    await Promise.resolve();
    expect(order).toEqual([]); // sign-in is held back
    finishSignOut();
    await signIn;
    expect(order).toEqual(["signout-done", "signin-sent"]);
  });

  it("settleSignOut resolves immediately when nothing is in flight and survives a failed sign-out request", async () => {
    await expect(settleSignOut()).resolves.toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(requestSignOut()).resolves.toBeUndefined();
    await expect(settleSignOut()).resolves.toBeUndefined();
  });
});
