import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./login-screen";
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pin-login-navigation", () => ({ completePinLogin: navigate }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("universal PIN entry", () => {
  it("submits PIN only, then navigates without waiting for a matching profile prop", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ next: "/" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    const signIn = vi.fn();
    render(
      <LoginScreen demoMode={false} restaurantSlug="" onSignIn={signIn} />,
    );
    expect(
      screen.getByRole("heading", { name: "Enter your 4-digit PIN" }),
    ).toBeVisible();
    expect(screen.queryByText("Not registered? Create an account")).toBeNull();
    expect(screen.getByLabelText("Personal PIN")).toHaveAttribute(
      "type",
      "password",
    );
    await userEvent.type(screen.getByLabelText("Personal PIN"), "0007");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      passcode: "0007",
    });
    expect(signIn).not.toHaveBeenCalled();
  });
  it("generic rejection clears the four digits and allows another attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "PIN not recognized." }), {
            status: 401,
          }),
      ),
    );
    render(
      <LoginScreen demoMode={false} restaurantSlug="" onSignIn={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText("Personal PIN"), "0007");
    await waitFor(() =>
      expect(screen.getByLabelText("Personal PIN")).toHaveValue(""),
    );
    expect(screen.getByText("PIN not recognized.")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });
});
