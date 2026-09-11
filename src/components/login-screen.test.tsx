import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginScreen } from "./login-screen";

describe("LoginScreen numeric keypad (Feature 013)", () => {
  it("tapping digits fills the passcode field, capped at 4 digits", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 6" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 8" }));
    expect(input).toHaveValue("2468");

    // A 5th tap is a no-op, matching the typed-input's existing cap.
    await userEvent.click(screen.getByRole("button", { name: "Digit 1" }));
    expect(input).toHaveValue("2468");
  });

  it("backspace removes exactly one digit", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Backspace" }));
    expect(input).toHaveValue("2");
  });

  it("typing and tapping write to the same passcode state", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.type(input, "24");
    await userEvent.click(screen.getByRole("button", { name: "Digit 6" }));
    expect(input).toHaveValue("246");
  });

  it("the typed input stays fully usable alongside the keypad", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.click(screen.getByRole("button", { name: "Digit 1" }));
    await userEvent.type(input, "357");
    expect(input).toHaveValue("1357");
  });
});

describe("LoginScreen PIN hardening (bug fix)", () => {
  it("masks the passcode as it's typed", () => {
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={vi.fn()} />,
    );
    expect(screen.getByLabelText("Restaurant passcode")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("auto-submits the instant a valid 4th digit is typed, with no separate submit step", async () => {
    const onSignIn = vi.fn();
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={onSignIn} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    // "2468" is the demo manager passcode (src/lib/demo-data.ts).
    await userEvent.type(input, "2468");
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("auto-submits the instant a valid 4th digit is tapped on the virtual keypad", async () => {
    const onSignIn = vi.fn();
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={onSignIn} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 6" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 8" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("an unrecognized passcode shows an error and clears the field, ready for another attempt", async () => {
    const onSignIn = vi.fn();
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={onSignIn} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.type(input, "0000");
    expect(
      await screen.findByText("Passcode not recognized. Check it or register."),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("the keypad's Enter button submits the form, showing the same validation as a short passcode", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="the-monks" onSignIn={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(
      await screen.findByText("Enter your 4-digit restaurant passcode."),
    ).toBeInTheDocument();
  });

  it("keypad buttons and the typed input are disabled while a real sign-in request is pending", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LoginScreen
        demoMode={false}
        restaurantSlug="the-monks"
        onSignIn={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.type(input, "2468");

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Digit 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Backspace" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enter" })).toBeDisabled();

    resolveFetch(
      new Response(JSON.stringify({ error: "Unable to sign in." }), {
        status: 401,
      }),
    );
    await screen.findByText("Unable to sign in.");
    vi.unstubAllGlobals();
  });
});
