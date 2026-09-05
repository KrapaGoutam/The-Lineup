import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginScreen } from "./login-screen";

describe("LoginScreen numeric keypad (Feature 013)", () => {
  it("tapping digits fills the passcode field, capped at 4 digits", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="autumn-house" onSignIn={vi.fn()} />,
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
      <LoginScreen demoMode restaurantSlug="autumn-house" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Digit 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Backspace" }));
    expect(input).toHaveValue("2");
  });

  it("typing and tapping write to the same passcode state", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="autumn-house" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.type(input, "24");
    await userEvent.click(screen.getByRole("button", { name: "Digit 6" }));
    expect(input).toHaveValue("246");
  });

  it("the typed input stays fully usable alongside the keypad", async () => {
    render(
      <LoginScreen demoMode restaurantSlug="autumn-house" onSignIn={vi.fn()} />,
    );
    const input = screen.getByLabelText("Restaurant passcode");
    await userEvent.click(screen.getByRole("button", { name: "Digit 1" }));
    await userEvent.type(input, "357");
    expect(input).toHaveValue("1357");
  });
});
