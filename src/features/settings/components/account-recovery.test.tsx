import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TeamMember } from "@/lib/demo-data";
import type { SignedInUser } from "@/components/login-screen";
import { AccountRecovery } from "./account-recovery";
const team: TeamMember[] = [
  {
    id: "staff",
    name: "Staff",
    shortName: "S",
    role: "server",
    designation: "staff",
    color: "",
  },
  {
    id: "manager",
    name: "Manager",
    shortName: "M",
    role: "manager",
    designation: "manager",
    color: "",
  },
  {
    id: "inactive",
    name: "Inactive",
    shortName: "I",
    role: "server",
    designation: "staff",
    active: false,
    color: "",
  },
];
function actor(designation: SignedInUser["designation"]): SignedInUser {
  return {
    profileId: "actor",
    name: "Actor",
    role:
      designation === "owner"
        ? "owner"
        : designation === "staff"
          ? "server"
          : "manager",
    designation,
    organizationId: "org",
  };
}
describe("Settings account recovery independent of Team", () => {
  it("uses the existing dialog, reason validation and reset callback", async () => {
    const reset = vi.fn().mockResolvedValue({ ok: true, passcode: "1098" });
    render(
      <AccountRecovery
        user={actor("owner")}
        team={team}
        onResetPasscode={reset}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset Staff's passcode" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset passcode" }),
    );
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 3 characters/)).toBeVisible();
    await userEvent.type(screen.getByLabelText("Reason"), "Forgot passcode");
    await userEvent.click(
      screen.getByRole("button", { name: "Reset passcode" }),
    );
    expect(reset).toHaveBeenCalledWith({
      targetProfileId: "staff",
      reason: "Forgot passcode",
      newPasscode: undefined,
    });
    expect(await screen.findByText(/Write this down now/)).toBeVisible();
  });
  it("manager sees only active permitted targets", () => {
    render(
      <AccountRecovery
        user={actor("manager")}
        team={team}
        onResetPasscode={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Reset Staff's passcode" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Reset Manager's passcode" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reset Inactive's passcode" }),
    ).toBeNull();
  });
  it.each(["assistant_manager", "staff"] as const)(
    "%s receives no recovery controls",
    (designation) => {
      render(
        <AccountRecovery
          user={actor(designation)}
          team={team}
          onResetPasscode={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("heading", { name: "Staff / Account Recovery" }),
      ).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
  it("shows server refusal without reporting success", async () => {
    render(
      <AccountRecovery
        user={actor("owner")}
        team={team}
        onResetPasscode={vi
          .fn()
          .mockResolvedValue({ ok: false, error: "Not permitted" })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset Staff's passcode" }),
    );
    await userEvent.type(screen.getByLabelText("Reason"), "Forgot passcode");
    await userEvent.click(
      screen.getByRole("button", { name: "Reset passcode" }),
    );
    expect(await screen.findByText("Not permitted")).toBeVisible();
    expect(screen.queryByText(/Write this down now/)).toBeNull();
  });
});
